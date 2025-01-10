// prisma.extensions.ts
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Shape of a single bulk-update item:
 *  - `where`: An object with the compound unique fields
 *  - `data`: Partial data to update in the matched row
 */
type BulkUpdateCompoundWhereRow<T> = {
  where: Partial<Record<keyof T, any>>;
  data: Partial<T>;
};

const prisma = new PrismaClient();

export const extendedPrisma = prisma.$extends({
  model: {
    $allModels: {
      /**
       * Update multiple rows in one SQL statement, with each row specifying its own
       * compound `where` object.
       *
       * @param tableName The DB table to update (e.g. "User")
       * @param rows      Array of objects, each with `where` (compound unique) + `data` to update
       */
      async bulkUpdateCompoundWhere<T>(
        rows: BulkUpdateCompoundWhereRow<T>[]
      ): Promise<void> {
        if (rows.length === 0) return;
        const context = Prisma.getExtensionContext(this);

        // 1. Identify all unique columns from the first row’s `where`.
        const uniqueColumns = Object.keys(rows[0].where);
        // (Optional) Validate all rows have exactly the same set of `where` fields if needed.
        // for (const row of rows) { /* check row.where has the same keys as uniqueColumns */ }

        // 2. Collect a union of all data columns across every row.
        const allDataColumns = new Set<keyof T>();
        for (const row of rows) {
          Object.keys(row.data).forEach((col) =>
            allDataColumns.add(col as keyof T)
          );
        }

        if (allDataColumns.size === 0) return; // nothing to update

        // 3. Build the SET clauses for each data column, using a CASE expression.
        //    Example:
        //      "colName" = CASE
        //         WHEN (unique1 = X AND unique2 = Y) THEN newValue
        //         WHEN ...
        //         ELSE "colName"
        //      END
        const setClauses = [...allDataColumns].map((col) => {
          const cases = rows
            .filter((row) => row.data[col] !== undefined)
            .map((row) => {
              const andClause = uniqueColumns
                .map(
                  (uniqueKey) =>
                    `"${uniqueKey}" = '${row.where[uniqueKey as keyof T]}'`
                )
                .join(" AND ");
              const value =
                row.data[col as keyof typeof row.data] === null
                  ? "NULL"
                  : `'${row.data[col as keyof typeof row.data]}'`;
              return `WHEN (${andClause}) THEN ${value}`;
            })
            .join(" ");
          return `"${String(col)}" = CASE ${cases} ELSE "${String(col)}" END`;
        });

        // 4. Build the WHERE compound IN (...) clause:
        //    WHERE (unique1, unique2) IN ((val11, val12), (val21, val22), ...)
        //    For each row, we construct a tuple of its unique values.
        const whereColumns = uniqueColumns.map((key) => `"${key}"`).join(",");
        const whereTuples = rows
          .map((row) => {
            const values = uniqueColumns
              .map((key) => `'${row.where[key as keyof T]}'`)
              .join(",");
            return `(${values})`;
          })
          .join(",");

        // 5. Execute the single raw UPDATE statement.
        await prisma.$executeRawUnsafe(`
        UPDATE "${context.$name}"
        SET ${setClauses.join(", ")}
        WHERE (${whereColumns}) IN (${whereTuples});
      `);
      },
    },
  },
});

/**
 * This file contains a custom extension for Prisma Client that adds a new method
 * `bulkUpdateCompoundWhere` to all models. This method allows you to update multiple
 * rows in a single SQL statement, with each row specifying its own compound `where`
 * object.
 * @author @tupe12334
 *
 */
import { PrismaClient, Prisma } from "@prisma/client";

/**
 * Shape of a single bulk-update item:
 *  - `where`: An object with the compound unique fields
 *  - `data`: Partial data to update in the matched row
 */
type BulkUpdateCompoundWhereRow<T> = {
  where: Prisma.Args<T, "findUnique">["where"];
  data: Prisma.Args<T, "update">["data"];
};

const prisma = new PrismaClient();

export const extendedPrisma = prisma.$extends({
  name: "bulkUpdateCompoundWhere",
  model: {
    $allModels: {
      /**
       * Update multiple rows in one SQL statement, with each row specifying its own
       * compound `where` object.
       *
       * @template T The type of the model being updated.
       * @param {BulkUpdateCompoundWhereRow<T>[]} rows - Array of objects, each with `where` (compound unique) and `data` to update.
       * @returns {Promise<void>} A promise that resolves when the update is complete.
       */
      async bulkUpdateCompoundWhere<T>(
        this: T,
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
                .map((uniqueKey) => {
                  const value = row.where[uniqueKey as keyof T];
                  if (typeof value === "object") {
                    return Object.entries(value)
                      .map(([key, val]) => `"${key}" = '${val}'`)
                      .join(" AND ");
                  }
                  return `"${uniqueKey}" = '${value}'`;
                })
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
        const whereColumns = uniqueColumns
          .map((key) => {
            if (typeof rows[0].where[key as keyof T] === "object") {
              return Object.keys(rows[0].where[key as keyof T])
                .map((subKey) => `"${subKey}"`)
                .join(",");
            }
            return `"${key}"`;
          })
          .join(",");
        const whereTuples = rows
          .map((row) => {
            const values = uniqueColumns
              .map((key) => {
                const value = row.where[key as keyof T];
                if (typeof value === "object") {
                  return Object.values(value)
                    .map((val) => `'${val}'`)
                    .join(",");
                }
                return `'${value}'`;
              })
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

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
 * @template T The type of the model being updated.
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

        // Parameterized AND-ed WHERE condition for a single row's compound
        // `where`, e.g. "unique1" = $1 AND "unique2" = $2.
        const whereConditionForRow = (row: BulkUpdateCompoundWhereRow<T>) =>
          Prisma.join(
            uniqueColumns.flatMap((uniqueKey) => {
              const value = row.where[uniqueKey as keyof T];
              if (typeof value === "object" && value !== null) {
                return Object.entries(value).map(
                  ([key, val]) =>
                    Prisma.sql`${Prisma.raw(`"${key}"`)} = ${val}`
                );
              }
              return [Prisma.sql`${Prisma.raw(`"${uniqueKey}"`)} = ${value}`];
            }),
            " AND "
          );

        // 3. Build the SET clauses for each data column, using a CASE expression.
        //    Example:
        //      "colName" = CASE
        //         WHEN (unique1 = $1 AND unique2 = $2) THEN $3
        //         WHEN ...
        //         ELSE "colName"
        //      END
        const setClauses = [...allDataColumns].map((col) => {
          const cases = rows
            .filter((row) => row.data[col] !== undefined)
            .map((row) => {
              const value = row.data[col as keyof typeof row.data];
              return Prisma.sql`WHEN (${whereConditionForRow(row)}) THEN ${value}`;
            });
          const columnRef = Prisma.raw(`"${String(col)}"`);
          return Prisma.sql`${columnRef} = CASE ${Prisma.join(cases, " ")} ELSE ${columnRef} END`;
        });

        // 4. Build the WHERE compound IN (...) clause:
        //    WHERE (unique1, unique2) IN ((val11, val12), (val21, val22), ...)
        //    For each row, we construct a tuple of its unique values.
        const whereColumns = Prisma.join(
          uniqueColumns.flatMap((key) => {
            const sample = rows[0].where[key as keyof T];
            if (typeof sample === "object" && sample !== null) {
              return Object.keys(sample).map(
                (subKey) => Prisma.raw(`"${subKey}"`)
              );
            }
            return [Prisma.raw(`"${key}"`)];
          }),
          ","
        );
        const whereTuples = Prisma.join(
          rows.map((row) => {
            const values = uniqueColumns.flatMap((key) => {
              const value = row.where[key as keyof T];
              if (typeof value === "object" && value !== null) {
                return Object.values(value);
              }
              return [value];
            });
            return Prisma.sql`(${Prisma.join(values)})`;
          }),
          ","
        );

        // 5. Execute the single parameterized UPDATE statement.
        await prisma.$executeRaw(
          Prisma.sql`UPDATE ${Prisma.raw(`"${context.$name}"`)} SET ${Prisma.join(setClauses, ", ")} WHERE (${whereColumns}) IN (${whereTuples})`
        );
      },
    },
  },
});

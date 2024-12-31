// prisma.extensions.ts
import { PrismaClient, Prisma } from "@prisma/client";
import { sql, join } from "@prisma/client/runtime"; // Add this line

/**
 * Shape of a single bulk-update item:
 *  - `where`: An object with the compound unique fields
 *  - `data`: Partial data to update in the matched row
 */
type BulkUpdateCompoundWhereRow<T> = {
  where: { [k: string]: any };
  data: Partial<T>;
};

const prisma = new PrismaClient();

export const extendedPrisma = prisma.$extends({
  name: "bulkUpdateCompoundWhere",
  client: {
    /**
     * Update multiple rows in one SQL statement, with each row specifying its own
     * compound `where` object.
     *
     * @param tableName The DB table to update (e.g. "User")
     * @param rows      Array of objects, each with `where` (compound unique) + `data` to update
     */
    async bulkUpdateCompoundWhere<T>(
      tableName: string,
      rows: BulkUpdateCompoundWhereRow<T>[]
    ): Promise<void> {
      if (rows.length === 0) return;

      // 1. Identify all unique columns from the first row’s `where`.
      const uniqueColumns = Object.keys(rows[0].where);
      // (Optional) Validate all rows have exactly the same set of `where` fields if needed.
      // for (const row of rows) { /* check row.where has the same keys as uniqueColumns */ }

      // 2. Collect a union of all data columns across every row.
      const allDataColumns = new Set<string>();
      for (const row of rows) {
        Object.keys(row.data).forEach((col) => allDataColumns.add(col));
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
        // Build all WHEN conditions for this single column
        const cases = rows
          // Only build a WHEN if the row actually has `data[col]` defined
          .filter((row) => row.data[col] !== undefined)
          .map((row) => {
            const andClause = join(
              uniqueColumns.map(
                (uniqueKey) =>
                  sql`"${Prisma.raw(uniqueKey)}" = ${row.where[uniqueKey]}`
              ),
              sql` AND `
            );
            return sql`WHEN (${andClause}) THEN ${
              row.data[col as keyof typeof row.data]
            }`;
          });

        return sql`
          "${Prisma.raw(col)}" = CASE
            ${join(cases, sql` `)}
            ELSE "${Prisma.raw(col)}"
          END
        `;
      });

      // 4. Build the WHERE compound IN (...) clause:
      //    WHERE (unique1, unique2) IN ((val11, val12), (val21, val22), ...)
      //    For each row, we construct a tuple of its unique values.
      const whereColumns = join(
        uniqueColumns.map((key) => sql`"${Prisma.raw(key)}"`),
        sql`,`
      );

      const whereTuples = join(
        rows.map((row) => {
          const values = join(
            uniqueColumns.map((key) => sql`${row.where[key]}`),
            sql`,`
          );
          return sql`(${values})`;
        }),
        sql`,`
      );

      // 5. Execute the single raw UPDATE statement.
      await this.$executeRaw`
        UPDATE "${Prisma.raw(tableName)}"
        SET ${join(setClauses, sql`, `)}
        WHERE (${whereColumns}) IN (${whereTuples});
      `;
    },
  },
});

// Example usage:
(async () => {
  // Suppose you have a "User" table with a compound unique key on (orgId, email).
  // For each row, you provide `where: { orgId, email }` + the `data` to update.
  await extendedPrisma.bulkUpdateCompoundWhere("User", [
    {
      where: { orgId: 1, email: "alice@corp.com" },
      data: { name: "Alice Updated", status: "ACTIVE" },
    },
    {
      where: { orgId: 1, email: "bob@corp.com" },
      data: { status: "INACTIVE" },
    },
  ]);
})();

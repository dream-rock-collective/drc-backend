import type { Sql, TransactionSql } from "postgres";

export const up = async (sql: Sql | TransactionSql): Promise<void> => {
  await sql`
    ALTER TABLE allocations
      ADD COLUMN format TEXT NOT NULL DEFAULT 'dollars'
      CHECK (format IN ('dollars', 'percentage'))
  `;
};

import type { Sql, TransactionSql } from "postgres";

export const up = async (sql: Sql | TransactionSql): Promise<void> => {
  await sql`
    ALTER TABLE registrations
      ALTER COLUMN address DROP NOT NULL
  `;
};

import type { Sql, TransactionSql } from "postgres";

export const up = async (sql: Sql | TransactionSql): Promise<void> => {
  await sql`
    ALTER TABLE registrations
      RENAME COLUMN stripe_payment_id TO stripe_payment_intent_id
  `;
};

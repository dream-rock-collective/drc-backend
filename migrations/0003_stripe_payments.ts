import type { Sql, TransactionSql } from "postgres";

export const up = async (sql: Sql | TransactionSql): Promise<void> => {
  await sql`
    ALTER TABLE registrations
      ADD COLUMN stripe_customer_id TEXT,
      ADD COLUMN stripe_subscription_id TEXT,
      ADD COLUMN plan TEXT CHECK (plan IN ('once', 'monthly', 'yearly')),
      ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (payment_status IN ('pending', 'paid', 'failed'))
  `;
};

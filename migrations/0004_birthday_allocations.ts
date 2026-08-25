import type { Sql, TransactionSql } from "postgres";

export const up = async (sql: Sql | TransactionSql): Promise<void> => {
  await sql`
    ALTER TABLE registrations
      ADD COLUMN birthday TEXT
  `;

  await sql`
    CREATE TABLE allocations (
      id SERIAL PRIMARY KEY,
      registration_id INTEGER NOT NULL REFERENCES registrations (id),
      allocation JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX allocations_registration_submitted_idx
    ON allocations (registration_id, submitted_at DESC, id DESC)
  `;
};

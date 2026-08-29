import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import { database } from "../src/db";
import { logger } from "../src/logger";

type Migration = {
  up: (sql: Sql | TransactionSql) => Promise<void>;
};

const migrationsDirectory = join(import.meta.dir, "..", "migrations");
const migrationPattern = /^\d+_[a-z0-9_-]+\.ts$/;

const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => migrationPattern.test(name))
  .sort();

await database`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const appliedRows = await database<{ name: string }[]>`
  SELECT name FROM schema_migrations
`;
const appliedNames = new Set(appliedRows.map(({ name }) => name));

for (const name of migrationNames) {
  if (appliedNames.has(name)) {
    logger.info(`Skipping applied migration ${name}`);
    continue;
  }

  const migration = (await import(join(migrationsDirectory, name))) as Migration;

  if (typeof migration.up !== "function") {
    throw new Error(`Migration ${name} must export an up function`);
  }

  await database.begin(async (sql) => {
    await migration.up(sql);
    await sql`
      INSERT INTO schema_migrations (name)
      VALUES (${name})
    `;
  });

  logger.info(`Applied migration ${name}`);
}

await database.end();

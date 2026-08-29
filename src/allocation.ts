import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { logger } from "./logger";

export const allocationSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

export type Allocation = z.infer<typeof allocationSchema>;

export const insertAllocation = async (
  sql: Sql | TransactionSql,
  registrationId: number,
  allocation: Allocation,
): Promise<number> => {
  logger.info("[allocation] insert started", {
    registrationId,
    organizations: Object.keys(allocation),
    total: Object.values(allocation).reduce((sum, amount) => sum + amount, 0),
  });
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO allocations (registration_id, allocation)
    VALUES (${registrationId}, ${JSON.stringify(allocation)}::jsonb)
    RETURNING id
  `;

  if (!row) throw new Error("Allocation insert did not return an id");
  logger.info("[allocation] insert completed", {
    registrationId,
    allocationId: row.id,
  });
  return row.id;
};

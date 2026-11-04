import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { logger } from "./logger";

export const allocationSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

export const allocationFormatSchema = z.enum(["dollars", "percentage"]);
export type AllocationFormat = z.infer<typeof allocationFormatSchema>;
// Legacy clients omit format; new clients must include it explicitly.
export const legacyAllocationFormatSchema =
  allocationFormatSchema.default("dollars");

export const allocationSubmissionSchema = z
  .object({
    allocation: allocationSchema,
    format: legacyAllocationFormatSchema,
  })
  .refine(
    ({ allocation, format }) =>
      format !== "percentage" ||
      Object.values(allocation).reduce((sum, value) => sum + value, 0) === 100,
    { message: "Percentage allocations must total 100", path: ["allocation"] },
  );

export type Allocation = z.infer<typeof allocationSchema>;

export const insertAllocation = async (
  sql: Sql | TransactionSql,
  registrationId: number,
  allocation: Allocation,
  format: AllocationFormat,
): Promise<number> => {
  logger.info("[allocation] insert started", {
    registrationId,
    organizations: Object.keys(allocation),
    total: Object.values(allocation).reduce((sum, amount) => sum + amount, 0),
  });
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO allocations (registration_id, allocation, format)
    VALUES (${registrationId}, ${sql.json(allocation)}::jsonb, ${format})
    RETURNING id
  `;

  if (!row) throw new Error("Allocation insert did not return an id");
  logger.info("[allocation] insert completed", {
    registrationId,
    allocationId: row.id,
  });
  return row.id;
};

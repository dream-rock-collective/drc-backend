import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";

export const allocationSchema = z.record(
  z.string().min(1),
  z.number().int().nonnegative(),
);

export type Allocation = z.infer<typeof allocationSchema>;

export const allocationBudget = (plan: "once" | "monthly" | "yearly"): number => {
  if (plan === "once") return 6;
  return 5;
};

export const allocationTotal = (allocation: Allocation): number =>
  Object.values(allocation).reduce((total, amount) => total + amount, 0);

export const insertAllocation = async (
  sql: Sql | TransactionSql,
  registrationId: number,
  allocation: Allocation,
): Promise<number> => {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO allocations (registration_id, allocation)
    VALUES (${registrationId}, ${JSON.stringify(allocation)}::jsonb)
    RETURNING id
  `;

  if (!row) throw new Error("Allocation insert did not return an id");
  return row.id;
};

import { Hono } from "hono";
import { z } from "zod";
import { database } from "../db";
import {
  allocationSchema,
  insertAllocation,
} from "../allocation";
import type { SessionVariables } from "../middleware/session";

export const allocationsRoute = new Hono<{
  Variables: SessionVariables;
}>();

const submitSchema = z.object({
  userId: z.coerce.number().int().positive(),
  allocation: allocationSchema,
});

const toAllocation = (row: {
  id: number;
  allocation: Record<string, number>;
  submitted_at: Date;
}) => ({
  id: row.id,
  allocation: row.allocation,
  submitted_at: row.submitted_at,
});

const requireSession = (c: { get: (key: "user") => SessionVariables["user"] }) =>
  c.get("user") !== null;

allocationsRoute.post("/submit-allocation", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = submitSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "A user id and valid allocation are required" }, 400);
  }

  const { userId, allocation } = result.data;
  try {
    const [registration] = await database<{
      payment_status: "pending" | "paid" | "failed";
    }[]>`
      SELECT payment_status
      FROM registrations
      WHERE id = ${userId} AND deleted_at IS NULL
    `;

    if (!registration) return c.json({ error: "Registration not found" }, 404);
    if (registration.payment_status !== "paid") {
      return c.json({ error: "A completed payment is required" }, 403);
    }

    const allocationId = await insertAllocation(database, userId, allocation);
    return c.json({ allocationId }, 201);
  } catch (error) {
    console.error("Could not save allocation", error);
    return c.json({ error: "Could not save allocation" }, 500);
  }
});

allocationsRoute.get("/registrations/:id/allocations", async (c) => {
  if (!requireSession(c)) return c.json({ error: "Authentication required" }, 401);

  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) {
    return c.json({ error: "Registration id must be a positive integer" }, 400);
  }

  try {
    const rows = await database<{
      id: number;
      allocation: Record<string, number>;
      submitted_at: Date;
    }[]>`
      SELECT id, allocation, submitted_at
      FROM allocations
      WHERE registration_id = ${id}
      ORDER BY submitted_at DESC, id DESC
    `;

    return c.json({ allocations: rows.map(toAllocation) });
  } catch (error) {
    console.error("Could not load allocation history", error);
    return c.json({ error: "Could not load allocation history" }, 500);
  }
});

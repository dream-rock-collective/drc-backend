import { expect, test } from "bun:test";
import { Hono } from "hono";
import postgres from "postgres";
import { up } from "../migrations/0008_allocation_format";
import type { SessionVariables } from "../src/middleware/session";

const testUrl = process.env["ALLOCATION_TEST_DATABASE_URL"];

test.skipIf(!testUrl)(
  "legacy migration and dollar/percentage API round trips",
  async () => {
    // Use only an explicitly supplied disposable database, never the default database.
    process.env["DATABASE_URL"] = testUrl;
    const sql = postgres(testUrl!);
    const { database } = await import("../src/db");
    const { allocationsRoute } = await import("../src/routes/allocations");
    const { registrationsRoute } = await import("../src/routes/registrations");
    const app = new Hono<{ Variables: SessionVariables }>();
    app.use("*", async (c, next) => {
      c.set("user", null);
      await next();
    });
    app.route("/", allocationsRoute);
    app.route("/", registrationsRoute);
    let id: number | undefined;
    try {
      await sql.begin(async (transaction) => {
        await transaction`CREATE TEMP TABLE allocations (id SERIAL PRIMARY KEY, allocation JSONB NOT NULL) ON COMMIT DROP`;
        await transaction`INSERT INTO allocations (allocation) VALUES ('{"charityA":5,"charityB":10}'::jsonb)`;
        await up(transaction);
        const [row] =
          await transaction`SELECT allocation, format FROM allocations`;
        expect(row).toMatchObject({
          allocation: { charityA: 5, charityB: 10 },
          format: "dollars",
        });
      });
      const [registration] =
        await sql`INSERT INTO registrations (name, email, payment_status) VALUES ('Allocation test', ${`allocation-${crypto.randomUUID()}@example.com`}, 'paid') RETURNING id`;
      id = registration!.id;
      for (const body of [
        { userId: id, allocation: { charityA: 5, charityB: 10 } },
        {
          userId: id,
          allocation: { charityA: 33, charityB: 67 },
          format: "percentage",
        },
        { userId: id, allocation: { charityA: 15 }, format: "dollars" },
      ]) {
        const response = await app.request("/submit-allocation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(201);
        const { allocationId } = await response.json();
        const [row] =
          await sql`SELECT allocation, format FROM allocations WHERE id = ${allocationId}`;
        expect(row).toMatchObject({
          allocation: body.allocation,
          format: body.format ?? "dollars",
        });
      }
      expect(
        (await app.request(`/registrations/${id}/allocations`)).status,
      ).toBe(401);
      expect(
        (await app.request("/modify-registration", { method: "POST" })).status,
      ).toBe(401);
      await sql`UPDATE registrations SET payment_status = 'pending' WHERE id = ${id!}`;
      const response = await app.request("/submit-allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: id,
          allocation: { a: 100 },
          format: "percentage",
        }),
      });
      expect(response.status).toBe(403);
    } finally {
      if (id !== undefined) {
        await sql`DELETE FROM allocations WHERE registration_id = ${id}`;
        await sql`DELETE FROM registrations WHERE id = ${id}`;
      }
      await sql.end();
      await database.end();
    }
  },
);

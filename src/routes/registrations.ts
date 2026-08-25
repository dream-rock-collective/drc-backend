import { Hono } from "hono";
import { z } from "zod";
import {
  allocationSchema,
  insertAllocation,
} from "../allocation";
import { database } from "../db";
import type { SessionVariables } from "../middleware/session";

export const registrationsRoute = new Hono<{
  Variables: SessionVariables;
}>();

const registrationFields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(320),
  address: z.string().trim().min(1, "Address is required").max(500),
  birthday: z.string().max(100).nullable().optional(),
};

const registrationSchema = z.object(registrationFields);
const editSchema = z.object(registrationFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  "At least one field is required",
);

type RegistrationRow = {
  id: number;
  name: string;
  email: string;
  address: string;
  stripe_payment_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  birthday: string | null;
  plan: "once" | "monthly" | "yearly" | null;
  payment_status: "pending" | "paid" | "failed";
  created_at: Date;
  deleted_at: Date | null;
  latest_allocation: Record<string, number> | null;
};

const toAdminRegistration = (registration: RegistrationRow) => ({
  id: registration.id,
  name: registration.name,
  email: registration.email,
  address: registration.address,
  birthday: registration.birthday,
  stripe_payment_id: registration.stripe_payment_id,
  stripe_customer_id: registration.stripe_customer_id,
  stripe_subscription_id: registration.stripe_subscription_id,
  plan: registration.plan,
  payment_status: registration.payment_status,
  latest_allocation: registration.latest_allocation,
  created_at: registration.created_at,
  deleted: registration.deleted_at !== null,
});

const requireSession = (c: { get: (key: "user") => SessionVariables["user"] }) =>
  c.get("user") !== null;

registrationsRoute.post("/register", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = registrationSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        error: "Please provide a name, address, and valid email address",
        fields: result.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const { name, address, birthday } = result.data;
  const email = result.data.email.toLowerCase();

  try {
    const [registration] = await database<{
      id: number;
      name: string;
      email: string;
      address: string;
      birthday: string | null;
      created_at: Date;
    }[]>`
      INSERT INTO registrations (name, email, address, birthday)
      VALUES (${name}, ${email}, ${address}, ${birthday ?? null})
      RETURNING id, name, email, address, birthday, created_at
    `;

    return c.json({ registration }, 201);
  } catch (error) {
    console.error("Could not save registration", error);
    return c.json({ error: "Could not save registration" }, 500);
  }
});

registrationsRoute.get("/registrations", async (c) => {
  if (!requireSession(c)) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const registrations = await database<RegistrationRow[]>`
      SELECT id, name, email, address, stripe_payment_id, stripe_customer_id,
        stripe_subscription_id, birthday, plan, payment_status, created_at, deleted_at,
        latest.allocation AS latest_allocation
      FROM registrations
      LEFT JOIN LATERAL (
        SELECT allocation
        FROM allocations
        WHERE allocations.registration_id = registrations.id
        ORDER BY submitted_at DESC, id DESC
        LIMIT 1
      ) AS latest ON TRUE
      ORDER BY created_at DESC, id DESC
    `;

    return c.json({ registrations: registrations.map(toAdminRegistration) });
  } catch (error) {
    console.error("Could not load registrations", error);
    return c.json({ error: "Could not load registrations" }, 500);
  }
});

const modificationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delete"), id: z.string().trim().min(1) }),
  z.object({
    type: z.literal("edit"),
    id: z.string().trim().min(1),
    data: editSchema.extend({ allocation: allocationSchema.optional() }),
  }),
]);

registrationsRoute.post("/modify-registration", async (c) => {
  if (!requireSession(c)) {
    return c.json({ error: "Authentication required" }, 401);
  }

  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = modificationSchema.safeParse(body);

  if (!result.success) {
    return c.json(
      {
        error: "Invalid registration modification",
        fields: result.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const id = Number(result.data.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return c.json({ error: "Registration id must be a positive integer" }, 400);
  }

  try {
    const [registration] = await database.begin(async (sql) => {
      if (result.data.type === "delete") {
        await sql`
          UPDATE registrations
          SET deleted_at = NOW()
          WHERE id = ${id}
        `;
      } else {
        const { data } = result.data;
        if (data.allocation) {
          const [current] = await sql<{ id: number }[]>`
            SELECT id FROM registrations WHERE id = ${id}
          `;
          if (!current) return [] as RegistrationRow[];
          await insertAllocation(sql, id, data.allocation);
        }
        await sql`
          UPDATE registrations
          SET
            name = COALESCE(${data.name ?? null}, name),
            email = COALESCE(${data.email?.toLowerCase() ?? null}, email),
            address = COALESCE(${data.address ?? null}, address),
            birthday = CASE WHEN ${data.birthday !== undefined} THEN ${data.birthday ?? null} ELSE birthday END
          WHERE id = ${id}
        `;
      }

      return sql<RegistrationRow[]>`
        SELECT registrations.id, name, email, address, stripe_payment_id,
          stripe_customer_id, stripe_subscription_id, birthday, plan,
          payment_status, created_at, deleted_at,
          latest.allocation AS latest_allocation
        FROM registrations
        LEFT JOIN LATERAL (
          SELECT allocation
          FROM allocations
          WHERE allocations.registration_id = registrations.id
          ORDER BY submitted_at DESC, allocations.id DESC
          LIMIT 1
        ) AS latest ON TRUE
        WHERE registrations.id = ${id}
      `;
    });

    if (!registration) {
      return c.json({ error: "Registration not found" }, 404);
    }

    return c.json(toAdminRegistration(registration));
  } catch (error) {
    console.error("Could not modify registration", error);
    return c.json({ error: "Could not modify registration" }, 500);
  }
});

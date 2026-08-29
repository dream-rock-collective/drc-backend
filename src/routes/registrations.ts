import { Hono } from "hono";
import { z } from "zod";
import {
  allocationSchema,
  insertAllocation,
} from "../allocation";
import { database } from "../db";
import { logger } from "../logger";
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
const notesSchema = z.string().trim().max(5000).nullable().optional();
const editSchema = z.object(registrationFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  "At least one field is required",
);

type RegistrationRow = {
  id: number;
  name: string;
  email: string;
  address: string;
  stripe_payment_intent_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  birthday: string | null;
  plan: "once" | "monthly" | "yearly" | null;
  payment_status: "pending" | "paid" | "failed";
  created_at: Date;
  deleted_at: Date | null;
  notes: string | null;
  latest_allocation: Record<string, number> | string | null;
};

const toAdminRegistration = (registration: RegistrationRow) => ({
  id: registration.id,
  name: registration.name,
  email: registration.email,
  address: registration.address,
  birthday: registration.birthday,
  notes: registration.notes,
  stripe_payment_intent_id: registration.stripe_payment_intent_id,
  stripe_customer_id: registration.stripe_customer_id,
  stripe_subscription_id: registration.stripe_subscription_id,
  plan: registration.plan,
  payment_status: registration.payment_status,
  latest_allocation: normalizeAllocation(registration.latest_allocation),
  created_at: registration.created_at,
  deleted: registration.deleted_at !== null,
});

const normalizeAllocation = (
  value: RegistrationRow["latest_allocation"],
): Record<string, number> | null => {
  if (value === null) return null;
  if (typeof value !== "string") return value;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, amount]) => typeof amount === "number"),
    );
  } catch {
    return null;
  }
};

const requireSession = (c: { get: (key: "user") => SessionVariables["user"] }) =>
  c.get("user") !== null;

registrationsRoute.post("/register", async (c) => {
  logger.info("[registrations] public registration request received", {
    method: c.req.method,
    url: c.req.url,
    contentType: c.req.header("content-type") ?? null,
  });
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = registrationSchema.safeParse(body);

  if (!result.success) {
    logger.warn("[registrations] public registration rejected: schema validation failed", {
      issueCount: result.error.issues.length,
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
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
  logger.info("[registrations] public registration validated", {
    email,
    nameLength: name.length,
    addressLength: address.length,
    hasBirthday: birthday !== null && birthday !== undefined,
  });

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

    logger.info("[registrations] public registration saved", {
      registrationId: registration?.id ?? null,
      createdAt: registration?.created_at ?? null,
    });
    return c.json({ registration }, 201);
  } catch (error) {
    logger.error("Could not save registration", error);
    return c.json({ error: "Could not save registration" }, 500);
  }
});

registrationsRoute.get("/registrations", async (c) => {
  logger.info("[registrations] admin registration list requested");
  if (!requireSession(c)) {
    logger.warn("[registrations] admin registration list rejected: authentication required");
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const registrations = await database<RegistrationRow[]>`
      SELECT id, name, email, address, stripe_payment_intent_id, stripe_customer_id,
        stripe_subscription_id, birthday, notes, plan, payment_status, created_at, deleted_at,
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

    logger.info("[registrations] admin registration list loaded", {
      count: registrations.length,
      deletedCount: registrations.filter((registration) => registration.deleted_at !== null).length,
    });
    return c.json({ registrations: registrations.map(toAdminRegistration) });
  } catch (error) {
    logger.error("Could not load registrations", error);
    return c.json({ error: "Could not load registrations" }, 500);
  }
});

const modificationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delete"), id: z.string().trim().min(1) }),
  z.object({
    type: z.literal("edit"),
    id: z.string().trim().min(1),
    data: editSchema.extend({ allocation: allocationSchema.optional(), notes: notesSchema }),
  }),
]);

registrationsRoute.post("/modify-registration", async (c) => {
  logger.info("[registrations] admin modification request received");
  if (!requireSession(c)) {
    logger.warn("[registrations] admin modification rejected: authentication required");
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
    logger.warn("[registrations] admin modification rejected: schema validation failed", {
      issueCount: result.error.issues.length,
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
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
    logger.warn("[registrations] admin modification rejected: invalid registration id", {
      suppliedId: result.data.id,
    });
    return c.json({ error: "Registration id must be a positive integer" }, 400);
  }

  logger.info("[registrations] admin modification validated", {
    registrationId: id,
    type: result.data.type,
    fields: result.data.type === "edit" ? Object.keys(result.data.data) : [],
  });

  try {
    const [registration] = await database.begin(async (sql) => {
      if (result.data.type === "delete") {
        logger.info("[registrations] soft deleting registration", { registrationId: id });
        await sql`
          UPDATE registrations
          SET deleted_at = NOW()
          WHERE id = ${id}
        `;
      } else {
        const { data } = result.data;
        if (data.allocation) {
          logger.info("[registrations] admin modification includes allocation", {
            registrationId: id,
            organizations: Object.keys(data.allocation),
            total: Object.values(data.allocation).reduce((sum, amount) => sum + amount, 0),
          });
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
            birthday = CASE WHEN ${data.birthday !== undefined} THEN ${data.birthday ?? null} ELSE birthday END,
            notes = CASE WHEN ${data.notes !== undefined} THEN ${data.notes || null} ELSE notes END
          WHERE id = ${id}
        `;
      }

      return sql<RegistrationRow[]>`
        SELECT registrations.id, name, email, address, stripe_payment_intent_id,
          stripe_customer_id, stripe_subscription_id, birthday, plan,
          payment_status, created_at, deleted_at, notes,
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
      logger.warn("[registrations] admin modification found no registration", { registrationId: id });
      return c.json({ error: "Registration not found" }, 404);
    }

    logger.info("[registrations] admin modification saved", {
      registrationId: registration.id,
      type: result.data.type,
    });
    return c.json(toAdminRegistration(registration));
  } catch (error) {
    logger.error("Could not modify registration", error);
    return c.json({ error: "Could not modify registration" }, 500);
  }
});

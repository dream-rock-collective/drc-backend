import { Hono } from "hono";
import { z } from "zod";
import { database } from "../db";

export const registrationsRoute = new Hono();

const registrationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(320),
});

registrationsRoute.post("/api/registrations", async (c) => {
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
        error: "Please provide a name and valid email address",
        fields: result.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const name = result.data.name;
  const email = result.data.email.toLowerCase();

  try {
    const [registration] = await database`
      INSERT INTO registrations (name, email)
      VALUES (${name}, ${email})
      RETURNING id, name, email, created_at
    `;

    return c.json({ registration }, 201);
  } catch (error) {
    console.error("Could not save registration", error);
    return c.json({ error: "Could not save registration" }, 500);
  }
});

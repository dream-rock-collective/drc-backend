import { Hono } from "hono";
import Stripe from "stripe";
import { z } from "zod";
import { database } from "../db";

export const paymentsRoute = new Hono();

const planSchema = z.enum(["once", "monthly", "yearly"]);
const checkoutSchema = z.object({
  registrationId: z.coerce.number().int().positive(),
  plan: planSchema,
});

type Plan = z.infer<typeof planSchema>;

const getStripe = (): Stripe => {
  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  return new Stripe(secretKey);
};

const getPriceId = (plan: Plan): string => {
  const envName = {
    once: "STRIPE_PRICE_ONCE",
    monthly: "STRIPE_PRICE_MONTHLY",
    yearly: "STRIPE_PRICE_YEARLY",
  }[plan];
  const priceId = process.env[envName]?.trim();

  if (!priceId) {
    throw new Error(`${envName} is not configured`);
  }

  return priceId;
};

const getRegistrationSiteOrigin = (): string => {
  return (process.env["REGISTRATION_SITE_ORIGIN"]?.trim() || "http://localhost:5173")
    .replace(/\/$/, "");
};

paymentsRoute.post("/create-checkout-session", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = checkoutSchema.safeParse(body);
  if (!result.success) {
    return c.json({ error: "Registration id and a valid plan are required" }, 400);
  }

  const { registrationId, plan } = result.data;

  try {
    const [registration] = await database<{ email: string }[]>`
      SELECT email
      FROM registrations
      WHERE id = ${registrationId}
    `;

    if (!registration) {
      return c.json({ error: "Registration not found" }, 404);
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: plan === "once" ? "payment" : "subscription",
      line_items: [{ price: getPriceId(plan), quantity: 1 }],
      client_reference_id: String(registrationId),
      metadata: { plan },
      customer_email: registration.email,
      ...(plan === "once" ? { customer_creation: "always" as const } : {}),
      success_url: `${getRegistrationSiteOrigin()}/success`,
      cancel_url: `${getRegistrationSiteOrigin()}/registered`,
    });

    if (!session.url) {
      console.error("Stripe returned a Checkout Session without a URL");
      return c.json({ error: "Could not create checkout session" }, 502);
    }

    return c.json({ url: session.url });
  } catch (error) {
    console.error("Could not create Stripe Checkout Session", error);
    return c.json({ error: "Could not create checkout session" }, 500);
  }
});

paymentsRoute.post("/webhooks/stripe", async (c) => {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  const signature = c.req.header("stripe-signature");

  if (!webhookSecret || !signature) {
    return c.json({ error: "Invalid Stripe webhook" }, 400);
  }

  let event: Stripe.Event;

  try {
    const rawBody = await c.req.text();
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Could not verify Stripe webhook", error);
    return c.json({ error: "Invalid Stripe webhook" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return c.json({ received: true });
  }

  const session = event.data.object;
  const registrationId = Number(session.client_reference_id);
  const plan = session.metadata?.["plan"];

  const parsedPlan = planSchema.safeParse(plan);

  if (!Number.isSafeInteger(registrationId) || registrationId < 1 || !parsedPlan.success) {
    console.error("Stripe Checkout Session is missing valid registration metadata", session.id);
    return c.json({ received: true });
  }

  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

  try {
    await database`
      UPDATE registrations
      SET
        payment_status = 'paid',
        stripe_customer_id = ${customerId},
        stripe_subscription_id = ${subscriptionId},
        plan = ${parsedPlan.data}
      WHERE id = ${registrationId}
    `;
  } catch (error) {
    console.error("Could not record Stripe payment", error);
    return c.json({ error: "Could not record Stripe payment" }, 500);
  }

  return c.json({ received: true });
});

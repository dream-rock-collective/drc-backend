import { Hono } from "hono";
import Stripe from "stripe";
import { z } from "zod";
import { database } from "../db";

export const paymentsRoute = new Hono();

const planSchema = z.enum(["once", "monthly", "yearly"]);
const checkoutSchema = z.object({
  userId: z.coerce.number().int().positive(),
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
  console.info("[payments] create-checkout-session request received");
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    console.warn("[payments] checkout request rejected: invalid JSON");
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = checkoutSchema.safeParse(body);
  if (!result.success) {
    console.warn("[payments] checkout request rejected: invalid payload");
    return c.json({ error: "Registration id and a valid plan are required" }, 400);
  }

  const { userId, plan } = result.data;
  console.info("[payments] checkout request validated", { userId, plan });

  try {
    const [registration] = await database<{ email: string }[]>`
      SELECT email
      FROM registrations
      WHERE id = ${userId}
    `;

    if (!registration) {
      console.warn("[payments] checkout user not found", { userId, plan });
      return c.json({ error: "Registration not found" }, 404);
    }

    console.info("[payments] creating Stripe Checkout Session", { userId, plan });

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: plan === "once" ? "payment" : "subscription",
      line_items: [{ price: getPriceId(plan), quantity: 1 }],
      client_reference_id: String(userId),
      metadata: { plan },
      customer_email: registration.email,
      ...(plan === "once" ? { customer_creation: "always" as const } : {}),
      success_url: `${getRegistrationSiteOrigin()}/allocate-payment/`,
      cancel_url: `${getRegistrationSiteOrigin()}/registered/`,
    });

    if (!session.url) {
      console.error("[payments] Stripe returned a Checkout Session without a URL", {
        userId,
        plan,
        sessionId: session.id,
      });
      return c.json({ error: "Could not create checkout session" }, 502);
    }

    console.info("[payments] Stripe Checkout Session created", {
      userId,
      plan,
      sessionId: session.id,
      mode: session.mode,
      paymentStatus: session.payment_status,
    });

    return c.json({ url: session.url });
  } catch (error) {
    console.error("[payments] Could not create Stripe Checkout Session", {
      userId,
      plan,
      error,
    });
    return c.json({ error: "Could not create checkout session" }, 500);
  }
});

paymentsRoute.post("/webhooks/stripe", async (c) => {
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  const signature = c.req.header("stripe-signature");

  console.info("[payments] Stripe webhook request received", {
    hasWebhookSecret: Boolean(webhookSecret),
    hasSignature: Boolean(signature),
  });

  if (!webhookSecret || !signature) {
    console.warn("[payments] Stripe webhook rejected before verification", {
      hasWebhookSecret: Boolean(webhookSecret),
      hasSignature: Boolean(signature),
    });
    return c.json({ error: "Invalid Stripe webhook" }, 400);
  }

  let event: Stripe.Event;

  try {
    const rawBody = await c.req.text();
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    console.info("[payments] Stripe webhook signature verified", {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
    });
  } catch (error) {
    console.error("[payments] Could not verify Stripe webhook", { error });
    return c.json({ error: "Invalid Stripe webhook" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    console.info("[payments] Stripe webhook event ignored", {
      eventId: event.id,
      eventType: event.type,
    });
    return c.json({ received: true });
  }

  const session = event.data.object;
  const userId = Number(session.client_reference_id);
  const plan = session.metadata?.["plan"];

  console.info("[payments] checkout.session.completed received", {
    eventId: event.id,
    sessionId: session.id,
    registrationReference: session.client_reference_id,
    plan,
    mode: session.mode,
    paymentStatus: session.payment_status,
    customerId: typeof session.customer === "string" ? session.customer : null,
    subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
  });

  const parsedPlan = planSchema.safeParse(plan);

  if (!Number.isSafeInteger(userId) || userId < 1 || !parsedPlan.success) {
    console.error("[payments] Stripe Checkout Session is missing valid registration metadata", {
      eventId: event.id,
      sessionId: session.id,
      registrationReference: session.client_reference_id,
      plan,
    });
    return c.json({ received: true });
  }

  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

  try {
    const [before] = await database<{ payment_status: "pending" | "paid" | "failed"; plan: Plan | null }[]>`
      SELECT payment_status, plan
      FROM registrations
      WHERE id = ${userId}
    `;

    console.info("[payments] recording Stripe payment", {
      eventId: event.id,
      sessionId: session.id,
      userId,
      previousPaymentStatus: before?.payment_status ?? null,
      previousPlan: before?.plan ?? null,
      nextPaymentStatus: "paid",
      nextPlan: parsedPlan.data,
    });

    const [updated] = await database<{ id: number; payment_status: "pending" | "paid" | "failed"; plan: Plan | null }[]>`
      UPDATE registrations
      SET
        payment_status = 'paid',
        stripe_customer_id = ${customerId},
        stripe_subscription_id = ${subscriptionId},
        plan = ${parsedPlan.data}
      WHERE id = ${userId}
      RETURNING id, payment_status, plan
    `;

    if (!updated) {
      console.error("[payments] Stripe payment update matched no registration", {
        eventId: event.id,
        sessionId: session.id,
        userId,
      });
    } else {
      console.info("[payments] Stripe payment recorded", {
        eventId: event.id,
        sessionId: session.id,
        userId: updated.id,
        paymentStatus: updated.payment_status,
        plan: updated.plan,
      });
    }
  } catch (error) {
    console.error("[payments] Could not record Stripe payment", {
      eventId: event.id,
      sessionId: session.id,
      userId,
      error,
    });
    return c.json({ error: "Could not record Stripe payment" }, 500);
  }

  return c.json({ received: true });
});

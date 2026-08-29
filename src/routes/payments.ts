import { Hono } from "hono";
import Stripe from "stripe";
import { z } from "zod";
import { database } from "../db";
import { logger } from "../logger";

export const paymentsRoute = new Hono();

const planSchema = z.enum(["once", "monthly", "yearly"]);
const checkoutSchema = z.object({
  userId: z.coerce.number().int().positive(),
  plan: planSchema,
});

type Plan = z.infer<typeof planSchema>;

type StripeMode = "live" | "test" | "unknown";

const stripeModeFromKey = (key: string | undefined): StripeMode => {
  if (key?.startsWith("sk_live_")) return "live";
  if (key?.startsWith("sk_test_")) return "test";
  return "unknown";
};

const configuredStripeMode = (): StripeMode =>
  stripeModeFromKey(process.env["STRIPE_SECRET_KEY"]?.trim());

const stripeModeMismatch = (livemode: boolean): boolean => {
  const configuredMode = configuredStripeMode();
  return configuredMode !== "unknown" && (configuredMode === "live") !== livemode;
};

const configuredPriceSummary = (plan: Plan): { configured: boolean; prefix: string | null } => {
  const envName = {
    once: "STRIPE_PRICE_ONCE",
    monthly: "STRIPE_PRICE_MONTHLY",
    yearly: "STRIPE_PRICE_YEARLY",
  }[plan];
  const value = process.env[envName]?.trim();
  return { configured: Boolean(value), prefix: value?.slice(0, 8) ?? null };
};

export const stripeConfigurationSummary = () => ({
  secretKeyConfigured: Boolean(process.env["STRIPE_SECRET_KEY"]?.trim()),
  secretKeyMode: configuredStripeMode(),
  webhookSecretConfigured: Boolean(process.env["STRIPE_WEBHOOK_SECRET"]?.trim()),
  webhookSecretLength: process.env["STRIPE_WEBHOOK_SECRET"]?.trim().length ?? 0,
  prices: {
    once: configuredPriceSummary("once"),
    monthly: configuredPriceSummary("monthly"),
    yearly: configuredPriceSummary("yearly"),
  },
});

const getStripe = (): Stripe => {
  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim();

  if (!secretKey) {
    logger.error("[payments] Stripe client initialization failed: secret key is missing");
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  logger.info("[payments] Stripe client initialized", {
    configuredMode: configuredStripeMode(),
  });
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
    logger.error("[payments] Stripe price lookup failed", { plan, envName });
    throw new Error(`${envName} is not configured`);
  }

  logger.info("[payments] Stripe price selected", {
    plan,
    envName,
    pricePrefix: priceId.slice(0, 8),
  });
  return priceId;
};

const getRegistrationSiteOrigin = (): string => {
  return (process.env["REGISTRATION_SITE_ORIGIN"]?.trim() || "http://localhost:5173")
    .replace(/\/$/, "");
};

paymentsRoute.post("/create-checkout-session", async (c) => {
  logger.info("[payments] create-checkout-session request received");
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    logger.warn("[payments] checkout request rejected: invalid JSON");
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const result = checkoutSchema.safeParse(body);
  if (!result.success) {
    logger.warn("[payments] checkout request rejected: invalid payload");
    return c.json({ error: "Registration id and a valid plan are required" }, 400);
  }

  const { userId, plan } = result.data;
  const priceSummary = configuredPriceSummary(plan);
  logger.info("[payments] checkout request validated", {
    userId,
    plan,
    stripeMode: configuredStripeMode(),
    priceConfigured: priceSummary.configured,
    pricePrefix: priceSummary.prefix,
  });

  try {
    const [registration] = await database<{ email: string }[]>`
      SELECT email
      FROM registrations
      WHERE id = ${userId}
    `;

    if (!registration) {
      logger.warn("[payments] checkout user not found", { userId, plan });
      return c.json({ error: "Registration not found" }, 404);
    }

    logger.info("[payments] creating Stripe Checkout Session", {
      userId,
      plan,
      customerEmailPresent: Boolean(registration.email),
    });

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
      logger.error("[payments] Stripe returned a Checkout Session without a URL", {
        userId,
        plan,
        sessionId: session.id,
      });
      return c.json({ error: "Could not create checkout session" }, 502);
    }

    logger.info("[payments] Stripe Checkout Session created", {
      userId,
      plan,
      sessionId: session.id,
      mode: session.mode,
      stripeMode: configuredStripeMode(),
      paymentStatus: session.payment_status,
    });

    return c.json({ url: session.url });
  } catch (error) {
    logger.error("[payments] Could not create Stripe Checkout Session", {
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
  const requestDetails = {
    url: c.req.url,
    contentType: c.req.header("content-type") ?? null,
    contentLength: c.req.header("content-length") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
    stripeMode: configuredStripeMode(),
  };

  logger.info("[payments] Stripe webhook request received", {
    ...requestDetails,
    hasWebhookSecret: Boolean(webhookSecret),
    hasSignature: Boolean(signature),
  });

  if (!webhookSecret || !signature) {
    logger.warn("[payments] Stripe webhook rejected before verification", {
      hasWebhookSecret: Boolean(webhookSecret),
      hasSignature: Boolean(signature),
    });
    return c.json({ error: "Invalid Stripe webhook" }, 400);
  }

  let event: Stripe.Event;

  try {
    const rawBody = await c.req.text();
    logger.info("[payments] Stripe webhook body read", {
      bodyLength: rawBody.length,
      signaturePresent: Boolean(signature),
    });
    event = await getStripe().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    logger.info("[payments] Stripe webhook signature verified", {
      eventId: event.id,
      eventType: event.type,
      livemode: event.livemode,
      configuredStripeMode: configuredStripeMode(),
      modeMismatch: stripeModeMismatch(event.livemode),
    });
    if (stripeModeMismatch(event.livemode)) {
      logger.warn("[payments] Stripe webhook mode mismatch detected", {
        eventId: event.id,
        eventLivemode: event.livemode,
        configuredStripeMode: configuredStripeMode(),
      });
    }
  } catch (error) {
    logger.error("[payments] Could not verify Stripe webhook", {
      error,
      configuredStripeMode: configuredStripeMode(),
      webhookSecretLength: webhookSecret.length,
      requestUrl: c.req.url,
    });
    return c.json({ error: "Invalid Stripe webhook" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    logger.info("[payments] Stripe webhook event ignored", {
      eventId: event.id,
      eventType: event.type,
      eventObjectType: event.data.object.object,
    });
    return c.json({ received: true });
  }

  const session = event.data.object;
  const userId = Number(session.client_reference_id);
  const plan = session.metadata?.["plan"];

  logger.info("[payments] Stripe Checkout metadata parsed", {
    eventId: event.id,
    sessionId: session.id,
    registrationReference: session.client_reference_id,
    parsedUserId: userId,
    plan,
    metadataKeys: session.metadata ? Object.keys(session.metadata) : [],
  });

  logger.info("[payments] checkout.session.completed received", {
    eventId: event.id,
    sessionId: session.id,
    registrationReference: session.client_reference_id,
    plan,
    mode: session.mode,
    paymentStatus: session.payment_status,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    customerId: typeof session.customer === "string" ? session.customer : null,
    subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
  });

  const parsedPlan = planSchema.safeParse(plan);

  if (!Number.isSafeInteger(userId) || userId < 1 || !parsedPlan.success) {
    logger.error("[payments] Stripe Checkout Session is missing valid registration metadata", {
      eventId: event.id,
      sessionId: session.id,
      registrationReference: session.client_reference_id,
      plan,
    });
    return c.json({ received: true });
  }

  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
  const paymentIntentId = session.mode === "payment" && typeof session.payment_intent === "string"
    ? session.payment_intent
    : null;

  try {
    const [before] = await database<{ payment_status: "pending" | "paid" | "failed"; plan: Plan | null }[]>`
      SELECT payment_status, plan
      FROM registrations
      WHERE id = ${userId}
    `;

    logger.info("[payments] registration loaded for Stripe payment", {
      eventId: event.id,
      sessionId: session.id,
      userId,
      found: Boolean(before),
      paymentStatus: before?.payment_status ?? null,
      plan: before?.plan ?? null,
    });

    logger.info("[payments] recording Stripe payment", {
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
        stripe_payment_intent_id = ${paymentIntentId},
        stripe_customer_id = ${customerId},
        stripe_subscription_id = ${subscriptionId},
        plan = ${parsedPlan.data}
      WHERE id = ${userId}
      RETURNING id, payment_status, plan
    `;

    logger.info("[payments] registration update completed", {
      eventId: event.id,
      sessionId: session.id,
      userId,
      matched: Boolean(updated),
      paymentStatus: updated?.payment_status ?? null,
      plan: updated?.plan ?? null,
      paymentIntentStored: Boolean(paymentIntentId),
      customerStored: Boolean(customerId),
      subscriptionStored: Boolean(subscriptionId),
    });

    if (!updated) {
      logger.error("[payments] Stripe payment update matched no registration", {
        eventId: event.id,
        sessionId: session.id,
        userId,
      });
    } else {
      logger.info("[payments] Stripe payment recorded", {
        eventId: event.id,
        sessionId: session.id,
        userId: updated.id,
        paymentStatus: updated.payment_status,
        plan: updated.plan,
      });
    }
  } catch (error) {
    logger.error("[payments] Could not record Stripe payment", {
      eventId: event.id,
      sessionId: session.id,
      userId,
      error,
    });
    return c.json({ error: "Could not record Stripe payment" }, 500);
  }

  logger.info("[payments] Stripe webhook acknowledged", {
    eventId: event.id,
    eventType: event.type,
    livemode: event.livemode,
  });
  return c.json({ received: true });
});

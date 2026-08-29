import { Hono } from 'hono';
import { database } from "../db";
import { logger } from "../logger";

export const healthRoute = new Hono();

healthRoute.get('/health', async (c) => {
  logger.info("[health] health check started");
  try {
    await database`SELECT 1`;
    logger.info("[health] database health check succeeded");
    return c.json({ status: "ok" });
  } catch (error) {
    logger.error("Health check failed", error);
    return c.json({ status: "error" }, 503);
  }
});

// TODO: POST /webhooks/stripe — raw body parsing + signature verification
// TODO: POST /api/checkout-session — create Stripe Checkout Session

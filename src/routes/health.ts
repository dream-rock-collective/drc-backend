import { Hono } from 'hono';
import { database } from "../db";

export const healthRoute = new Hono();

healthRoute.get('/health', async (c) => {
  try {
    await database`SELECT 1`;
    return c.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed", error);
    return c.json({ status: "error" }, 503);
  }
});

// TODO: POST /webhooks/stripe — raw body parsing + signature verification
// TODO: POST /api/checkout-session — create Stripe Checkout Session

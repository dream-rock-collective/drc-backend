import { Hono } from 'hono';

export const healthRoute = new Hono();

healthRoute.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// TODO: POST /webhooks/stripe — raw body parsing + signature verification
// TODO: POST /api/checkout-session — create Stripe Checkout Session

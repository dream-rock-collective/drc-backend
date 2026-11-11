import type { HonoRequest } from "hono";

export const isStripeMocked = () =>
  process.env["STRIPE_MODE"]?.trim() === "MOCKED";

export const stripeMock = {
  "/create-checkout-session": (request: {
    userId: number;
    plan: string;
    successUrl: string;
  }) => ({ url: request.successUrl }),
  "/webhooks/stripe": (_request: HonoRequest) => ({ received: true }),
};

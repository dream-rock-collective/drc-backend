import { expect, test } from "bun:test";

test("mock Stripe endpoints work without Stripe credentials or a database", async () => {
  // Isolate the payment route's database module and environment from other tests.
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "-e",
      `
      import assert from "node:assert/strict";
      import { paymentsRoute } from "./src/routes/payments";

      const checkout = (body) => paymentsRoute.request("/create-checkout-session", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const webhook = () => paymentsRoute.request("/webhooks/stripe", { method: "POST" });

      const session = await checkout({ userId: 42, plan: "monthly" });
      assert.equal(session.status, 200);
      assert.deepEqual(await session.json(), { url: "https://registration.example/allocate-payment/" });
      assert.equal((await checkout({ userId: 42, plan: "invalid" })).status, 400);

      const receipt = await webhook();
      assert.equal(receipt.status, 200);
      assert.deepEqual(await receipt.json(), { received: true });

      delete process.env.STRIPE_MODE;
      assert.equal((await webhook()).status, 400);
      process.env.STRIPE_MODE = "CONNECTED";
      assert.equal((await webhook()).status, 400);
    `,
    ],
    {
      env: {
        STRIPE_MODE: "MOCKED",
        REGISTRATION_SITE_ORIGIN: "https://registration.example/",
        DATABASE_URL: "postgres://localhost:1/unreachable",
      },
      stdout: "ignore",
      stderr: "pipe",
    },
  );

  const stderr = await new Response(child.stderr).text();
  expect(await child.exited, stderr).toBe(0);
});

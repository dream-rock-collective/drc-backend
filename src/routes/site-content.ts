import { createHash } from "node:crypto";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { logger } from "../logger";
import type { SessionVariables } from "../middleware/session";
import { listSiteImages, publishEditableSite, readEditableSite } from "../site-content";
import { SitePublishError } from "../site-publishing";

type Environment = { Variables: SessionVariables };
type Dependencies = {
  read: typeof readEditableSite;
  publish: typeof publishEditableSite;
  images: typeof listSiteImages;
  adminOrigin: () => string;
};
const publishSchema = z.strictObject({ content: z.unknown(), revision: z.string().regex(/^[a-f0-9]{64}$/) });

function failure(c: Context<Environment>, error: unknown): Response {
  if (error instanceof SitePublishError) {
    switch (error.status) {
      case 400: case 409: case 413: case 423: case 502: case 503:
        return c.json({ error: error.message }, error.status);
    }
  }
  logger.error("[site-content] request failed", { errorType: error instanceof Error ? error.name : "unknown" });
  return c.json({ error: "Could not access site content; check backend configuration" }, 500);
}

function responseSnapshot(snapshot: Awaited<ReturnType<typeof readEditableSite>> & { commit?: string }, userId: string) {
  const { draftTarget, ...result } = snapshot;
  return { ...result, draftKey: createHash("sha256").update(`${draftTarget}\0${userId}`).digest("hex") };
}

export function createSiteContentRoutes(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    read: readEditableSite,
    publish: publishEditableSite,
    images: listSiteImages,
    adminOrigin: () => new URL(process.env["BETTER_AUTH_URL"] ?? `http://localhost:${process.env["PORT"] ?? "6942"}`).origin,
    ...overrides,
  };
  const routes = new Hono<Environment>();
  routes.use("/api/site-content", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!c.get("user")) return c.json({ error: "Authentication required" }, 401);
    await next();
  });
  routes.use("/api/site-content/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!c.get("user")) return c.json({ error: "Authentication required" }, 401);
    await next();
  });
  routes.get("/api/site-content", async (c) => {
    try { return c.json(responseSnapshot(await dependencies.read(), c.get("user")!.id)); }
    catch (error) { return failure(c, error); }
  });
  routes.get("/api/site-content/images", async (c) => {
    try { return c.json({ images: await dependencies.images() }); }
    catch (error) { return failure(c, error); }
  });
  routes.use("/api/site-content/publish", async (c, next) => {
    try {
      if (c.req.header("Origin") !== dependencies.adminOrigin()) return c.json({ error: "Publish requests must come from the admin origin" }, 403);
    } catch { return c.json({ error: "Configure a valid BETTER_AUTH_URL for publishing" }, 503); }
    if (!/^application\/json(?:\s*;|$)/i.test(c.req.header("Content-Type") ?? "")) return c.json({ error: "Request must use application/json" }, 415);
    await next();
  });
  routes.post("/api/site-content/publish", bodyLimit({ maxSize: 512_000, onError: (c) => c.json({ error: "Site content exceeds 512 KB" }, 413) }), async (c) => {
    let body: unknown;
    try {
      const raw = await c.req.text();
      if (Buffer.byteLength(raw) > 512_000) return c.json({ error: "Site content exceeds 512 KB" }, 413);
      body = JSON.parse(raw);
    }
    catch { return c.json({ error: "Request body must be valid JSON" }, 400); }
    const result = publishSchema.safeParse(body);
    if (!result.success || result.data.content === undefined) return c.json({ error: "Provide content and its current revision" }, 400);
    try { return c.json(responseSnapshot(await dependencies.publish(result.data.content, result.data.revision), c.get("user")!.id)); }
    catch (error) { return failure(c, error); }
  });
  return routes;
}

export const siteContentRoute = createSiteContentRoutes();

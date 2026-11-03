import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { SessionVariables } from "../middleware/session";
import { logger } from "../logger";
import { buildSitePreview, readPreviewAsset } from "../site-preview";
import { SitePublishError } from "../site-publishing";

type Dependencies = {
  build: typeof buildSitePreview;
  asset: typeof readPreviewAsset;
  adminOrigin: () => string;
};

export function createSitePreviewRoutes(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    build: buildSitePreview,
    asset: readPreviewAsset,
    adminOrigin: () => new URL(process.env["BETTER_AUTH_URL"] ?? `http://localhost:${process.env["PORT"] ?? "6942"}`).origin,
    ...overrides,
  };
  const routes = new Hono<{ Variables: SessionVariables }>();
  routes.get("/api/site-preview", async (c) => {
    c.header("Cache-Control", "no-store");
    if (!c.get("user")) return c.json({ error: "Authentication required" }, 401);
    try {
      const { id } = await dependencies.build();
      const token = randomBytes(32).toString("hex");
      const query = new URLSearchParams({ parentOrigin: dependencies.adminOrigin(), token });
      return c.json({ url: `/api/site-preview/builds/${id}/preview.html?${query}`, token });
    } catch (error) {
      if (error instanceof SitePublishError) return c.json({ error: error.message }, 503);
      logger.error("[site-preview] build failed", { errorType: error instanceof Error ? error.name : "unknown" });
      return c.json({ error: "Could not prepare preview; check the site checkout and build dependencies" }, 503);
    }
  });
  routes.get("/api/site-preview/builds/:id/*", async (c) => {
    const requested = c.req.path.split(`/api/site-preview/builds/${c.req.param("id")}/`)[1] ?? "";
    if (requested === "preview.html" && !c.get("user")) return c.json({ error: "Authentication required" }, 401);
    const asset = await dependencies.asset(c.req.param("id"), requested);
    if (!asset) return c.notFound();
    if (asset.mediaType === "text/html") {
      if (!c.get("user")) return c.json({ error: "Authentication required" }, 401);
      let adminOrigin: string;
      try { adminOrigin = dependencies.adminOrigin(); }
      catch { return c.json({ error: "Configure a valid BETTER_AUTH_URL for preview" }, 503); }
      c.header("Content-Security-Policy", `default-src 'none'; script-src ${adminOrigin}; style-src ${adminOrigin}; img-src ${adminOrigin} data:; font-src ${adminOrigin}; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`);
      c.header("Cache-Control", "no-store");
    } else {
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Cache-Control", "public, max-age=31536000, immutable");
    }
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Type", asset.mediaType);
    return c.body(Bun.file(asset.file).stream());
  });
  return routes;
}

export const sitePreviewRoute = createSitePreviewRoutes();

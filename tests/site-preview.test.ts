import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import type { SessionVariables } from "../src/middleware/session";
import { createSitePreviewRoutes } from "../src/routes/site-preview";
import { buildSitePreview, readPreviewAsset } from "../src/site-preview";
import { SitePublishError, type SiteConfig } from "../src/site-publishing";

const temporary = await mkdtemp(path.join(tmpdir(), "drc-preview-test-"));
const site = path.resolve(import.meta.dir, "../../registration-site");
const checkout = path.join(temporary, "site");
await mkdir(checkout);
for (const name of [
  "src",
  "public",
  "preview.html",
  "vite.preview.config.ts",
  "package.json",
  "bun.lock",
])
  await cp(path.join(site, name), path.join(checkout, name), {
    recursive: true,
  });
await symlink(
  path.join(site, "node_modules"),
  path.join(checkout, "node_modules"),
);
const config: SiteConfig = { mode: "local", checkoutPath: checkout };
const origin = "http://admin.example.test";
const user = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
afterAll(async () => {
  await rm(temporary, { recursive: true, force: true });
});

function app(authenticated: boolean, build = () => buildSitePreview(config)) {
  const application = new Hono<{ Variables: SessionVariables }>();
  application.use("*", async (c, next) => {
    c.set("user", authenticated ? user : null);
    await next();
  });
  application.route(
    "/",
    createSitePreviewRoutes({ build, adminOrigin: () => origin }),
  );
  return application;
}

describe("backend-hosted site preview", () => {
  test("requires authentication before starting builds", async () => {
    let called = false;
    const response = await app(false, async () => {
      called = true;
      return { id: "a".repeat(64) };
    }).request(`${origin}/api/site-preview`);
    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  test("builds the real preview, reuses it, and serves only isolated generated assets", async () => {
    const response = await app(true).request(`${origin}/api/site-preview`);
    expect(response.status).toBe(200);
    const descriptor = await response.json();
    expect(descriptor.token).toMatch(/^[a-f0-9]{64}$/);
    const url = new URL(descriptor.url, origin);
    expect(url.searchParams.get("parentOrigin")).toBe(origin);
    expect(url.searchParams.get("token")).toBe(descriptor.token);
    const id = url.pathname.split("/")[4]!;
    expect(await buildSitePreview(config)).toEqual({ id });
    const html = await app(true).request(url.href);
    expect(html.status).toBe(200);
    expect(html.headers.get("Content-Type")).toBe("text/html");
    expect(html.headers.get("Cache-Control")).toBe("no-store");
    const policy = html.headers.get("Content-Security-Policy");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain(`script-src ${origin}`);
    const body = await html.text();
    const script = /src="([^"]+\.js)"/.exec(body)?.[1];
    expect(script).toStartWith(`/api/site-preview/builds/${id}/assets/`);
    const asset = await app(false).request(new URL(script!, origin).href);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(asset.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect((await app(false).request(url.href)).status).toBe(401);
    expect(await readPreviewAsset(id, "../../package.json")).toBeUndefined();
    expect(await readPreviewAsset(id, "%2e%2e/package.json")).toBeUndefined();
    expect(await readPreviewAsset(id, "package.json")).toBeUndefined();
    expect(await readPreviewAsset(id, "assets\\escape.js")).toBeUndefined();
    expect(await readPreviewAsset(id, "%broken")).toBeUndefined();
    expect(await readPreviewAsset("not-an-id", "preview.html")).toBeUndefined();
  });

  test("source changes produce a new build", async () => {
    const before = await buildSitePreview(config);
    await writeFile(
      path.join(checkout, "public/new-preview-image.png"),
      "image fixture",
    );
    const after = await buildSitePreview(config);
    expect(after.id).not.toBe(before.id);
    expect(
      await readPreviewAsset(after.id, "new-preview-image.png"),
    ).toBeDefined();
  });

  test("missing dependencies and source files return actionable build errors", async () => {
    const noDependencies = path.join(temporary, "without-dependencies");
    await mkdir(noDependencies);
    for (const name of [
      "src",
      "public",
      "preview.html",
      "vite.preview.config.ts",
      "package.json",
      "bun.lock",
    ])
      await cp(path.join(checkout, name), path.join(noDependencies, name), {
        recursive: true,
      });
    await expect(
      buildSitePreview({ mode: "local", checkoutPath: noDependencies }),
    ).rejects.toThrow("install");
    await expect(
      buildSitePreview({ mode: "local", checkoutPath: temporary }),
    ).rejects.toThrow("source is missing");
    const failure = await app(true, async () => {
      throw new SitePublishError("Install preview dependencies", 503);
    }).request(`${origin}/api/site-preview`);
    expect(failure.status).toBe(503);
    expect(await failure.json()).toEqual({
      error: "Install preview dependencies",
    });
  });

  test("does not follow source symlinks outside the checkout", async () => {
    await writeFile(
      path.join(temporary, "outside.png"),
      "not an allowed asset",
    );
    await symlink(
      path.join(temporary, "outside.png"),
      path.join(checkout, "public/outside.png"),
    );
    await expect(buildSitePreview(config)).rejects.toThrow("regular files");
  });
});

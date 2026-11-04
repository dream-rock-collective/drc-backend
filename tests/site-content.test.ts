import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { createSiteContentRoutes } from "../src/routes/site-content";
import type { SessionVariables } from "../src/middleware/session";
import { listSiteImages, publishEditableSite, readEditableSite } from "../src/site-content";
import { SitePublishError, type SiteConfig } from "../src/site-publishing";

const origin = "http://admin.example.test";
const user = { id: "test-admin", name: "Test Admin", email: "admin@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() };
let directory: string;
let config: SiteConfig;
let content: Record<string, unknown>;
let publishes: number;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "drc-content-api-"));
  await mkdir(path.join(directory, "site/src"), { recursive: true });
  await mkdir(path.join(directory, "site/content"));
  await mkdir(path.join(directory, "site/public/whats-included"), { recursive: true });
  await cp(path.resolve(import.meta.dir, "../../registration-site/src/content.ts"), path.join(directory, "site/src/content.ts"));
  content = JSON.parse(await readFile(path.resolve(import.meta.dir, "../../registration-site/content/initial-page.json"), "utf8"));
  await writeFile(path.join(directory, "site/content/initial-page.json"), JSON.stringify(content));
  await writeFile(path.join(directory, "site/public/whats-included/collage.png"), "fixture");
  await writeFile(path.join(directory, "site/public/leeya-appleby.jpeg"), "fixture");
  await writeFile(path.join(directory, "site/public/ignored.txt"), "not an image");
  config = { mode: "local", checkoutPath: path.join(directory, "site") };
  publishes = 0;
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

function app(authenticated = true, failure?: Error) {
  const application = new Hono<{ Variables: SessionVariables }>();
  application.use("*", async (c, next) => { c.set("user", authenticated ? user : null); await next(); });
  application.route("/", createSiteContentRoutes({
    read: () => readEditableSite(config),
    images: () => listSiteImages(config),
    publish: async (value, revision) => {
      publishes += 1;
      if (failure) throw failure;
      return publishEditableSite(value, revision, config);
    },
    adminOrigin: () => origin,
  }));
  return application;
}

async function requestBody() {
  return { content, revision: (await readEditableSite(config)).revision };
}
const publishRequest = (body: unknown, requestOrigin: string | undefined = origin) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...(requestOrigin === undefined ? {} : { Origin: requestOrigin }) },
  body: JSON.stringify(body),
});

describe("site content HTTP boundary", () => {
  test("all content endpoints require a session", async () => {
    const application = app(false);
    for (const [route, init] of [["", undefined], ["/images", undefined], ["/publish", publishRequest(await requestBody())]] as const) {
      const response = await application.request(`${origin}/api/site-content${route}`, init);
      expect(response.status).toBe(401);
    }
    expect(publishes).toBe(0);
  });

  test("reads validated content with a revision and user-scoped draft key", async () => {
    const response = await app().request(`${origin}/api/site-content`);
    const snapshot = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(snapshot.content).toEqual(content);
    expect(snapshot.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.draftKey).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.draftTarget).toBeUndefined();
    expect(snapshot.mode).toBe("local");
    expect(snapshot.pending).toBe(false);
  });

  test("lists eligible images and excludes symlinks and unrelated files", async () => {
    await symlink(path.join(directory, "site/public/leeya-appleby.jpeg"), path.join(directory, "site/public/link.png"));
    const response = await app().request(`${origin}/api/site-content/images`);
    expect(await response.json()).toEqual({ images: ["/leeya-appleby.jpeg", "/whats-included/collage.png"] });
  });

  test("rejects missing, foreign, null, or malformed origins before publishing", async () => {
    const missingOrigin = publishRequest(await requestBody());
    delete (missingOrigin.headers as Record<string, string>)["Origin"];
    expect((await app().request(`${origin}/api/site-content/publish`, missingOrigin)).status).toBe(403);
    for (const badOrigin of ["", "https://evil.example", "null", "not a URL"]) {
      const response = await app().request(`${origin}/api/site-content/publish`, publishRequest(await requestBody(), badOrigin));
      expect(response.status).toBe(403);
    }
    expect(publishes).toBe(0);
  });

  test("rejects non-JSON, invalid JSON, and invalid envelopes", async () => {
    const application = app();
    const text = await application.request(`${origin}/api/site-content/publish`, { method: "POST", headers: { Origin: origin, "Content-Type": "text/plain" }, body: "{}" });
    expect(text.status).toBe(415);
    const malformed = await application.request(`${origin}/api/site-content/publish`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{" });
    expect(malformed.status).toBe(400);
    for (const invalid of [{}, { content }, { revision: "a".repeat(64) }, { content, revision: "not-a-revision" }, { ...await requestBody(), extra: true }]) {
      expect((await application.request(`${origin}/api/site-content/publish`, publishRequest(invalid))).status).toBe(400);
    }
    expect(publishes).toBe(0);
  });

  test("enforces the request body limit", async () => {
    const response = await app().request(`${origin}/api/site-content/publish`, publishRequest({ content: "x".repeat(512_001), revision: "a".repeat(64) }));
    expect(response.status).toBe(413);
    expect(publishes).toBe(0);
    const understated = publishRequest({ content: "x".repeat(512_001), revision: "a".repeat(64) });
    (understated.headers as Record<string, string>)["Content-Length"] = "2";
    expect((await app().request(`${origin}/api/site-content/publish`, understated)).status).toBe(413);
  });

  test("publishes changed content through the real local publisher", async () => {
    const body = await requestBody();
    body.content["footer"] = { text: "Changed in the editor" };
    const response = await app().request(`${origin}/api/site-content/publish`, publishRequest(body));
    const published = await response.json();
    expect(response.status).toBe(200);
    expect(published.revision).not.toBe(body.revision);
    expect(published.draftKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(await readFile(path.join(config.checkoutPath, "content/initial-page.json"), "utf8"))).toEqual(body.content);
  });

  test("rejects unsafe markup without changing the content file", async () => {
    const before = await readFile(path.join(config.checkoutPath, "content/initial-page.json"), "utf8");
    const body = await requestBody();
    body.content["sections"] = [{ title: "Unsafe", body: '<p onclick="alert(1)">Text</p>' }];
    const response = await app().request(`${origin}/api/site-content/publish`, publishRequest(body));
    expect(response.status).toBe(400);
    expect(await readFile(path.join(config.checkoutPath, "content/initial-page.json"), "utf8")).toBe(before);
  });

  test("rejects unknown, traversal, and symlink images", async () => {
    await writeFile(path.join(directory, "outside.png"), "outside");
    await symlink(path.join(directory, "outside.png"), path.join(config.checkoutPath, "public/escape.png"));
    for (const src of ["/missing.png", "/../outside.png", "/escape.png"]) {
      const body = await requestBody();
      body.content["sections"] = [{ title: "Image", body: "<p>Text</p>", image: { src, alt: "Image" } }];
      expect((await app().request(`${origin}/api/site-content/publish`, publishRequest(body))).status).toBe(400);
    }
  });

  test("blocks stale content rather than overwriting newer edits", async () => {
    const body = await requestBody();
    await writeFile(path.join(config.checkoutPath, "content/initial-page.json"), `${JSON.stringify(content)}\n`);
    const response = await app().request(`${origin}/api/site-content/publish`, publishRequest(body));
    expect(response.status).toBe(409);
  });

  test("maps expected publisher errors and hides unexpected error details", async () => {
    const expected = await app(true, new SitePublishError("Publication is busy", 423)).request(`${origin}/api/site-content/publish`, publishRequest(await requestBody()));
    expect(expected.status).toBe(423);
    expect(await expected.json()).toEqual({ error: "Publication is busy" });
    const unexpected = await app(true, new Error("sensitive diagnostics")).request(`${origin}/api/site-content/publish`, publishRequest(await requestBody()));
    expect(unexpected.status).toBe(500);
    expect(await unexpected.text()).not.toContain("sensitive");
  });

  test("rejects a validator symlink outside the trusted checkout", async () => {
    const file = path.join(config.checkoutPath, "src/content.ts");
    await cp(file, path.join(directory, "external.ts"));
    await rm(file);
    await symlink(path.join(directory, "external.ts"), file);
    const response = await app().request(`${origin}/api/site-content`);
    expect(response.status).toBe(503);
  });
});

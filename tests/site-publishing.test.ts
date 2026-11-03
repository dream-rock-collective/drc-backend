import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { publishSiteContent, readSiteConfig, readSiteContent, type SiteConfig } from "../src/site-publishing";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function git(cwd: string, ...args: string[]) {
  const child = Bun.spawn(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(err);
  return out.trim();
}
async function fixture(remote = false) {
  const root = await mkdtemp(path.join(tmpdir(), "drc-publisher-test-")); roots.push(root);
  const checkout = path.join(root, "site"); await mkdir(path.join(checkout, "content"), { recursive: true });
  await writeFile(path.join(checkout, "content/initial-page.json"), '{"title":"before"}\n');
  const config: SiteConfig = { mode: remote ? "remote" : "local", checkoutPath: checkout };
  if (remote) {
    await git(checkout, "init", "-b", "main");
    await git(checkout, "config", "user.name", "Test"); await git(checkout, "config", "user.email", "test@example.com");
    await git(checkout, "add", "."); await git(checkout, "commit", "-m", "Initial");
    const bare = path.join(root, "remote.git"); await git(root, "init", "--bare", bare);
    await git(checkout, "remote", "add", "origin", bare); await git(checkout, "push", "origin", "main");
    Object.assign(config, { repository: bare, branch: "main", gitName: "Editor", gitEmail: "editor@example.com" });
  }
  return { root, checkout, config };
}

test("requires explicit destination and SSH host verification", () => {
  expect(() => readSiteConfig({})).toThrow("Configure");
  expect(() => readSiteConfig({ SITE_PUBLISH_MODE: "local", SITE_CHECKOUT_PATH: "." })).toThrow("outside");
  expect(() => readSiteConfig({ SITE_PUBLISH_MODE: "remote", SITE_CHECKOUT_PATH: "../site", SITE_REPOSITORY: "git@example.com:site.git", SITE_PUBLISH_BRANCH: "main", SITE_GIT_NAME: "Editor", SITE_GIT_EMAIL: "editor@example.com" })).toThrow("deploy key");
});

test("local mode writes JSON only and rejects stale revisions", async () => {
  const { checkout, config } = await fixture();
  const initial = await readSiteContent(config);
  const result = await publishSiteContent({ title: "after" }, initial.revision, config);
  expect(result.content).toEqual({ title: "after" });
  expect(await Bun.file(path.join(checkout, ".git")).exists()).toBe(false);
  await expect(publishSiteContent({ title: "lost" }, initial.revision, config)).rejects.toThrow("changed");
});

test("serializes competing writes without losing the winner", async () => {
  const { config } = await fixture(); const { revision } = await readSiteContent(config);
  const outcomes = await Promise.allSettled([publishSiteContent({ title: "one" }, revision, config), publishSiteContent({ title: "two" }, revision, config)]);
  expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
});

test("rejects content symlinks", async () => {
  const { root, checkout, config } = await fixture();
  const target = path.join(root, "secret"); await writeFile(target, "{}");
  await rm(path.join(checkout, "content/initial-page.json")); await symlink(target, path.join(checkout, "content/initial-page.json"));
  await expect(readSiteContent(config)).rejects.toThrow("regular paths");
});

test("remote mode commits and pushes only content", async () => {
  const { checkout, config } = await fixture(true); const { revision } = await readSiteContent(config);
  const result = await publishSiteContent({ title: "published" }, revision, config);
  expect(result.commit).toBe(await git(checkout, "rev-parse", "HEAD"));
  expect(await git(checkout, "status", "--porcelain")).toBe("");
  expect(await git(checkout, "ls-remote", "origin", "refs/heads/main")).toStartWith(result.commit!);
  expect(await git(checkout, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD")).toBe("content/initial-page.json");
});

test("refuses dirty checkout and mismatched origin", async () => {
  const { checkout, config } = await fixture(true);
  await writeFile(path.join(checkout, "unrelated"), "keep me");
  await expect(readSiteContent(config)).rejects.toThrow("uncommitted");
  expect(await readFile(path.join(checkout, "unrelated"), "utf8")).toBe("keep me");
  await rm(path.join(checkout, "unrelated"));
  await expect(readSiteContent({ ...config, repository: "/wrong" })).rejects.toThrow("origin");
});

test("refuses multiple fetch or push destinations before writing content", async () => {
  for (const setting of ["url", "pushurl"]) {
    const { root, checkout, config } = await fixture(true);
    const initial = await readSiteContent(config);
    const before = await readFile(path.join(checkout, "content/initial-page.json"), "utf8");
    const extra = path.join(root, "extra.git");
    await git(root, "init", "--bare", extra);
    if (setting === "pushurl") await git(checkout, "config", "--add", "remote.origin.pushurl", config.repository!);
    await git(checkout, "config", "--add", `remote.origin.${setting}`, extra);
    await expect(publishSiteContent({ title: "must not publish" }, initial.revision, config)).rejects.toThrow("origin");
    expect(await readFile(path.join(checkout, "content/initial-page.json"), "utf8")).toBe(before);
    expect(await git(extra, "for-each-ref", "--format=%(refname)")).toBe("");
    expect(await git(checkout, "status", "--porcelain")).toBe("");
  }
});

test("fast forwards newer remote and blocks old draft", async () => {
  const { root, checkout, config } = await fixture(true); const { revision } = await readSiteContent(config);
  const other = path.join(root, "other"); await git(root, "clone", "-b", "main", config.repository!, other);
  await git(other, "config", "user.name", "Other"); await git(other, "config", "user.email", "other@example.com");
  await writeFile(path.join(other, "content/initial-page.json"), '{"title":"newer"}\n'); await git(other, "add", "."); await git(other, "commit", "-m", "Newer"); await git(other, "push");
  await expect(publishSiteContent({ title: "stale" }, revision, config)).rejects.toThrow("changed");
  expect((await readSiteContent(config)).content).toEqual({ title: "newer" });
  expect(await git(checkout, "status", "--porcelain")).toBe("");
});

test("failed push preserves a retryable commit without duplicate commits", async () => {
  const { checkout, config } = await fixture(true); const initial = await readSiteContent(config);
  const hook = path.join(config.repository!, "hooks/pre-receive"); await writeFile(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await expect(publishSiteContent({ title: "retry" }, initial.revision, config)).rejects.toThrow("push failed");
  const commit = await git(checkout, "rev-parse", "HEAD");
  expect((await readSiteContent(config)).pending).toBe(true);
  await expect(publishSiteContent({ title: "different" }, initial.revision, config)).rejects.toThrow("pending");
  await rm(hook);
  const result = await publishSiteContent({ title: "retry" }, initial.revision, config);
  expect(result.commit).toBe(commit); expect(result.pending).toBe(false);
  expect(await git(checkout, "rev-list", "--count", "HEAD")).toBe("2");
});

test("rejects oversized documents and leaves local content unchanged", async () => {
  const { config } = await fixture(); const initial = await readSiteContent(config);
  await expect(publishSiteContent({ body: "a".repeat(512_000) }, initial.revision, config)).rejects.toThrow("512 KB");
  expect((await readSiteContent(config)).revision).toBe(initial.revision);
});

test("rejects wrong branch and unpublished unrelated commits", async () => {
  const { checkout, config } = await fixture(true);
  await expect(readSiteContent({ ...config, branch: "wrong" })).rejects.toThrow("branch");
  await writeFile(path.join(checkout, "unrelated"), "keep"); await git(checkout, "add", "."); await git(checkout, "commit", "-m", "Unpublished");
  await expect(readSiteContent(config)).rejects.toThrow("unpublished commits");
});

test("respects checkout-shared remote lock", async () => {
  const { checkout, config } = await fixture(true); const lock = path.join(checkout, ".git/site-publisher.lock");
  await mkdir(lock);
  await expect(readSiteContent(config)).rejects.toThrow("already running");
  await rm(lock, { recursive: true });
  expect((await readSiteContent(config)).pending).toBe(false);
});

test("preserves a pre-existing temporary file", async () => {
  const { checkout, config } = await fixture(); const { revision } = await readSiteContent(config);
  const unrelated = path.join(checkout, "content/initial-page.json.publishing");
  await writeFile(unrelated, "preserve interrupted operator work");
  await publishSiteContent({ title: "after" }, revision, config);
  expect(await readFile(unrelated, "utf8")).toBe("preserve interrupted operator work");
});

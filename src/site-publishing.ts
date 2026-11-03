import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const siteContentPath = "content/initial-page.json";
export type SiteConfig = {
  mode: "local" | "remote";
  checkoutPath: string;
  repository?: string;
  branch?: string;
  gitName?: string;
  gitEmail?: string;
  deployKeyPath?: string;
  knownHostsPath?: string;
};
export class SitePublishError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function readSiteConfig(environment: Record<string, string | undefined> = process.env, root = process.cwd()): SiteConfig {
  const mode = environment["SITE_PUBLISH_MODE"];
  const checkout = environment["SITE_CHECKOUT_PATH"]?.trim();
  if ((mode !== "local" && mode !== "remote") || !checkout) {
    throw new SitePublishError("Configure SITE_PUBLISH_MODE and SITE_CHECKOUT_PATH to edit site content", 503);
  }
  const config: SiteConfig = { mode, checkoutPath: path.resolve(root, checkout) };
  if (config.checkoutPath === path.resolve(root) || config.checkoutPath.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new SitePublishError("Site checkout must be outside the backend repository", 503);
  }
  if (mode === "remote") {
    const required = (key: string) => {
      const value = environment[key]?.trim();
      if (!value || /[\r\n\0]/.test(value)) throw new SitePublishError(`Configure ${key} for remote publishing`, 503);
      return value;
    };
    config.repository = required("SITE_REPOSITORY");
    if (config.repository.startsWith("-") || /https?:\/\/[^/]*@/.test(config.repository)) {
      throw new SitePublishError("Repository must not contain embedded credentials or Git options", 503);
    }
    config.branch = required("SITE_PUBLISH_BRANCH");
    config.gitName = required("SITE_GIT_NAME");
    config.gitEmail = required("SITE_GIT_EMAIL");
    const key = environment["SITE_DEPLOY_KEY_PATH"]?.trim();
    const hosts = environment["SITE_KNOWN_HOSTS_PATH"]?.trim();
    if (key || hosts || /^(?:ssh:\/\/|[^/]+@[^:]+:)/.test(config.repository)) {
      if (!key || !hosts) throw new SitePublishError("SSH publishing requires a deploy key and known-hosts file", 503);
      config.deployKeyPath = path.resolve(root, key);
      config.knownHostsPath = path.resolve(root, hosts);
    }
  }
  return config;
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
async function git(config: SiteConfig, args: string[]): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
  env["GIT_TERMINAL_PROMPT"] = "0";
  if (config.deployKeyPath && config.knownHostsPath) {
    env["GIT_SSH_COMMAND"] = `ssh -F /dev/null -i ${quote(config.deployKeyPath)} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${quote(config.knownHostsPath)}`;
  }
  const checkout = await realpath(config.checkoutPath);
  const child = Bun.spawn(["git", "-C", checkout, "-c", `safe.directory=${checkout}`, "-c", "core.hooksPath=/dev/null", ...args], { env, stdout: "pipe", stderr: "pipe" });
  const timeout = setTimeout(() => child.kill(), 30_000);
  const [output, , exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]).finally(() => clearTimeout(timeout));
  if (exitCode !== 0) throw new SitePublishError(`Git ${args[0]} failed; check checkout, remote access, and branch state`, 502);
  return output.trim();
}

async function destination(config: SiteConfig): Promise<string> {
  const checkout = await realpath(config.checkoutPath);
  const parent = await realpath(path.join(checkout, "content"));
  const file = path.join(parent, "initial-page.json");
  if (parent !== path.join(checkout, "content") || await realpath(file) !== file || !(await stat(file)).isFile()) {
    throw new SitePublishError("Content file and directory must be regular paths inside the site checkout");
  }
  return file;
}

type Pending = { revision: string; contentHash: string; commit: string; parent: string };
const pendingPath = (config: SiteConfig) => path.join(config.checkoutPath, ".git/site-publisher-pending.json");
async function pendingPublication(config: SiteConfig): Promise<Pending | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(pendingPath(config), "utf8"));
    if (!parsed || typeof parsed !== "object" || !("revision" in parsed) || !("contentHash" in parsed) || !("commit" in parsed) || !("parent" in parsed) ||
      typeof parsed.revision !== "string" || typeof parsed.contentHash !== "string" || typeof parsed.commit !== "string" || typeof parsed.parent !== "string") {
      throw new SitePublishError("Invalid pending publication metadata; operator recovery required");
    }
    return { revision: parsed.revision, contentHash: parsed.contentHash, commit: parsed.commit, parent: parsed.parent };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function remoteState(config: SiteConfig): Promise<{ head: string; remote: string }> {
  const checkout = await realpath(config.checkoutPath);
  if (await realpath(path.join(checkout, ".git")) !== path.join(checkout, ".git") || !(await stat(path.join(checkout, ".git"))).isDirectory() || await git(config, ["rev-parse", "--show-toplevel"]) !== checkout) {
    throw new SitePublishError("Remote publication requires a dedicated checkout with its own .git directory");
  }
  await git(config, ["check-ref-format", "--branch", config.branch!]);
  if (await git(config, ["branch", "--show-current"]) !== config.branch) throw new SitePublishError("Checkout is not on the configured publication branch");
  if (await git(config, ["remote", "get-url", "--all", "origin"]) !== config.repository || await git(config, ["remote", "get-url", "--push", "--all", "origin"]) !== config.repository) {
    throw new SitePublishError("Checkout origin does not match SITE_REPOSITORY");
  }
  for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
    if (await Bun.file(path.join(checkout, ".git", name)).exists() || await stat(path.join(checkout, ".git", name)).then(() => true, () => false)) {
      throw new SitePublishError("Finish the in-progress Git operation before publishing");
    }
  }
  if (await git(config, ["status", "--porcelain", "--untracked-files=all"])) throw new SitePublishError("Publication checkout has uncommitted files; preserve and reconcile them before publishing");
  await git(config, ["fetch", "--no-tags", "origin", `refs/heads/${config.branch}`]);
  return { head: await git(config, ["rev-parse", "HEAD"]), remote: await git(config, ["rev-parse", "FETCH_HEAD"]) };
}

async function synchronize(config: SiteConfig) {
  const state = await remoteState(config);
  const pending = await pendingPublication(config);
  if (pending) {
    if (state.head !== pending.commit || await git(config, ["rev-parse", "HEAD^"]) !== pending.parent ||
      await git(config, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]) !== siteContentPath ||
      hash(await readFile(await destination(config), "utf8")) !== pending.contentHash) {
      throw new SitePublishError("Pending publication changed; operator recovery required");
    }
    if (state.remote === pending.commit) {
      await rm(pendingPath(config));
      return undefined;
    }
    if (state.remote !== pending.parent) throw new SitePublishError("Remote changed while publication was pending; reconcile before retrying");
    return pending;
  }
  if (state.head !== state.remote) {
    const ancestor = await git(config, ["merge-base", state.head, state.remote]);
    if (ancestor !== state.head) throw new SitePublishError("Checkout has unpublished commits or diverged from remote");
    await git(config, ["merge", "--ff-only", state.remote]);
  }
  return undefined;
}

let queue: Promise<unknown> = Promise.resolve();
async function locked<T>(config: SiteConfig, operation: () => Promise<T>): Promise<T> {
  const run = queue.catch(() => undefined).then(async () => {
    const checkout = await realpath(config.checkoutPath);
    if (config.mode === "remote" && await realpath(path.join(checkout, ".git")) !== path.join(checkout, ".git")) {
      throw new SitePublishError("Remote checkout Git directory must not be a symlink");
    }
    const lock = config.mode === "remote"
      ? path.join(checkout, ".git/site-publisher.lock")
      : path.join(tmpdir(), `drc-site-publisher-${hash(checkout)}.lock`);
    try { await mkdir(lock); } catch { throw new SitePublishError("Site publication is already running (or a stale publisher lock requires operator removal)", 423); }
    try { return await operation(); } finally { await rm(lock, { recursive: true, force: true }); }
  });
  queue = run;
  return run;
}

async function snapshot(config: SiteConfig, pending = false) {
  const raw = await readFile(await destination(config), "utf8");
  return { content: JSON.parse(raw) as unknown, revision: hash(raw), mode: config.mode, pending };
}
export async function readSiteContent(config = readSiteConfig()) {
  return locked(config, async () => {
    const pending = config.mode === "remote" ? await synchronize(config) : undefined;
    return snapshot(config, Boolean(pending));
  });
}

export async function publishSiteContent(content: unknown, revision: string, config = readSiteConfig()) {
  return locked(config, async () => {
    const pending = config.mode === "remote" ? await synchronize(config) : undefined;
    const file = await destination(config);
    const before = await readFile(file, "utf8");
    const serialized = `${JSON.stringify(content, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > 512_000) throw new SitePublishError("Site content exceeds 512 KB", 413);
    if (pending) {
      if ((revision !== pending.revision && revision !== hash(before)) || hash(serialized) !== pending.contentHash) {
        throw new SitePublishError("Retry the pending publication before changing its content");
      }
      await git(config, ["push", "origin", `HEAD:refs/heads/${config.branch}`]);
      await rm(pendingPath(config));
      return { ...await snapshot(config), commit: pending.commit };
    }
    if (revision !== hash(before)) throw new SitePublishError("Site content changed; reload and review the newer content before publishing");
    if (serialized === before) return snapshot(config);
    const temporary = `${file}.publishing-${randomUUID()}`;
    try {
      await writeFile(temporary, serialized, { flag: "wx" });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
    if (config.mode === "local") return snapshot(config);
    const parent = await git(config, ["rev-parse", "HEAD"]);
    try {
      await git(config, ["add", "--", siteContentPath]);
      await git(config, ["-c", `user.name=${config.gitName}`, "-c", `user.email=${config.gitEmail}`, "commit", "-m", "Update initial page content", "--", siteContentPath]);
    } catch (error) {
      // Keep the edited file for operator recovery rather than discarding content.
      throw error;
    }
    const commit = await git(config, ["rev-parse", "HEAD"]);
    await writeFile(pendingPath(config), JSON.stringify({ revision, contentHash: hash(serialized), commit, parent }), { flag: "wx" });
    await git(config, ["push", "origin", `HEAD:refs/heads/${config.branch}`]);
    await rm(pendingPath(config));
    return { ...await snapshot(config), commit };
  });
}

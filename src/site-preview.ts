import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSiteConfig, SitePublishError } from "./site-publishing";

const mediaTypes: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
type Build = {
  directory: string;
  files: Map<string, { file: string; mediaType: string }>;
};
const builds = new Map<string, Build>();
let buildQueue: Promise<unknown> = Promise.resolve();

async function fingerprint(checkout: string): Promise<string> {
  const digest = createHash("sha256").update(checkout);
  async function include(relative: string): Promise<void> {
    const file = path.join(checkout, relative);
    if ((await realpath(file)) !== file)
      throw new SitePublishError(
        "Preview source and asset paths must stay inside the site checkout",
        503,
      );
    digest.update(relative).update(await readFile(file));
  }
  async function visit(relative: string): Promise<void> {
    const directory = path.join(checkout, relative);
    if ((await realpath(directory)) !== directory)
      throw new SitePublishError(
        "Preview source and asset directories must not be symlinks",
        503,
      );
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) await include(child);
      else
        throw new SitePublishError(
          "Preview source and assets must be regular files",
          503,
        );
    }
  }
  for (const file of [
    "preview.html",
    "vite.preview.config.ts",
    "package.json",
    "bun.lock",
  ])
    await include(file);
  await visit("src");
  await visit("public");
  return digest.digest("hex");
}

async function manifest(directory: string): Promise<Build["files"]> {
  const files: Build["files"] = new Map();
  async function visit(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const name = path.posix.join(relative, entry.name);
      const file = path.join(directory, name);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && (await realpath(file)) === file) {
        const mediaType =
          name === "preview.html"
            ? "text/html"
            : mediaTypes[path.extname(name).toLowerCase()];
        if (mediaType) files.set(name, { file, mediaType });
      } else
        throw new SitePublishError(
          "Preview build contains an unsafe asset path",
          503,
        );
    }
  }
  await visit("");
  if (!files.has("preview.html"))
    throw new SitePublishError(
      "Preview build did not produce preview.html",
      503,
    );
  return files;
}

export async function buildSitePreview(
  config = readSiteConfig(),
): Promise<{ id: string }> {
  const task = buildQueue
    .catch(() => undefined)
    .then(async () => {
      const checkout = await realpath(config.checkoutPath);
      let id: string;
      try {
        id = await fingerprint(checkout);
      } catch (error) {
        if (error instanceof SitePublishError) throw error;
        throw new SitePublishError(
          "Site preview source is missing; deploy the matching registration-site code",
          503,
        );
      }
      if (builds.has(id)) return { id };
      const temporary = await mkdtemp(path.join(tmpdir(), "drc-site-preview-"));
      const directory = path.join(temporary, "build");
      try {
        const base = `/api/site-preview/builds/${id}/`;
        const child = Bun.spawn(
          [
            process.execPath,
            "node_modules/vite/bin/vite.js",
            "build",
            "--config",
            "vite.preview.config.ts",
            "--base",
            base,
            "--outDir",
            directory,
          ],
          {
            cwd: checkout,
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const timeout = setTimeout(() => child.kill(), 90_000);
        const [, , exitCode] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]).finally(() => clearTimeout(timeout));
        if (exitCode !== 0)
          throw new SitePublishError(
            "Could not build preview. Run bun install --frozen-lockfile in the site checkout and verify bun run build:preview",
            503,
          );
        builds.set(id, { directory, files: await manifest(directory) });
        // shortcut: keep the last three source builds, increase only if editors need older open previews.
        while (builds.size > 3) {
          const oldest = builds.entries().next().value;
          if (!oldest) break;
          builds.delete(oldest[0]);
          await rm(path.dirname(oldest[1].directory), {
            recursive: true,
            force: true,
          });
        }
        return { id };
      } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        if (error instanceof SitePublishError) throw error;
        throw new SitePublishError(
          "Could not start preview build; install the site's locked dependencies first",
          503,
        );
      }
    });
  buildQueue = task;
  return task;
}

export async function readPreviewAsset(id: string, requested: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) return undefined;
  let name: string;
  try {
    name = decodeURIComponent(requested);
  } catch {
    return undefined;
  }
  if (
    !name ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.split("/").some((part) => part === "." || part === ".." || part === "")
  )
    return undefined;
  const asset = builds.get(id)?.files.get(name);
  if (
    !asset ||
    (await realpath(asset.file).catch(() => undefined)) !== asset.file
  )
    return undefined;
  return asset;
}

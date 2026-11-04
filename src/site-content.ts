import { createHash } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { publishSiteContent, readSiteConfig, readSiteContent, SitePublishError, type SiteConfig } from "./site-publishing";

type ContentModule = {
  validateInitialPageContent: (value: unknown) => unknown;
  validateImagePath: (value: string) => boolean;
};

async function contentModule(config: SiteConfig): Promise<ContentModule> {
  const checkout = await realpath(config.checkoutPath);
  const file = path.join(checkout, "src/content.ts");
  if (await realpath(file) !== file) throw new SitePublishError("Site content validator must be inside the configured checkout", 503);
  const info = await stat(file);
  const module: unknown = await import(`${pathToFileURL(file).href}?version=${info.mtimeMs}-${info.size}`);
  if (!module || typeof module !== "object" || !("validateInitialPageContent" in module) || typeof module.validateInitialPageContent !== "function" || !("validateImagePath" in module) || typeof module.validateImagePath !== "function") {
    throw new SitePublishError("Site checkout does not provide the content validator", 503);
  }
  return module as ContentModule;
}

async function images(config: SiteConfig, module: ContentModule): Promise<string[]> {
  const checkout = await realpath(config.checkoutPath);
  const publicDirectory = path.join(checkout, "public");
  if (await realpath(publicDirectory) !== publicDirectory) throw new SitePublishError("Site assets must be inside the configured checkout", 503);
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        const source = `/${path.relative(publicDirectory, file).split(path.sep).join("/")}`;
        if (module.validateImagePath(source)) result.push(source);
      }
    }
  }
  await visit(publicDirectory);
  return result.sort();
}

function validateContent(module: ContentModule, value: unknown): unknown {
  try { return module.validateInitialPageContent(value); }
  catch (error) {
    throw new SitePublishError(error instanceof Error ? error.message : "Invalid site content", 400);
  }
}

function validateImages(content: unknown, available: string[]): void {
  if (!content || typeof content !== "object" || !("sections" in content) || !Array.isArray(content.sections)) throw new SitePublishError("Invalid content sections", 400);
  for (const section of content.sections) {
    if (section && typeof section === "object" && "image" in section) {
      const image: unknown = section.image;
      if (!image || typeof image !== "object" || !("src" in image) || typeof image.src !== "string" || !available.includes(image.src)) {
        throw new SitePublishError("Section image must be an existing site asset", 400);
      }
    }
  }
}

async function draftTarget(config: SiteConfig): Promise<string> {
  return createHash("sha256").update(await realpath(config.checkoutPath)).digest("hex");
}

export async function readEditableSite(config = readSiteConfig()) {
  const snapshot = await readSiteContent(config);
  const module = await contentModule(config);
  const content = validateContent(module, snapshot.content);
  validateImages(content, await images(config, module));
  return { ...snapshot, content, draftTarget: await draftTarget(config) };
}

export async function listSiteImages(config = readSiteConfig()): Promise<string[]> {
  await readSiteContent(config);
  return images(config, await contentModule(config));
}

export async function publishEditableSite(value: unknown, revision: string, config = readSiteConfig()) {
  // Synchronize before loading the checkout's authoritative validation rules.
  await readSiteContent(config);
  const module = await contentModule(config);
  const content = validateContent(module, value);
  validateImages(content, await images(config, module));
  return { ...await publishSiteContent(content, revision, config), draftTarget: await draftTarget(config) };
}

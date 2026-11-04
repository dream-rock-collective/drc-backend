import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import initialContent from "../../registration-site/content/initial-page.json" with { type: "json" };

const site = path.resolve(import.meta.dirname, "../../registration-site");
test.beforeAll(() => {
  execFileSync("bun", ["run", "build:preview", "--base", "/preview-fixture/"], {
    cwd: site,
  });
});

for (const width of [1280, 390]) {
  test(`edit other pages, restore draft, preview and publish at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let content = structuredClone(initialContent);
    let revision = "a".repeat(64);
    let publications = 0;
    const snapshot = () => ({
      content,
      revision,
      mode: "local",
      pending: false,
      draftKey: "test-editor",
    });
    await page.route("**/api/site-content", (route) =>
      route.fulfill({ json: snapshot() }),
    );
    await page.route("**/api/site-content/images", (route) =>
      route.fulfill({
        json: {
          images: ["/leeya-appleby.jpeg", "/whats-included/collage.png"],
        },
      }),
    );
    await page.route("**/api/site-content/publish", async (route) => {
      const body = route.request().postDataJSON();
      expect(body.revision).toBe(revision);
      content = body.content;
      publications++;
      revision = "b".repeat(64);
      await route.fulfill({ json: snapshot() });
    });
    await page.route("**/api/site-preview", (route) =>
      route.fulfill({
        json: {
          token: "c".repeat(64),
          url: `/preview-fixture/preview.html?token=${"c".repeat(64)}&parentOrigin=http://127.0.0.1:5180`,
        },
      }),
    );
    await page.route("**/preview-fixture/**", async (route) => {
      const name = new URL(route.request().url()).pathname.replace(
        "/preview-fixture/",
        "",
      );
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpeg": "image/jpeg",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
      };
      const file =
        name.startsWith("assets/") || name === "preview.html"
          ? path.join(site, "dist-preview", name)
          : path.join(site, "public", name);
      await route.fulfill({
        body: await readFile(file),
        contentType: mime[path.extname(name)] ?? "application/octet-stream",
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/editor");
    const selectPage = page.getByLabel("Page", { exact: true });
    const preview = page.frameLocator('iframe[title="Website page preview"]');
    await expect(
      preview.getByRole("heading", { name: "Mail Drops", exact: true }),
    ).toBeVisible();
    await selectPage.selectOption("donations");
    await expect(preview.locator(".allocation-column")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await page
      .getByLabel("Section 4 title", { exact: true })
      .fill("Local Charity");
    await page
      .getByLabel("Section 4 charity key", { exact: true })
      .fill("local-charity");
    await page
      .getByLabel("Section 4 URL", { exact: true })
      .fill("https://example.com/local");
    await page
      .getByRole("combobox", { name: /Section 4 image/ })
      .selectOption("/leeya-appleby.jpeg");
    await page
      .getByLabel("Section 4 image alt text", { exact: true })
      .fill("Local charity image");
    await page
      .getByRole("button", { name: "Move section 4 up", exact: true })
      .click();
    await expect(
      page.getByLabel("Section 3 charity key", { exact: true }),
    ).toHaveValue("local-charity");
    await page
      .getByRole("button", { name: "Remove section 2", exact: true })
      .click();
    await expect(preview.locator(".allocation-column")).toHaveCount(3);
    await expect(
      preview.locator('.allocation-column[data-organization="local-charity"]'),
    ).toHaveCount(1);
    await expect(
      preview.getByRole("button", { name: "Submit", exact: true }),
    ).toBeDisabled();
    await selectPage.selectOption("subscriptions");
    await page
      .getByRole("textbox", { name: "Subscriptions / Title", exact: true })
      .fill("Choose your mail");
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await page
      .getByLabel("Section 2 title", { exact: true })
      .fill("Extra information");
    await selectPage.selectOption("success");
    await page
      .getByRole("textbox", { name: "Success / Title", exact: true })
      .fill("Thank you, friend!");
    await expect(
      page.getByRole("button", { name: "Add section", exact: true }),
    ).toHaveCount(0);
    await expect(
      preview.getByRole("heading", { name: "Thank you, friend!" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Restored your unpublished browser draft."),
    ).toBeVisible();
    await selectPage.selectOption("subscriptions");
    await expect(
      page.getByRole("textbox", { name: "Subscriptions / Title", exact: true }),
    ).toHaveValue("Choose your mail");
    await expect(
      page.getByLabel("Section 2 title", { exact: true }),
    ).toHaveValue("Extra information");
    await selectPage.selectOption("donations");
    await expect(
      page.getByLabel("Section 2 charity key", { exact: true }),
    ).toHaveValue("local-charity");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("local-charity");
    await expect(page.getByRole("dialog")).toContainText("Thank you, friend!");
    await page
      .getByRole("button", { name: "Confirm publish", exact: true })
      .click();
    await expect(
      page.getByText("Published to the local site checkout."),
    ).toBeVisible();
    expect(publications).toBe(1);
    expect(content.donations.sections.map((section) => section.key)).toEqual([
      "weAllWeGotSd",
      "local-charity",
      "otayMesaDetentionResistance",
    ]);
    expect(content.subscriptions.sections).toHaveLength(2);
    expect(content.success.title).toBe("Thank you, friend!");
    await page.reload();
    await expect(
      page.getByText("No unpublished changes", { exact: true }),
    ).toBeVisible();
    await selectPage.selectOption("donations");
    await page
      .getByRole("button", { name: "Remove section 3", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove section 2", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove section 1", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Mobile", exact: true }).click();
    await expect(page.locator(".preview-mobile")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

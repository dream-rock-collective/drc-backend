import { expect, test } from "@playwright/test";
import initialContent from "../../registration-site/content/initial-page.json" with { type: "json" };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/site-content", (route) =>
    route.fulfill({
      json: {
        content: initialContent,
        revision: "a".repeat(64),
        mode: "local",
        pending: false,
        draftKey: "layout-check",
      },
    }),
  );
  await page.route("**/api/site-content/images", (route) =>
    route.fulfill({ json: { images: [] } }),
  );
  await page.route("**/api/site-preview", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Preview temporarily unavailable" },
    }),
  );
});

test("editor panes keep growing beyond 1600px and remain equally sized", async ({
  page,
}) => {
  await page.goto("/editor");
  await expect(
    page.getByRole("heading", { name: "Live preview" }),
  ).toBeVisible();
  let previousWidth = 0;
  for (const width of [1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1080 });
    const fields = await page.locator(".content-fields").boundingBox();
    const preview = await page.locator(".content-preview").boundingBox();
    expect(fields).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(fields!.width).toBeGreaterThan(previousWidth + 100);
    expect(Math.abs(fields!.width - preview!.width)).toBeLessThan(1);
    expect(
      Math.abs(fields!.x - (width - preview!.x - preview!.width)),
    ).toBeLessThan(1);
    previousWidth = fields!.width;
  }
});

for (const width of [320, 390, 768, 1000, 1001]) {
  test(`all editor pages and review dialog fit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/editor");
    await expect(
      page.getByRole("button", { name: "Retry preview" }),
    ).toBeVisible();
    for (const selected of ["main", "subscriptions", "donations", "success"]) {
      await page.getByLabel("Page", { exact: true }).selectOption(selected);
      if (selected === "main") {
        for (const panel of await page.locator("details.content-panel").all()) {
          await panel.locator("summary").click();
        }
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const overflowing = await page
        .locator(
          "main textarea, main select, .rich-input, .rich-toolbar, .section-controls button",
        )
        .evaluateAll((elements) =>
          elements
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.width > 0 && (rect.left < 0 || rect.right > innerWidth + 1)
              );
            })
            .map((element) => element.outerHTML),
        );
      expect(overflowing).toEqual([]);
      const clippedCopy = await page
        .locator("main textarea")
        .evaluateAll((elements) =>
          elements
            .filter(
              (element) =>
                element.clientHeight > 0 &&
                element.scrollHeight > element.clientHeight + 1,
            )
            .map((element) => element.outerHTML),
        );
      expect(clippedCopy).toEqual([]);
    }
    await page
      .getByRole("textbox", { name: "Success / Title", exact: true })
      .fill("A long revised title ".repeat(15));
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await expect(
      page.getByRole("button", { name: "Keep editing" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Success / Title", exact: true }),
    ).toHaveValue("A long revised title ".repeat(15));
  });
}

test("preview retries and newer content checks preserve an unpublished draft", async ({
  page,
}) => {
  await page.goto("/editor");
  await page.getByLabel("Page", { exact: true }).selectOption("success");
  const title = page.getByRole("textbox", {
    name: "Success / Title",
    exact: true,
  });
  await title.fill("My unpublished title");
  await expect(page.getByRole("alert")).toContainText(
    "Preview temporarily unavailable",
  );
  let retries = 0;
  await page.route("**/api/site-preview", (route) => {
    retries++;
    return route.fulfill({
      status: 503,
      json: { error: "Preview build still unavailable" },
    });
  });
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Preview build still unavailable",
  );
  expect(retries).toBeGreaterThan(0);
  await expect(title).toHaveValue("My unpublished title");
  await page.route("**/api/site-content", (route) =>
    route.fulfill({
      json: {
        content: initialContent,
        revision: "b".repeat(64),
        mode: "local",
        pending: false,
        draftKey: "layout-check",
      },
    }),
  );
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(
    page.getByRole("region", { name: "Review newer content" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use reviewed draft" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByText("Restored your unpublished browser draft."),
  ).toBeVisible();
  await page.getByLabel("Page", { exact: true }).selectOption("success");
  await expect(title).toHaveValue("My unpublished title");
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I reviewed the newer content and my draft.",
    })
    .check();
  await page.getByRole("button", { name: "Use reviewed draft" }).click();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeEnabled();
});

test("failed publishing preserves the draft and allows another review", async ({
  page,
}) => {
  let publications = 0;
  await page.route("**/api/site-content/publish", (route) => {
    publications++;
    return route.fulfill({
      status: 500,
      json: { error: "Checkout unavailable" },
    });
  });
  await page.goto("/editor");
  await page.getByLabel("Page", { exact: true }).selectOption("success");
  const title = page.getByRole("textbox", {
    name: "Success / Title",
    exact: true,
  });
  await title.fill("Keep this unpublished copy");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  expect(publications).toBe(0);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm publish" }).click();
  await expect(
    page.getByText("Checkout unavailable", { exact: true }),
  ).toBeVisible();
  expect(publications).toBe(1);
  await expect(title).toHaveValue("Keep this unpublished copy");
  await page.reload();
  await page.getByLabel("Page", { exact: true }).selectOption("success");
  await expect(title).toHaveValue("Keep this unpublished copy");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Keep this unpublished copy",
  );
  await page.keyboard.press("Escape");
  expect(publications).toBe(1);
});

test("expired editor sessions return to sign in", async ({ page }) => {
  await page.route("**/api/site-content", (route) =>
    route.fulfill({ status: 401, json: { error: "Unauthorized" } }),
  );
  await page.goto("/editor");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
});

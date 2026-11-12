import { expect, test } from "@playwright/test";
import { validateInitialPageContent } from "../../registration-site/src/content";
import initialContent from "../../registration-site/content/initial-page.json" with { type: "json" };

for (const width of [1280, 390]) {
  test(`allocation confirmation copy restores and publishes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let content = validateInitialPageContent(initialContent);
    let revision = "a".repeat(64);
    const snapshot = () => ({
      content,
      revision,
      mode: "local",
      pending: false,
      draftKey: "allocation-copy",
    });
    await page.route("**/api/site-content", (route) =>
      route.fulfill({ json: snapshot() }),
    );
    await page.route("**/api/site-content/images", (route) =>
      route.fulfill({ json: { images: [] } }),
    );
    await page.route("**/api/site-preview", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Preview unavailable in this test" },
      }),
    );
    await page.route("**/api/site-content/publish", async (route) => {
      content = validateInitialPageContent(
        route.request().postDataJSON().content,
      );
      revision = "b".repeat(64);
      await route.fulfill({ json: snapshot() });
    });
    await page.goto("/editor");
    await page.getByLabel("Page", { exact: true }).selectOption("donations");
    await page
      .getByRole("textbox", {
        name: "Donations / Allocation Success Title",
        exact: true,
      })
      .fill("Allocation saved!");
    await page
      .getByRole("textbox", {
        name: "Donations / Allocation Success Subtext",
        exact: true,
      })
      .fill("Your letter is on its way.");
    await page.reload();
    await page.getByLabel("Page", { exact: true }).selectOption("donations");
    await expect(
      page.getByRole("textbox", {
        name: "Donations / Allocation Success Title",
        exact: true,
      }),
    ).toHaveValue("Allocation saved!");
    await expect(
      page.getByRole("textbox", {
        name: "Donations / Allocation Success Subtext",
        exact: true,
      }),
    ).toHaveValue("Your letter is on its way.");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Allocation saved!");
    await page
      .getByRole("button", { name: "Confirm publish", exact: true })
      .click();
    await expect(
      page.getByText("Published to the local site checkout."),
    ).toBeVisible();
    expect(content.donations.allocationSuccessTitle).toBe("Allocation saved!");
    expect(content.donations.allocationSuccessSubtext).toBe(
      "Your letter is on its way.",
    );
  });
}

import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Registration } from "../src/client/types";

const base: Registration = {
  id: 1, name: 'River "Rock", Jr.', email: "river@example.com",
  address: "123 Main St\nUnit 2", birthday: null, notes: null,
  stripe_payment_intent_id: null, stripe_customer_id: null, stripe_subscription_id: null,
  plan: "monthly", payment_status: "pending", latest_allocation: null,
  created_at: "2026-01-01T00:00:00Z", deleted: false,
};
const registrations: Registration[] = [
  base,
  { ...base, id: 2, name: "Yearly Person", plan: "yearly", payment_status: "paid" },
  { ...base, id: 3, name: "One-time Person", plan: "once", payment_status: "failed" },
  { ...base, id: 4, name: "No-plan Person", plan: null },
  { ...base, id: 5, name: "Deleted Person", deleted: true },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/registrations", (route) => route.fulfill({ json: { registrations } }));
  await page.goto("/");
  await expect(page.getByRole("cell", { name: "Yearly Person", exact: true })).toBeVisible();
});

test("defaults, cancellation, and keyboard focus", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Export CSV", exact: true });
  await expect(page.getByRole("button", { name: "Export JSON" })).toHaveCount(0);
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "Export CSV" });
  await expect(modal.getByRole("group")).toHaveCount(2);
  await expect(modal.locator("input:checked")).toHaveCount(8);
  await expect(modal.getByRole("status")).toHaveText("4 registrations selected");
  const first = modal.getByRole("checkbox", { name: "Monthly", exact: true });
  const last = modal.getByRole("button", { name: "Export CSV", exact: true });
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await modal.getByRole("checkbox", { name: "Email", exact: true }).uncheck();
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(modal.getByRole("checkbox", { name: "Email", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("downloads filtered CSV with selected columns and remembers the export", async ({ page }) => {
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const modal = page.getByRole("dialog");
  for (const name of ["Yearly", "One-time", "No payment", "Email"]) {
    await modal.getByRole("checkbox", { name, exact: true }).uncheck();
  }
  await expect(modal.getByRole("status")).toHaveText("1 registration selected");
  const downloadEvent = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("dreamrock-registrations.csv");
  const path = await download.path();
  if (!path) throw new Error("CSV download did not produce a file");
  expect(await readFile(path, "utf8")).toBe('Name,Address,Birthday\r\n"River ""Rock"", Jr.","123 Main St\nUnit 2",');
  await expect(modal).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await expect(modal.getByRole("checkbox", { name: "Monthly", exact: true })).toBeChecked();
  for (const name of ["Yearly", "One-time", "No payment", "Email"]) {
    await expect(modal.getByRole("checkbox", { name, exact: true })).not.toBeChecked();
  }
});

test("disables export without plans, columns, or matching registrations", async ({ page }) => {
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const modal = page.getByRole("dialog");
  const button = modal.getByRole("button", { name: "Export CSV", exact: true });
  for (const checkbox of await modal.getByRole("group", { name: "Payment plans" }).getByRole("checkbox").all()) {
    await checkbox.uncheck();
  }
  await expect(button).toBeDisabled();
  await modal.getByRole("checkbox", { name: "No payment", exact: true }).check();
  await expect(button).toBeEnabled();
  for (const checkbox of await modal.getByRole("group", { name: "Include columns" }).getByRole("checkbox").all()) {
    await checkbox.uncheck();
  }
  await expect(button).toBeDisabled();
  await modal.getByRole("button", { name: "Cancel" }).click();
  await page.route("**/registrations", (route) => route.fulfill({ json: { registrations: [] } }));
  await page.reload();
  await expect(page.getByText("No active registrations.").first()).toBeVisible();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await expect(modal.getByRole("status")).toHaveText("0 registrations selected");
  await expect(button).toBeDisabled();
});

test("recovers invalid preferences and stays usable on mobile", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("dreamrock:registrations:export-selection", "invalid"));
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.locator("input:checked")).toHaveCount(8);
  await expect(modal).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(modal).toHaveCSS("box-shadow", "none");
  await expect(modal.getByRole("checkbox").first()).toHaveCSS("border-radius", "0px");
  const box = await modal.boundingBox();
  if (!box) throw new Error("Export modal is not rendered");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toHaveCount(0);
});

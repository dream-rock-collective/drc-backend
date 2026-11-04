import { expect, test } from "bun:test";
import { isPreviewMessage, parsePreviewDestination } from "../src/client/ContentPreview";

test("preview destinations remain on the authenticated backend", () => {
  expect(parsePreviewDestination({ url: "/api/site-preview/page?token=x", token: "x" }, "https://admin.example.test")).toEqual({ url: "https://admin.example.test/api/site-preview/page?token=x", token: "x" });
  expect(() => parsePreviewDestination({ url: "https://elsewhere.test/", token: "x" }, "https://admin.example.test")).toThrow();
  expect(() => parsePreviewDestination({ url: "/api/site-preview/page", token: "" }, "https://admin.example.test")).toThrow();
});
test("preview messages require the active token and a known message shape", () => {
  expect(isPreviewMessage({ type: "drc-preview-ready", token: "active" }, "active")).toBe(true);
  expect(isPreviewMessage({ type: "drc-preview-rendered", token: "active", error: "Invalid content" }, "active")).toBe(true);
  expect(isPreviewMessage({ type: "drc-preview-ready", token: "old" }, "active")).toBe(false);
  expect(isPreviewMessage({ type: "unknown", token: "active" }, "active")).toBe(false);
  expect(isPreviewMessage({ type: "drc-preview-rendered", token: "active", error: 7 }, "active")).toBe(false);
  expect(isPreviewMessage(null, "active")).toBe(false);
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  forbidOnly: Boolean(process.env["CI"]),
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5180", browserName: "chromium" },
  webServer: {
    command: "bun run frontend:dev --host 127.0.0.1 --port 5180 --strictPort",
    url: "http://127.0.0.1:5180",
  },
});

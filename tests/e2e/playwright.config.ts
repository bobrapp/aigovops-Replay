import { defineConfig } from "@playwright/test";

const TEST_API_PORT = 28080;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  globalTeardown: "./src/global-teardown.ts",

  use: {
    baseURL: `http://127.0.0.1:${TEST_API_PORT}`,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
});

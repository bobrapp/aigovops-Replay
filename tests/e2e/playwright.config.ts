import { defineConfig, devices } from "@playwright/test";

const TEST_API_PORT = 28080;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  globalTeardown: "./src/global-teardown.ts",

  // Tests use absolute URLs (the spawned API runs on 127.0.0.1:28080 while
  // the proxy/browser tests hit http://localhost:80), so no global baseURL
  // is set — each suite passes its own.
  use: {
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  // Two projects:
  //   • api      — pure HTTP suite against the spawned mock-OIDC API server
  //   • browser  — chromium-driven proxy + UI navigation suite
  projects: [
    {
      name: "api",
      testMatch: /api\.spec\.ts$/,
    },
    {
      name: "browser",
      testMatch: /proxy-browser\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
});

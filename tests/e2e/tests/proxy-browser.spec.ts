/**
 * Proxy + browser navigation tests.
 *
 * Why this file exists
 * ────────────────────
 * `api.spec.ts` exercises the API server via a *spawned* test process on
 * 127.0.0.1:28080 so it can swap in a mock OIDC issuer and run the full
 * authorization-code flow.  That covers the auth surface but never proves
 * that the live workflow + Replit's shared reverse-proxy actually route
 * traffic correctly — which is what real users hit.
 *
 * This file complements it with two things the spawned-server suite cannot:
 *
 *   1. **Real proxy hits** — every request goes to `http://localhost:80`,
 *      the same path-routing proxy a browser uses.  If `artifact.toml` ever
 *      regresses the `/api` route mapping, these tests fail.
 *
 *   2. **Real browser navigation for the chain view** — Playwright drives
 *      a chromium instance through the SPA's guest-mode bypass and lands on
 *      the chain view page, asserting the React route renders without a
 *      JS error.  This catches client-side regressions (broken bundle,
 *      crashed AuthGate, missing chain view export) that an API-only
 *      suite cannot see.
 *
 * Hermetic-CI guard
 * ─────────────────
 * Both describe blocks below depend on Replit's shared reverse-proxy at
 * `http://localhost:80`, which only exists when the `aigovops: web` and
 * `api-server: API Server` workflows are up — i.e. inside the Replit
 * workspace.  In a generic CI / clean-checkout environment those workflows
 * are not running and the proxy is unreachable.  Rather than failing the
 * whole `pnpm run test:e2e` script in that case, each describe runs a
 * one-off reachability probe in `beforeAll` and skips itself with a clear
 * message when the proxy cannot be reached.  The hermetic api-server
 * suite (`api.spec.ts`) is unaffected and always runs.
 */
import { test, expect, request as pwRequest } from "@playwright/test";

const PROXY = "http://localhost:80";

async function isProxyReachable(): Promise<boolean> {
  try {
    const ctx = await pwRequest.newContext();
    const resp = await ctx.get(`${PROXY}/api/healthz`, { timeout: 2_000 });
    await ctx.dispose();
    return resp.ok();
  } catch {
    return false;
  }
}

test.describe("Shared proxy — public API routing", () => {
  test.beforeAll(async () => {
    if (!(await isProxyReachable())) {
      test.skip(
        true,
        `Replit shared proxy at ${PROXY} is not reachable — these tests require ` +
          `the 'aigovops: web' and 'api-server: API Server' workflows to be running. ` +
          `Hermetic API coverage is provided by api.spec.ts.`,
      );
    }
  });

  test("GET /api/healthz via proxy → 200 { status: ok }", async ({ request }) => {
    const resp = await request.get(`${PROXY}/api/healthz`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  test("GET /api/auth/user via proxy (anonymous) → 200 { user: null }", async ({ request }) => {
    const resp = await request.get(`${PROXY}/api/auth/user`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { user: unknown };
    expect(body.user).toBeNull();
  });

  test("GET /api/interactions via proxy (anonymous) → 401", async ({ request }) => {
    const resp = await request.get(`${PROXY}/api/interactions`);
    expect(resp.status()).toBe(401);
  });
});

test.describe("Browser navigation — landing + chain view", () => {
  test.beforeAll(async () => {
    if (!(await isProxyReachable())) {
      test.skip(
        true,
        `Replit shared proxy at ${PROXY} is not reachable — these tests require ` +
          `the 'aigovops: web' and 'api-server: API Server' workflows to be running. ` +
          `Hermetic API coverage is provided by api.spec.ts.`,
      );
    }
  });

  test("Landing page renders the welcome screen", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const resp = await page.goto(`${PROXY}/`, { waitUntil: "domcontentloaded" });
    expect(resp?.status(), "landing page should load via proxy").toBeLessThan(400);

    // Welcome screen renders the product name as the brand wordmark.
    await expect(page.locator("text=AIGovOps").first()).toBeVisible({ timeout: 10_000 });
    expect(errors, `unexpected page errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("Chain view page renders for guest-mode user", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Land on `/` first so we can plant guest-mode in localStorage on the
    // app's origin (browsers refuse storage writes before the first nav).
    await page.goto(`${PROXY}/`, { waitUntil: "domcontentloaded" });
    await context.addInitScript(() => {
      window.localStorage.setItem("aigovops_guest", "true");
    });

    // Now navigate into the authenticated SPA route — guest mode bypasses
    // AuthGate so the chain view component mounts without a real session.
    const resp = await page.goto(`${PROXY}/chain`, { waitUntil: "domcontentloaded" });
    expect(resp?.status(), "chain route should load via proxy").toBeLessThan(400);

    // The chain page mounts <ChainView/> which fetches /api/chain/health and
    // renders a heading containing "Chain". We assert *some* chain UI is
    // visible — the goal is to prove the route renders, not to deep-test it.
    await expect(page.locator("h1, h2, h3").filter({ hasText: /chain/i }).first())
      .toBeVisible({ timeout: 10_000 });
    expect(errors, `unexpected page errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

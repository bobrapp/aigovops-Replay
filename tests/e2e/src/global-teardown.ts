/**
 * Playwright global teardown — shuts down the mock OIDC server and the
 * dedicated test API server that were created in global-setup.ts.
 *
 * Uses SIGTERM first (graceful shutdown), then SIGKILL after 5 s.
 * Also evicts the test ports by PID to guarantee a clean state for the
 * next run even if the process reference has been lost.
 */
import { execSync } from "node:child_process";
import { TEST_API_PORT, MOCK_OIDC_PORT } from "./global-setup";

function evictPort(port: number): void {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, {
      stdio: "ignore",
      timeout: 3_000,
    });
  } catch {
    // best-effort
  }
}

export default async function globalTeardown(): Promise<void> {
  // ── Test API server ───────────────────────────────────────────────────────
  const apiProc = globalThis.__testApiProcess;
  if (apiProc && apiProc.exitCode === null) {
    console.log("[teardown] Stopping test API server…");
    apiProc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        try {
          apiProc.kill("SIGKILL");
        } catch {
          /* already dead */
        }
        resolve();
      }, 5_000);
      apiProc.once("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }

  // ── Mock OIDC server ──────────────────────────────────────────────────────
  const oidcServer = globalThis.__mockOidcServer;
  if (oidcServer?.listening) {
    console.log("[teardown] Stopping mock OIDC server…");
    await new Promise<void>((resolve) =>
      oidcServer.close(() => resolve()),
    );
  }

  // ── Port eviction (belt-and-suspenders) ──────────────────────────────────
  evictPort(TEST_API_PORT);
  evictPort(MOCK_OIDC_PORT);
}

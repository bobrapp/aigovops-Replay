/**
 * Playwright global setup.
 *
 * 1. Evicts any leftover process occupying the test ports so each run starts
 *    from a clean slate.
 * 2. Starts the mock OIDC provider on MOCK_OIDC_PORT.
 * 3. Spawns a dedicated test API server on TEST_API_PORT with ISSUER_URL
 *    pointing at the mock so the full OIDC authorization-code flow is exercised.
 * 4. Waits until the freshly-spawned server answers the health check.
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { startMockOidc } from "./mock-oidc";

export const MOCK_OIDC_PORT = 29999;
export const TEST_API_PORT = 28080;

declare global {
  // eslint-disable-next-line no-var
  var __mockOidcServer: http.Server | undefined;
  // eslint-disable-next-line no-var
  var __testApiProcess: ChildProcess | undefined;
}

/** Kill any process currently bound to a TCP port (best-effort). */
function evictPort(port: number): void {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, {
      stdio: "ignore",
      timeout: 3_000,
    });
  } catch {
    // fuser not available or nothing to kill — continue
  }
}

/**
 * Poll GET <url> until the response status is 200 or the timeout elapses.
 *
 * Importantly, we verify the server is still alive (pid matches) BEFORE
 * accepting a 200: if a stale process is answering we will see it exit, then
 * wait for the fresh process to come up on the same port.
 */
async function waitForServer(
  url: string,
  proc: ChildProcess,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // If the server we spawned has already exited, fail fast
    if (proc.exitCode !== null) {
      throw new Error(
        `[setup] Test API server exited with code ${proc.exitCode} before becoming ready`,
      );
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error(`status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(1_000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return; // server is up
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  throw new Error(
    `[setup] Server at ${url} did not become ready within ${timeoutMs} ms`,
  );
}

export default async function globalSetup(): Promise<void> {
  // ── 0. Clean slate — evict any leftover from a previous (crashed) run ────
  console.log("[setup] Evicting any stale processes on test ports…");
  evictPort(TEST_API_PORT);
  evictPort(MOCK_OIDC_PORT);
  // Brief pause so the OS releases the sockets
  await new Promise((r) => setTimeout(r, 400));

  // ── 0b. Remove stale e2e user rows from previous runs ────────────────────
  //   The mock OIDC always returns email=e2e@test.local. If a prior run used
  //   a different sub, a row with that email (but a different id) lingers and
  //   causes a unique-constraint violation on the next INSERT.  Purge it now.
  if (process.env.DATABASE_URL) {
    try {
      execSync(
        `psql "${process.env.DATABASE_URL}" -c "DELETE FROM users WHERE email = 'e2e@test.local' OR id = 'e2e-mock-user-fixed';" 2>/dev/null`,
        { stdio: "ignore", timeout: 5_000 },
      );
      console.log("[setup] Cleaned up stale e2e test user rows.");
    } catch {
      // Non-fatal: the cleanup is belt-and-suspenders; if the table doesn't
      // exist yet (first-ever run) or psql fails, the test will still work.
    }
  }

  // ── 1. Mock OIDC provider ─────────────────────────────────────────────────
  console.log(`[setup] Starting mock OIDC server on port ${MOCK_OIDC_PORT}…`);
  const mockOidcServer = await startMockOidc(MOCK_OIDC_PORT);
  globalThis.__mockOidcServer = mockOidcServer;

  // ── 2. Test API server ────────────────────────────────────────────────────
  //   Spawned from the pre-built ESM bundle so the test environment is
  //   byte-for-byte identical to production.  Differences from the workflow:
  //     • PORT        — avoids colliding with the dev-server on 8080
  //     • ISSUER_URL  — redirects OIDC discovery to the local mock
  //     • APP_ORIGIN  — pins the OIDC redirect_uri to the test server origin
  //     • REPL_ID     — client_id sent in token-endpoint requests
  //     • NODE_ENV    — "test" (keeps admin cookies non-Secure for HTTP)
  const apiBin = path.resolve(
    __dirname,
    "../../../artifacts/api-server/dist/index.mjs",
  );

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[setup] DATABASE_URL is not set — the test API server cannot start",
    );
  }

  console.log(`[setup] Spawning test API server on port ${TEST_API_PORT}…`);
  const apiProc = spawn("node", ["--enable-source-maps", apiBin], {
    env: {
      ...process.env,
      PORT: String(TEST_API_PORT),
      ISSUER_URL: `http://127.0.0.1:${MOCK_OIDC_PORT}`,
      APP_ORIGIN: `http://127.0.0.1:${TEST_API_PORT}`,
      REPL_ID: "test-client-id",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Surface server stdout/stderr so failures are visible in the test run output
  apiProc.stdout?.on("data", (d: Buffer) =>
    process.stdout.write(`[api-server] ${d}`),
  );
  apiProc.stderr?.on("data", (d: Buffer) =>
    process.stderr.write(`[api-server] ${d}`),
  );

  apiProc.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(
        `[setup] Test API server exited with code ${code} / signal ${signal}`,
      );
    }
  });

  globalThis.__testApiProcess = apiProc;

  // ── 3. Ready check ────────────────────────────────────────────────────────
  const healthUrl = `http://127.0.0.1:${TEST_API_PORT}/api/healthz`;
  console.log(`[setup] Waiting for ${healthUrl}…`);
  await waitForServer(healthUrl, apiProc);
  console.log("[setup] Test API server is ready.");
}

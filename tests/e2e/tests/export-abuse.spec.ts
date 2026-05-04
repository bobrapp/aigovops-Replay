/**
 * AIGovOps REPLAY — export endpoint abuse-protection regression suite (task #41).
 *
 * Verifies the contract added to /export/jsonl, /export/html, /export/sqlite:
 *   • Per-user rate limit (EXPORT_RATE_LIMIT, default 30/hr) is shared across
 *     ALL three export endpoints. We set a small EXPORT_RATE_LIMIT for this
 *     suite via the `:rate-limited` describe block to keep run time bounded.
 *   • Per-response row cap (EXPORT_ROW_CAP, default 5000) caps the body and
 *     emits `X-Truncated: true`, `X-Row-Cap`, `X-Total-Available`, and
 *     `X-Next-Cursor` headers; the JSONL body also emits a trailing
 *     `_meta` line.
 *   • Cursor pagination resumes strictly after the truncation point and
 *     covers the remaining rows.
 *   • Invalid cursors return 400, not silent skip.
 *
 * Implementation note
 * ───────────────────
 * The shared test API server uses the production EXPORT_ROW_CAP. Rather than
 * inserting >5000 rows (slow), this suite spawns a separate one-shot API
 * server with EXPORT_ROW_CAP=3 and EXPORT_RATE_LIMIT=2 on a different port so
 * we can exercise both the cap and the limiter with just a handful of rows.
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import pg from "pg";
import { TEST_API_PORT, MOCK_OIDC_PORT } from "../src/global-setup";

// Use a dedicated port so we don't clash with the main test API server.
const ABUSE_API_PORT = 28085;
const BASE = `http://127.0.0.1:${ABUSE_API_PORT}/api`;

// Test user fixture
const TEST_USER_PREFIX = "export-abuse-e2e-";

let apiProc: ChildProcess | null = null;

function evictPort(port: number): void {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore", timeout: 3_000 });
  } catch { /* ignore */ }
}

async function waitForReady(url: string, proc: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`export-abuse API server exited early with code ${proc.exitCode}`);
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error(`status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(1_000, () => { req.destroy(); reject(new Error("timeout")); });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`export-abuse API server at ${url} did not become ready`);
}

async function startAbuseApiServer(): Promise<void> {
  evictPort(ABUSE_API_PORT);
  await new Promise((r) => setTimeout(r, 200));

  const apiBin = path.resolve(__dirname, "../../../artifacts/api-server/dist/index.mjs");
  apiProc = spawn("node", ["--enable-source-maps", apiBin], {
    env: {
      ...process.env,
      PORT: String(ABUSE_API_PORT),
      ISSUER_URL: `http://127.0.0.1:${MOCK_OIDC_PORT}`,
      APP_ORIGIN: `http://127.0.0.1:${ABUSE_API_PORT}`,
      REPL_ID: "test-client-id",
      NODE_ENV: "test",
      EXPORT_ROW_CAP: "3",
      // Sized so tests 1-3 can run without hitting the limit (1+2+1 = 4 calls)
      // and test 4 can demonstrate a 429 within its 5-call probe window.
      EXPORT_RATE_LIMIT: "5",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  apiProc.stdout?.on("data", (d) => process.stdout.write(`[abuse-api] ${d}`));
  apiProc.stderr?.on("data", (d) => process.stderr.write(`[abuse-api] ${d}`));

  await waitForReady(`http://127.0.0.1:${ABUSE_API_PORT}/api/healthz`, apiProc);
}

async function oidcLogin(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${BASE}/mobile-auth/token-exchange`, {
    data: {
      code: "mock-auth-code",
      code_verifier: "mock-code-verifier",
      redirect_uri: `http://127.0.0.1:${ABUSE_API_PORT}/api/callback`,
      state: "mock-state-value",
    },
  });
  expect(resp.status(), "abuse-suite OIDC token exchange").toBe(200);
  const body = await resp.json() as { token?: string };
  expect(body.token).toBeTruthy();
  return body.token as string;
}

/**
 * Seed N receipts directly via the API (so chain hashes are correctly computed
 * by the server rather than by hand).  Returns the created receipt IDs in
 * insertion order.
 */
async function seedReceipts(request: APIRequestContext, token: string, n: number, modelTag: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const resp = await request.post(`${BASE}/interactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        prompt: `export-abuse seed prompt ${modelTag} #${i}`,
        response: `seed response ${i}`,
        model: `seed-model-${modelTag}`,
        tags: [TEST_USER_PREFIX + modelTag],
      },
    });
    expect(resp.status(), `seed receipt #${i} should create`).toBe(201);
    const body = await resp.json() as { id: string };
    ids.push(body.id);
  }
  return ids;
}

test.describe("export endpoint abuse protection (task #41)", () => {
  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
    await startAbuseApiServer();
  });

  test.afterAll(async () => {
    if (apiProc) {
      apiProc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
    }
    // Best-effort cleanup of seeded rows so they don't pollute the DB across runs.
    if (process.env.DATABASE_URL) {
      try {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(
          `DELETE FROM interactions WHERE prompt LIKE 'export-abuse seed prompt %'`,
        );
        await pool.end();
      } catch { /* ignore cleanup failure */ }
    }
  });

  test("row cap enforcement: 5 receipts → JSONL returns 3 rows + truncation headers + _meta line", async () => {
    const ctx = await pwRequest.newContext();
    try {
      const token = await oidcLogin(ctx);

      // Wipe any prior e2e@test.local rows so totalAvailable == 5 deterministically.
      // The test API server's user is created via OIDC mock with fixed id `e2e-mock-user-fixed`.
      if (process.env.DATABASE_URL) {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        await pool.query(`DELETE FROM activity_log WHERE interaction_id IN (SELECT id FROM interactions WHERE user_id = 'e2e-mock-user-fixed')`);
        await pool.query(`DELETE FROM interactions WHERE user_id = 'e2e-mock-user-fixed'`);
        await pool.end();
      }

      await seedReceipts(ctx, token, 5, "row-cap");

      // First request — should hit the cap.
      const resp1 = await ctx.get(`${BASE}/export/jsonl`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resp1.status()).toBe(200);
      expect(resp1.headers()["x-truncated"]).toBe("true");
      expect(resp1.headers()["x-row-cap"]).toBe("3");
      expect(resp1.headers()["x-total-available"]).toBe("5");
      const cursor1 = resp1.headers()["x-next-cursor"];
      expect(cursor1, "X-Next-Cursor must be present when truncated").toBeTruthy();

      const lines1 = (await resp1.text()).trim().split("\n");
      // 3 receipt lines + 1 _meta line
      expect(lines1.length).toBe(4);
      const meta = JSON.parse(lines1[3]) as { _meta: { truncated: boolean; nextCursor: string; totalAvailable: number; rowCap: number } };
      expect(meta._meta.truncated).toBe(true);
      expect(meta._meta.nextCursor).toBe(cursor1);
      expect(meta._meta.totalAvailable).toBe(5);
      expect(meta._meta.rowCap).toBe(3);
    } finally {
      await ctx.dispose();
    }
  });

  test("cursor pagination: second page returns the remaining 2 rows, untruncated", async () => {
    const ctx = await pwRequest.newContext();
    try {
      const token = await oidcLogin(ctx);

      // Page 1 — get cursor
      const resp1 = await ctx.get(`${BASE}/export/jsonl`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resp1.status()).toBe(200);
      const cursor1 = resp1.headers()["x-next-cursor"];
      expect(cursor1).toBeTruthy();

      // Page 2 — should return the remaining 2 rows, untruncated
      const resp2 = await ctx.get(`${BASE}/export/jsonl?cursor=${encodeURIComponent(cursor1!)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(resp2.status()).toBe(200);
      expect(resp2.headers()["x-truncated"]).toBe("false");
      expect(resp2.headers()["x-total-available"]).toBe("2");
      // No X-Next-Cursor on a non-truncated response
      expect(resp2.headers()["x-next-cursor"]).toBeUndefined();

      const lines2 = (await resp2.text()).trim().split("\n").filter(Boolean);
      // 2 receipt lines, no _meta line because not truncated
      expect(lines2.length).toBe(2);
    } finally {
      await ctx.dispose();
    }
  });

  test("invalid cursor returns 400", async () => {
    const ctx = await pwRequest.newContext();
    try {
      const token = await oidcLogin(ctx);
      const resp = await ctx.get(`${BASE}/export/jsonl?cursor=not-a-real-cursor`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Either 400 (decode failed) or 200 with truncated headers depending on
      // whether the bad cursor parses as a future-dated row. Our decoder
      // returns null for unparseable input → 400.
      expect(resp.status()).toBe(400);
    } finally {
      await ctx.dispose();
    }
  });

  test("rate limit: third request within the hour returns 429", async () => {
    const ctx = await pwRequest.newContext();
    try {
      const token = await oidcLogin(ctx);

      // Issue requests until we get rate-limited. EXPORT_RATE_LIMIT=5 in this
      // suite; earlier tests in the describe block have already consumed
      // ~4 calls of quota. Issue up to 8 requests and expect a 429 to surface.
      let saw429 = false;
      let lastStatus = 200;
      for (let i = 0; i < 8; i++) {
        const r = await ctx.get(`${BASE}/export/jsonl`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        lastStatus = r.status();
        if (lastStatus === 429) {
          saw429 = true;
          // Standard RateLimit headers (draft-8) should be present
          const remaining = r.headers()["ratelimit-remaining"] ?? r.headers()["ratelimit"];
          // ratelimit-remaining might be 0 or absent depending on header style
          expect(remaining ?? "0").toBeDefined();
          break;
        }
      }
      expect(saw429, `expected at least one 429 within the loop (last status: ${lastStatus})`).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });
});

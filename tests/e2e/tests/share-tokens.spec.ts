/**
 * AIGovOps REPLAY — share-token revocation + auto-expiry sweep regression suite.
 *
 * Covers task #44 (owner-revocable share links) and task #42 (auto-expiry
 * sweep worker). Together these implement the lifecycle:
 *
 *   create → public verify (200)
 *         → owner revoke   (DELETE → 204)
 *         → public verify  (404 immediately, regardless of expiry)
 *         → sweep deletes the row after the grace window
 *
 *   create with past expires_at → public verify (410 Gone)
 *         → sweep deletes the row after the grace window
 *
 * Status-code contract verified here:
 *   • 200 — token is active and not expired
 *   • 404 — token not found OR revoked OR swept
 *   • 410 — token still present but expires_at <= now()
 *
 * Test architecture
 * ──────────────────
 * The "verify status codes" tests run against the shared test API server
 * (port 28080). The "sweep" test spawns a dedicated API server with a
 * 500 ms sweep interval and a zero-hour grace window so we can assert the
 * physical row is removed within ~1.5 s. Default grace is 24 h, so the
 * shared server's once-an-hour sweep cannot interfere with these tests
 * (rows we create with expires_at=now()-1min will not yet be past grace).
 */
import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { TEST_API_PORT, MOCK_OIDC_PORT } from "../src/global-setup";

/** Mirrors the server-side hashShareToken (sha256 hex). */
function hashShareToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const BASE = `http://127.0.0.1:${TEST_API_PORT}/api`;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function oidcLogin(request: APIRequestContext, baseUrl: string): Promise<string> {
  const resp = await request.post(`${baseUrl}/mobile-auth/token-exchange`, {
    data: {
      code: "mock-auth-code",
      code_verifier: "mock-code-verifier",
      redirect_uri: `${baseUrl.replace(/\/api$/, "")}/api/callback`,
      state: "mock-state-value",
    },
  });
  expect(resp.status(), "OIDC token exchange should succeed").toBe(200);
  const body = (await resp.json()) as { token?: string };
  expect(body.token).toBeTruthy();
  return body.token as string;
}

async function createReceipt(request: APIRequestContext, baseUrl: string, token: string): Promise<string> {
  const resp = await request.post(`${baseUrl}/interactions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      prompt: "share-token-e2e prompt",
      response: "share-token-e2e response",
      model: "test-model",
      tags: ["share-token-e2e"],
    },
  });
  expect(resp.status(), "create receipt").toBe(201);
  const body = (await resp.json()) as { id: string };
  return body.id;
}

async function createShareToken(
  request: APIRequestContext,
  baseUrl: string,
  authToken: string,
  receiptId: string,
): Promise<{ token: string; verifyUrl: string; expiresAt: string }> {
  const resp = await request.post(`${baseUrl}/interactions/${receiptId}/share-token`, {
    headers: { Authorization: `Bearer ${authToken}` },
    data: { redact: false },
  });
  expect(resp.status(), "create share token").toBe(201);
  return (await resp.json()) as { token: string; verifyUrl: string; expiresAt: string };
}

// ---------------------------------------------------------------------------
// Shared test API server scenarios — revocation + status codes
// ---------------------------------------------------------------------------
test.describe("share-token revocation + verify status codes (#44, #42)", () => {
  let authToken: string;
  let receiptId: string;
  let pgClient: pg.Client;

  test.beforeAll(async () => {
    pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();
    const ctx = await pwRequest.newContext();
    authToken = await oidcLogin(ctx, BASE);
    receiptId = await createReceipt(ctx, BASE, authToken);
    await ctx.dispose();
  });

  test.afterAll(async () => {
    // Drop everything we created so the suite is idempotent.
    try {
      await pgClient.query(
        `DELETE FROM share_tokens WHERE interaction_id = $1`,
        [receiptId],
      );
      await pgClient.query(
        `DELETE FROM interactions WHERE id = $1`,
        [receiptId],
      );
    } finally {
      await pgClient.end();
    }
  });

  test("active token → public verify 200", async ({ request }) => {
    const created = await createShareToken(request, BASE, authToken, receiptId);

    const resp = await request.get(`${BASE}/verify/${receiptId}?token=${created.token}`);
    expect(resp.status(), "verify with valid token").toBe(200);
    const body = (await resp.json()) as { id: string };
    expect(body.id).toBe(receiptId);
  });

  test("listShareTokens shows active row, never raw token or hash", async ({ request }) => {
    await createShareToken(request, BASE, authToken, receiptId);

    const listResp = await request.get(`${BASE}/interactions/${receiptId}/share-tokens`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(listResp.status()).toBe(200);
    const list = (await listResp.json()) as { tokens: Array<Record<string, unknown>> };
    expect(Array.isArray(list.tokens)).toBe(true);
    expect(list.tokens.length).toBeGreaterThan(0);

    for (const t of list.tokens) {
      // Raw token / hash must never leak through the list endpoint.
      expect(t["token"]).toBeUndefined();
      expect(t["tokenHash"]).toBeUndefined();
      expect(t["token_hash"]).toBeUndefined();
      expect(typeof t["id"]).toBe("string");
      expect(typeof t["createdAt"]).toBe("string");
      expect(typeof t["expiresAt"]).toBe("string");
      expect(typeof t["redact"]).toBe("boolean");
    }
  });

  test("revoke → public verify 404 immediately", async ({ request }) => {
    const created = await createShareToken(request, BASE, authToken, receiptId);

    // Sanity: still works before revoke
    const before = await request.get(`${BASE}/verify/${receiptId}?token=${created.token}`);
    expect(before.status()).toBe(200);

    // Find this token's id via the list endpoint
    const listResp = await request.get(`${BASE}/interactions/${receiptId}/share-tokens`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const list = (await listResp.json()) as { tokens: Array<{ id: string; createdAt: string }> };
    // Most-recent-first ordering — the one we just created is index 0.
    const tokenId = list.tokens[0]?.id;
    expect(tokenId, "token must appear in list").toBeTruthy();

    // Revoke
    const del = await request.delete(`${BASE}/interactions/${receiptId}/share-tokens/${tokenId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(del.status(), "DELETE share-tokens").toBe(204);

    // Public verify must return 404, not 200, not 401, not 410.
    const after = await request.get(`${BASE}/verify/${receiptId}?token=${created.token}`);
    expect(after.status(), "verify after revoke").toBe(404);

    // And the token no longer appears in the active list.
    const listAfter = await request.get(`${BASE}/interactions/${receiptId}/share-tokens`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const listAfterBody = (await listAfter.json()) as { tokens: Array<{ id: string }> };
    expect(listAfterBody.tokens.find((t) => t.id === tokenId)).toBeUndefined();
  });

  test("double-revoke → second DELETE returns 404", async ({ request }) => {
    const created = await createShareToken(request, BASE, authToken, receiptId);
    const listResp = await request.get(`${BASE}/interactions/${receiptId}/share-tokens`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const list = (await listResp.json()) as { tokens: Array<{ id: string }> };
    const tokenId = list.tokens[0]!.id;

    const del1 = await request.delete(`${BASE}/interactions/${receiptId}/share-tokens/${tokenId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(del1.status()).toBe(204);

    const del2 = await request.delete(`${BASE}/interactions/${receiptId}/share-tokens/${tokenId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(del2.status(), "second revoke is a no-op 404").toBe(404);

    // Belt-and-suspenders: the original raw-token verify is still 404
    const verify = await request.get(`${BASE}/verify/${receiptId}?token=${created.token}`);
    expect(verify.status()).toBe(404);
  });

  test("expired token → public verify 410 Gone", async ({ request }) => {
    const created = await createShareToken(request, BASE, authToken, receiptId);

    // Force this token's expires_at into the past, but stay inside the
    // 24-h grace window so the shared server's hourly sweep cannot delete
    // it before we observe the 410.
    await pgClient.query(
      `UPDATE share_tokens SET expires_at = NOW() - INTERVAL '1 minute'
       WHERE token_hash = $1 AND interaction_id = $2`,
      [hashShareToken(created.token), receiptId],
    );

    const resp = await request.get(`${BASE}/verify/${receiptId}?token=${created.token}`);
    expect(resp.status(), "verify expired token").toBe(410);
    const body = (await resp.json()) as { error: string; expiredAt?: string };
    expect(body.error).toMatch(/expired/i);
    expect(typeof body.expiredAt).toBe("string");
  });

  test("revoking another user's token → 404 (cross-user isolation)", async ({ request }) => {
    // Create a token owned by our user
    const created = await createShareToken(request, BASE, authToken, receiptId);
    const listResp = await request.get(`${BASE}/interactions/${receiptId}/share-tokens`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const list = (await listResp.json()) as { tokens: Array<{ id: string }> };
    const tokenId = list.tokens[0]!.id;

    // Forge an "other user" by re-assigning the token's user_id at the DB layer
    await pgClient.query(
      `UPDATE share_tokens SET user_id = 'attacker-user-id' WHERE id = $1`,
      [tokenId],
    );

    // Our session must not be able to revoke it now
    const del = await request.delete(`${BASE}/interactions/${receiptId}/share-tokens/${tokenId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(del.status(), "cross-user revoke must 404").toBe(404);

    // Restore for the cleanup query in afterAll
    await pgClient.query(
      `UPDATE share_tokens SET user_id = (SELECT user_id FROM interactions WHERE id = $1)
       WHERE id = $2`,
      [receiptId, tokenId],
    );

    // Token should still verify (we never revoked it)
    const verify = await request.get(`${BASE}/verify/${receiptId}?token=${created.token}`);
    expect(verify.status()).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Dedicated API server with aggressive sweep cadence — verifies the worker
// physically removes expired and revoked rows after the grace window.
// ---------------------------------------------------------------------------
const SWEEP_API_PORT = 28086;
const SWEEP_BASE = `http://127.0.0.1:${SWEEP_API_PORT}/api`;
let sweepProc: ChildProcess | null = null;

function evictPort(port: number): void {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`, { stdio: "ignore", timeout: 3_000 });
  } catch {
    /* ignore */
  }
}

async function waitForReady(url: string, proc: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`sweep-test API exited early code=${proc.exitCode}`);
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
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`sweep API at ${url} did not become ready`);
}

test.describe("share-token sweep worker (#42)", () => {
  let pgClient: pg.Client;
  let authToken: string;
  let receiptId: string;

  test.beforeAll(async () => {
    pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();

    evictPort(SWEEP_API_PORT);
    await new Promise((r) => setTimeout(r, 200));
    const apiBin = path.resolve(__dirname, "../../../artifacts/api-server/dist/index.mjs");
    sweepProc = spawn("node", ["--enable-source-maps", apiBin], {
      env: {
        ...process.env,
        PORT: String(SWEEP_API_PORT),
        ISSUER_URL: `http://127.0.0.1:${MOCK_OIDC_PORT}`,
        APP_ORIGIN: `http://127.0.0.1:${SWEEP_API_PORT}`,
        REPL_ID: "test-client-id",
        NODE_ENV: "test",
        // Aggressive cadence + zero grace so we can assert deletion in ~1.5s.
        SHARE_TOKEN_SWEEP_INTERVAL_MS: "500",
        SHARE_TOKEN_GRACE_HOURS: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    sweepProc.stdout?.on("data", (d) => process.stdout.write(`[sweep-api] ${d}`));
    sweepProc.stderr?.on("data", (d) => process.stderr.write(`[sweep-api] ${d}`));
    await waitForReady(`http://127.0.0.1:${SWEEP_API_PORT}/api/healthz`, sweepProc);

    const ctx = await pwRequest.newContext();
    authToken = await oidcLogin(ctx, SWEEP_BASE);
    receiptId = await createReceipt(ctx, SWEEP_BASE, authToken);
    await ctx.dispose();
  });

  test.afterAll(async () => {
    try {
      await pgClient.query(`DELETE FROM share_tokens WHERE interaction_id = $1`, [receiptId]);
      await pgClient.query(`DELETE FROM interactions WHERE id = $1`, [receiptId]);
    } finally {
      await pgClient.end();
    }
    if (sweepProc) {
      sweepProc.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 200));
      if (sweepProc.exitCode === null) sweepProc.kill("SIGKILL");
    }
  });

  test("expired tokens are physically deleted after grace window", async ({ request }) => {
    const created = await createShareToken(request, SWEEP_BASE, authToken, receiptId);

    // Push expires_at into the past — with grace=0 the next sweep must delete it.
    await pgClient.query(
      `UPDATE share_tokens SET expires_at = NOW() - INTERVAL '1 minute'
       WHERE token_hash = $1`,
      [hashShareToken(created.token)],
    );

    // Wait for the sweep tick (interval=500ms, grace=0, plus a buffer).
    await new Promise((r) => setTimeout(r, 1_500));

    const { rows } = await pgClient.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM share_tokens WHERE token_hash = $1`,
      [hashShareToken(created.token)],
    );
    expect(rows[0]?.count, "expired row must be physically removed").toBe("0");

    // And the public verify endpoint sees the row as missing → 404.
    const verify = await request.get(`${SWEEP_BASE}/verify/${receiptId}?token=${created.token}`);
    expect(verify.status()).toBe(404);
  });

  test("revoked tokens are physically deleted after grace window", async ({ request }) => {
    const created = await createShareToken(request, SWEEP_BASE, authToken, receiptId);

    // Look up its id, then revoke via the public API.
    const listResp = await request.get(`${SWEEP_BASE}/interactions/${receiptId}/share-tokens`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const list = (await listResp.json()) as { tokens: Array<{ id: string }> };
    const tokenId = list.tokens[0]!.id;

    const del = await request.delete(`${SWEEP_BASE}/interactions/${receiptId}/share-tokens/${tokenId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(del.status()).toBe(204);

    // With grace=0 the next sweep must delete it.
    await new Promise((r) => setTimeout(r, 1_500));

    const { rows } = await pgClient.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM share_tokens WHERE token_hash = $1`,
      [hashShareToken(created.token)],
    );
    expect(rows[0]?.count, "revoked row must be physically removed").toBe("0");
  });
});

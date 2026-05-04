/**
 * test-e2e.ts
 *
 * Headless E2E tests for the AIGovOps REPLAY API.
 * Runs against the live server at http://localhost:80/api (via shared proxy).
 *
 * Auth strategy:
 *   - Unauthenticated tests need no setup.
 *   - Authenticated tests inject a synthetic session directly into the sessions
 *     table via @workspace/db, then pass `Authorization: Bearer <sid>` on each
 *     request. The server's authMiddleware reads the sid from the header and
 *     looks it up in the sessions table — the same path taken by a real browser
 *     session. The synthetic session is deleted in the finally block regardless
 *     of outcome.
 *   - Admin tests POST /api/admin/login with the ADMIN_API_KEY env var and use
 *     the resulting Set-Cookie value for subsequent requests.
 *
 * Missing env vars:
 *   DATABASE_URL and ADMIN_API_KEY are required. If either is absent the suite
 *   exits with code 1 so that CI never passes with a partial run.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run test:e2e
 */

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { db, sessionsTable } from "@workspace/db";

const BASE = "http://localhost:80/api";

type Db = typeof db;
type SessionsTable = typeof sessionsTable;
type DbModule = { db: Db; sessionsTable: SessionsTable };

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string): void {
  console.log(`  ✅  ${label}`);
  passed++;
}

function fail(label: string, reason: string): void {
  console.error(`  ❌  ${label}`);
  console.error(`       ${reason}`);
  failed++;
  failures.push(label);
}

async function check(
  label: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    ok(label);
  } catch (err) {
    fail(label, err instanceof Error ? err.message : String(err));
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Typed fetch helpers
// ---------------------------------------------------------------------------
async function get(
  path: string,
  opts: RequestInit = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, { method: "GET", ...opts });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

async function post(
  path: string,
  data: unknown,
  opts: RequestInit = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const extraHeaders =
    opts.headers instanceof Headers
      ? Object.fromEntries(opts.headers.entries())
      : (opts.headers as Record<string, string> | undefined) ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
}

function authHeader(sid: string): RequestInit {
  return { headers: { Authorization: `Bearer ${sid}` } };
}

// ---------------------------------------------------------------------------
// Env-var guard — fail fast so CI never passes with a partial run
// ---------------------------------------------------------------------------
function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(
      `\n❌  Required env var ${name} is not set.\n` +
        `    The full test suite cannot run without it. Exiting with code 1.\n`,
    );
    process.exit(1);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Dynamic import for @workspace/db
// The db package throws at module init when DATABASE_URL is missing, so we
// import it dynamically after checking the env var above.
// ---------------------------------------------------------------------------
async function importDb(): Promise<DbModule> {
  const mod = await import("@workspace/db");
  return { db: mod.db, sessionsTable: mod.sessionsTable };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log(`\n🔬  AIGovOps REPLAY — E2E test suite`);
  console.log(`    Target: ${BASE}\n`);

  // Guard both required env vars before any test runs
  requireEnv("DATABASE_URL");
  const adminKey = requireEnv("ADMIN_API_KEY");

  // ── 1. Public / no-auth endpoints ──────────────────────────────────────
  console.log("── Public endpoints ─────────────────────────────────────");

  await check("GET /healthz → 200 { status: 'ok' }", async () => {
    const { status, body } = await get("/healthz");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(
      (body as Record<string, unknown>)?.status === "ok",
      `Expected { status:'ok' }, got ${JSON.stringify(body)}`,
    );
  });

  await check("GET /unknown-path → 404", async () => {
    const res = await fetch(`${BASE}/this-route-does-not-exist`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  await check("GET /auth/user (unauthenticated) → 200 { user: null }", async () => {
    const { status, body } = await get("/auth/user");
    assert(status === 200, `Expected 200, got ${status}`);
    assert(
      (body as Record<string, unknown>)?.user === null,
      `Expected user:null, got ${JSON.stringify(body)}`,
    );
  });

  // ── 2. Authenticated endpoints ───────────────────────────────────────────
  console.log("\n── Authenticated endpoints ──────────────────────────────");

  const dbMod = await importDb();
  const { db: dbInst, sessionsTable: sessTable } = dbMod;

  const testSid = crypto.randomBytes(32).toString("hex");
  const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
  const testSessionData = {
    user: {
      id: "e2e-test-user",
      email: "e2e@test.local",
      firstName: "E2E",
      lastName: "Test",
      profileImageUrl: null,
    },
    access_token: "e2e-synthetic-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  await dbInst.insert(sessTable).values({
    sid: testSid,
    sess: testSessionData as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });

  try {
    await check(
      "GET /auth/user (authenticated) → 200 with user object",
      async () => {
        const { status, body } = await get("/auth/user", authHeader(testSid));
        assert(status === 200, `Expected 200, got ${status}`);
        const user = (body as Record<string, unknown>)?.user as
          | Record<string, unknown>
          | null;
        assert(user !== null, "Expected non-null user");
        assert(
          user?.id === "e2e-test-user",
          `Expected user.id='e2e-test-user', got ${user?.id}`,
        );
      },
    );

    await check(
      "GET /interactions → 200 with items array",
      async () => {
        const { status, body } = await get(
          "/interactions",
          authHeader(testSid),
        );
        assert(status === 200, `Expected 200, got ${status}`);
        const b = body as Record<string, unknown>;
        assert(Array.isArray(b?.items), "Expected body.items to be an array");
      },
    );

    // Mint a receipt so we can test downstream endpoints
    let receiptId: string | undefined;

    await check("POST /interactions → 201 (mint receipt)", async () => {
      const { status, body } = await post(
        "/interactions",
        {
          model: "gpt-4o-e2e",
          prompt: "E2E test prompt",
          response: "E2E test response",
          tags: ["e2e", "test"],
        },
        authHeader(testSid),
      );
      assert(status === 201, `Expected 201, got ${status}`);
      const b = body as Record<string, unknown>;
      assert(typeof b?.id === "string", `Expected body.id (string), got ${JSON.stringify(body)}`);
      receiptId = b.id as string;
    });

    if (receiptId) {
      const rid = receiptId;

      await check(
        `GET /interactions/:id → 200 (fetch minted receipt)`,
        async () => {
          const { status, body } = await get(
            `/interactions/${rid}`,
            authHeader(testSid),
          );
          assert(status === 200, `Expected 200, got ${status}`);
          const b = body as Record<string, unknown>;
          assert(b?.id === rid, `Expected body.id === '${rid}'`);
        },
      );

      await check(
        "GET /interactions/:id/verify → 200 with valid field",
        async () => {
          const { status, body } = await get(
            `/interactions/${rid}/verify`,
            authHeader(testSid),
          );
          assert(status === 200, `Expected 200, got ${status}`);
          const b = body as Record<string, unknown>;
          assert(
            typeof b?.valid === "boolean",
            `Expected body.valid (boolean), got ${JSON.stringify(body)}`,
          );
        },
      );

      await check(
        "GET /interactions/:id → 404 for unknown ID",
        async () => {
          const { status } = await get(
            `/interactions/00000000-0000-0000-0000-000000000000`,
            authHeader(testSid),
          );
          assert(status === 404, `Expected 404, got ${status}`);
        },
      );
    }

    await check("GET /chain → 200 with length field", async () => {
      const { status, body } = await get("/chain", authHeader(testSid));
      assert(status === 200, `Expected 200, got ${status}`);
      const b = body as Record<string, unknown>;
      assert(
        typeof b?.length === "number",
        `Expected body.length (number), got ${JSON.stringify(body)}`,
      );
    });

    await check("GET /chain/health → 200 with valid + total fields", async () => {
      const { status, body } = await get(
        "/chain/health",
        authHeader(testSid),
      );
      assert(status === 200, `Expected 200, got ${status}`);
      const b = body as Record<string, unknown>;
      assert(
        typeof b?.total === "number",
        `Expected body.total (number), got ${JSON.stringify(body)}`,
      );
      assert(
        typeof b?.valid === "number",
        `Expected body.valid (number), got ${JSON.stringify(body)}`,
      );
    });

    await check("GET /stats → 200 with totalInteractions field", async () => {
      const { status, body } = await get("/stats", authHeader(testSid));
      assert(status === 200, `Expected 200, got ${status}`);
      const b = body as Record<string, unknown>;
      assert(
        typeof b?.totalInteractions === "number",
        `Expected body.totalInteractions (number), got ${JSON.stringify(body)}`,
      );
    });

    await check(
      "GET /interactions (unauthenticated) → 401",
      async () => {
        const { status } = await get("/interactions");
        assert(
          status === 401,
          `Expected 401 when unauthenticated, got ${status}`,
        );
      },
    );
  } finally {
    // Always clean up the test session — non-fatal if this fails
    try {
      await dbInst.delete(sessTable).where(eq(sessTable.sid, testSid));
    } catch {
      // non-fatal cleanup failure
    }
  }

  // ── 3. Admin endpoints ───────────────────────────────────────────────────
  console.log("\n── Admin endpoints ──────────────────────────────────────");

  let adminCookie: string | undefined;

  await check("POST /admin/login → 200 { authenticated: true }", async () => {
    const { status, body, headers } = await post("/admin/login", {
      token: adminKey,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(
      (body as Record<string, unknown>)?.authenticated === true,
      `Expected authenticated:true, got ${JSON.stringify(body)}`,
    );
    const setCookie = headers.get("set-cookie");
    assert(setCookie !== null, "Expected Set-Cookie header for admin session");
    adminCookie = setCookie ?? undefined;
  });

  if (adminCookie) {
    const cookieHeader: RequestInit = {
      headers: { Cookie: adminCookie },
    };

    await check("GET /admin/status → 200 { authenticated: true }", async () => {
      const { status, body } = await get("/admin/status", cookieHeader);
      assert(status === 200, `Expected 200, got ${status}`);
      assert(
        (body as Record<string, unknown>)?.authenticated === true,
        `Expected authenticated:true, got ${JSON.stringify(body)}`,
      );
    });

    await check(
      "GET /audit/chain-status → 200 with total field",
      async () => {
        const { status, body } = await get(
          "/audit/chain-status",
          cookieHeader,
        );
        assert(status === 200, `Expected 200, got ${status}`);
        const b = body as Record<string, unknown>;
        assert(
          typeof b?.total === "number",
          `Expected body.total (number), got ${JSON.stringify(body)}`,
        );
      },
    );

    // Clean up admin session
    await post("/admin/logout", {}, cookieHeader);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${"─".repeat(55)}`);
  if (failed === 0) {
    console.log(`✅  All ${total} tests passed.`);
    process.exit(0);
  } else {
    console.error(`❌  ${failed} of ${total} tests failed:`);
    for (const f of failures) console.error(`    • ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected fatal error:", err);
  process.exit(1);
});

/**
 * AIGovOps REPLAY — Playwright API end-to-end test suite.
 *
 * Authentication strategy
 * ───────────────────────
 * The suite exercises the real OIDC authorization-code exchange path via the
 * mobile token-exchange endpoint (POST /api/mobile-auth/token-exchange).
 * globalSetup has already started a mock OIDC provider on port 29999 and a
 * dedicated test API server on port 28080 whose ISSUER_URL env var points at
 * that mock.  The flow is therefore identical to production — openid-client
 * discovers the mock issuer, calls its token endpoint, receives a real RS256-
 * signed id_token, verifies it against the mock's JWKS, and creates a session
 * row in the database — the only difference being that the identity provider is
 * local rather than replit.com/oidc.
 *
 * The returned opaque session token is sent as `Authorization: Bearer <token>`
 * for all subsequent requests; the server's getSessionId() helper accepts both
 * the session cookie and this header, so no HTTPS is needed in CI.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { TEST_API_PORT } from "../src/global-setup";

const BASE = `http://127.0.0.1:${TEST_API_PORT}/api`;

// ---------------------------------------------------------------------------
// Helper: perform the OIDC mock login and return a session token
// ---------------------------------------------------------------------------
async function oidcLogin(request: APIRequestContext): Promise<string> {
  const resp = await request.post(`${BASE}/mobile-auth/token-exchange`, {
    data: {
      code: "mock-auth-code",
      code_verifier: "mock-code-verifier",
      redirect_uri: `http://127.0.0.1:${TEST_API_PORT}/api/callback`,
      state: "mock-state-value",
      // nonce omitted → openid-client skips nonce validation
    },
  });

  expect(
    resp.status(),
    "OIDC token exchange should succeed — check mock OIDC server logs",
  ).toBe(200);

  const body = await resp.json() as { token?: string };
  expect(body.token, "token-exchange response must include a session token").toBeTruthy();
  return body.token as string;
}

// ---------------------------------------------------------------------------
// Public endpoints (no authentication required)
// ---------------------------------------------------------------------------
test.describe("Public endpoints", () => {
  test("GET /healthz → 200 { status: ok }", async ({ request }) => {
    const resp = await request.get(`${BASE}/healthz`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  test("GET /unknown-path → 404", async ({ request }) => {
    const resp = await request.get(`${BASE}/this-path-does-not-exist-e2e`);
    expect(resp.status()).toBe(404);
  });

  test("GET /auth/user (unauthenticated) → 200 { user: null }", async ({ request }) => {
    const resp = await request.get(`${BASE}/auth/user`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { user: unknown };
    expect(body.user).toBeNull();
  });

  test("GET /interactions (unauthenticated) → 401", async ({ request }) => {
    const resp = await request.get(`${BASE}/interactions`);
    expect(resp.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// OIDC login flow + authenticated endpoints
// ---------------------------------------------------------------------------
test.describe("OIDC auth flow + authenticated endpoints", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await oidcLogin(request);
  });

  test("OIDC mock login → session token returned", () => {
    // Token was obtained in beforeAll; if it's truthy we passed.
    expect(token).toBeTruthy();
  });

  test("GET /auth/user (authenticated) → 200 with user object", async ({ request }) => {
    const resp = await request.get(`${BASE}/auth/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { user: { id: string; email: string } | null };
    expect(body.user).not.toBeNull();
    expect(body.user!.email).toBe("e2e@test.local");
  });

  test("GET /interactions → 200 with items array", async ({ request }) => {
    const resp = await request.get(`${BASE}/interactions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("POST /interactions → 201 (mint a receipt)", async ({ request }) => {
    const resp = await request.post(`${BASE}/interactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        prompt: "e2e test prompt — what is 2 + 2?",
        response: "2 + 2 equals 4.",
        model: "gpt-4o-e2e-test",
        tags: ["e2e"],
      },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json() as { id: string; chainHash: string };
    expect(body.id).toBeTruthy();
    expect(body.chainHash).toBeTruthy();
  });

  test("GET /interactions/:id → 200 (fetch minted receipt)", async ({ request }) => {
    // Mint a fresh receipt so this test is self-contained
    const createResp = await request.post(`${BASE}/interactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        prompt: "fetch-by-id probe",
        response: "fetched",
        model: "test-model",
      },
    });
    expect(createResp.status()).toBe(201);
    const created = await createResp.json() as { id: string };

    const getResp = await request.get(`${BASE}/interactions/${created.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(getResp.status()).toBe(200);
    const body = await getResp.json() as { id: string };
    expect(body.id).toBe(created.id);
  });

  test("GET /interactions/:id → 404 for unknown ID", async ({ request }) => {
    const resp = await request.get(`${BASE}/interactions/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(404);
  });

  test("GET /interactions/:id/verify → 200 valid=true for freshly minted receipt", async ({ request }) => {
    // Mint a fresh receipt — every cryptographic check (prompt hash, response
    // hash, chain hash self-consistency, predecessor existence, single-genesis,
    // no fork) must pass for a brand-new receipt.  If any returns false we have
    // a regression in the mint or hashing pipeline that this test exists to
    // catch — a `typeof === "boolean"` shape check would silently allow it.
    const createResp = await request.post(`${BASE}/interactions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        prompt: "verify probe",
        response: "verified",
        model: "test-model",
      },
    });
    expect(createResp.status()).toBe(201);
    const created = await createResp.json() as { id: string };

    const verifyResp = await request.get(`${BASE}/interactions/${created.id}/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyResp.status()).toBe(200);
    const body = await verifyResp.json() as {
      id: string;
      valid: boolean;
      promptHashMatch: boolean;
      responseHashMatch: boolean;
      chainIntact: boolean;
      details: string;
      checkedAt: string;
    };

    // Assert the returned id matches what we asked about (no cross-receipt drift)
    expect(body.id).toBe(created.id);

    // Hard assertions — freshly minted receipts must verify successfully.  A
    // verify pipeline that always returns false (or that swaps any of the four
    // sub-checks to false for a clean receipt) will fail here.
    expect(body.promptHashMatch, "prompt hash should match for freshly minted receipt").toBe(true);
    expect(body.responseHashMatch, "response hash should match for freshly minted receipt").toBe(true);
    expect(body.chainIntact, "chain should be intact for freshly minted receipt").toBe(true);
    expect(body.valid, "freshly minted receipt must verify as valid").toBe(true);

    // The PASS-path details string is part of the public verify contract;
    // pin it so a regression that flips to the FAIL message doesn't slip past.
    expect(body.details).toMatch(/cryptographic checks passed/i);
    expect(typeof body.checkedAt).toBe("string");
  });

  test("GET /chain → 200 with length field", async ({ request }) => {
    const resp = await request.get(`${BASE}/chain`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { length: number };
    expect(typeof body.length).toBe("number");
  });

  test("GET /chain/health → 200 with valid + total fields", async ({ request }) => {
    const resp = await request.get(`${BASE}/chain/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    // valid is the count of receipts that passed hash checks (number), not a boolean
    const body = await resp.json() as { valid: number; total: number };
    expect(typeof body.valid).toBe("number");
    expect(typeof body.total).toBe("number");
  });

  test("GET /stats → 200 with totalInteractions field", async ({ request }) => {
    const resp = await request.get(`${BASE}/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { totalInteractions: number };
    expect(typeof body.totalInteractions).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------
test.describe("Admin endpoints", () => {
  const adminKey = process.env.ADMIN_API_KEY;

  test.beforeAll(() => {
    if (!adminKey) {
      console.warn("[e2e] ADMIN_API_KEY not set — admin tests will be skipped");
    }
  });

  test("POST /admin/login → 200 { authenticated: true }", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    const resp = await request.post(`${BASE}/admin/login`, {
      data: { token: adminKey },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(true);
  });

  test("GET /admin/status (with admin session cookie) → 200 { authenticated: true }", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");

    // Log in to obtain the session cookie — same request context keeps it
    const loginResp = await request.post(`${BASE}/admin/login`, {
      data: { token: adminKey },
    });
    expect(loginResp.status()).toBe(200);

    const resp = await request.get(`${BASE}/admin/status`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(true);
  });

  test("GET /audit/chain-status → 200 with total field", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");

    // Log in first — same request context keeps the session cookie
    const loginResp = await request.post(`${BASE}/admin/login`, {
      data: { token: adminKey },
    });
    expect(loginResp.status()).toBe(200);

    const resp = await request.get(`${BASE}/audit/chain-status`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as { total: number };
    expect(typeof body.total).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Public demo gallery — anonymous "bring your own AI output" surface.
//
// These endpoints intentionally bypass the auth middleware and are reachable
// by un-logged-in visitors. The contract is: GET /demo/chain returns the
// shared public chain (seeded fixtures + visitor mints), and POST /demo/mint
// chains a visitor-supplied prompt+response onto it without invoking any
// LLM, policy evaluator, webhook delivery, or activity_log writer.
//
// The hermetic test API server boots with the same seeder the production
// server runs (lib/demo-seeder.ts), so GET /demo/chain should always have
// at least the 7 seeded fixtures available before any mint happens.
// ---------------------------------------------------------------------------
test.describe("Public demo gallery (anonymous)", () => {
  test("GET /demo/chain (anonymous) → 200 with seeded fixtures", async ({ request }) => {
    const resp = await request.get(`${BASE}/demo/chain`);
    expect(resp.status()).toBe(200);
    const body = await resp.json() as {
      items: Array<{
        id: string;
        prompt: string;
        response: string;
        model: string;
        promptHash: string;
        responseHash: string;
        chainHash: string;
        prevHash: string | null;
        policyStatus: string;
        policyViolations: string[];
        tags: string[];
        createdAt: string;
      }>;
      total: number;
    };

    // The seeder inserts at least 6 demo fixtures at boot (currently 7 —
    // legal/medical/finance/EU AI Act/journalism + 1 phishing-refusal).
    // Asserting >= 6 lets us add a fixture without breaking the test, but
    // catches a regression where the seeder silently no-ops.
    expect(body.items.length, "seeder must produce at least 6 demo receipts").toBeGreaterThanOrEqual(6);
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);

    // Every item must carry the cryptographic shape — anything missing
    // would crash the client gallery's recompute-and-verify code path.
    for (const item of body.items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.promptHash).toBe("string");
      expect(typeof item.responseHash).toBe("string");
      expect(typeof item.chainHash).toBe("string");
      expect(item.chainHash.length).toBe(64); // sha256 hex
      expect(Array.isArray(item.policyViolations)).toBe(true);
      expect(Array.isArray(item.tags)).toBe(true);
    }

    // The phishing-refusal fixture is the only one we ship with policyStatus
    // = "fail"; if the seeder ever loses it the demo loses its "look — the
    // chain catches policy fails too" story. Pin its presence.
    const failFixture = body.items.find((i) => i.policyStatus === "fail");
    expect(failFixture, "demo chain should include at least one policy-fail fixture").toBeDefined();
    expect(failFixture!.policyViolations.length).toBeGreaterThan(0);
  });

  test("POST /demo/mint (anonymous) → 201 with chained receipt", async ({ request }) => {
    // Capture the chain head before mint so we can prove the new receipt
    // links to it via prevHash. This is the actual "chain" property of the
    // demo chain — without it the receipt would be a standalone stub.
    const beforeResp = await request.get(`${BASE}/demo/chain`);
    const before = await beforeResp.json() as {
      items: Array<{ chainHash: string }>;
    };
    const headBefore = before.items[0]?.chainHash;
    expect(headBefore, "demo chain must have a head before mint").toBeTruthy();

    // Use a unique prompt+response so the content-addressed id is fresh
    // (demo-seeder uses sha256(prompt+response+model+demo-public) as id and
    // ON CONFLICT DO NOTHING, so a duplicate would silently no-op).
    const unique = `e2e mint probe ${Date.now()}-${Math.random()}`;
    const mintResp = await request.post(`${BASE}/demo/mint`, {
      data: {
        prompt: `What is the meaning of: ${unique}?`,
        response: `It is a unique e2e probe value: ${unique}`,
        model: "gpt-4o",
      },
    });
    expect(mintResp.status()).toBe(201);
    const minted = await mintResp.json() as {
      id: string;
      prompt: string;
      response: string;
      model: string;
      promptHash: string;
      responseHash: string;
      chainHash: string;
      prevHash: string | null;
      policyStatus: string;
      policyViolations: string[];
      tags: string[];
    };

    // Cryptographic shape — sha256 hex everywhere.
    expect(minted.chainHash.length).toBe(64);
    expect(minted.promptHash.length).toBe(64);
    expect(minted.responseHash.length).toBe(64);

    // Demo mints must NOT run policy evaluation — policyStatus stays
    // "pending" and violations stay empty regardless of content.  This is
    // the contract that lets visitors mint anything without triggering the
    // webhook / activity_log / violation-counter side effects.
    expect(minted.policyStatus).toBe("pending");
    expect(minted.policyViolations).toEqual([]);
    expect(minted.tags).toEqual(expect.arrayContaining(["demo", "byoai"]));

    // Chain link assertion: prevHash must equal the previous chain head.
    expect(minted.prevHash).toBe(headBefore);

    // GET /demo/chain should now show the new receipt at position 0
    // (most-recent-first ordering).
    const afterResp = await request.get(`${BASE}/demo/chain`);
    const after = await afterResp.json() as {
      items: Array<{ id: string; chainHash: string }>;
    };
    expect(after.items[0].id).toBe(minted.id);
    expect(after.items[0].chainHash).toBe(minted.chainHash);
  });

  test("POST /demo/mint rejects oversize prompt with 400", async ({ request }) => {
    // Cap is 2 KiB (2048 chars). A 3 KiB prompt must be refused — letting
    // it through would let an anonymous visitor write arbitrarily large
    // rows into the public demo chain.
    const huge = "x".repeat(3 * 1024);
    const resp = await request.post(`${BASE}/demo/mint`, {
      data: { prompt: huge, response: "ok", model: "gpt-4o" },
    });
    expect(resp.status()).toBe(400);
  });
});

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

  test("GET /interactions/:id/verify → 200 with valid field", async ({ request }) => {
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
    const body = await verifyResp.json() as { valid: boolean };
    expect(typeof body.valid).toBe("boolean");
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

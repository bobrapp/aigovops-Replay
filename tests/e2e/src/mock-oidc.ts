/**
 * Minimal mock OIDC provider for e2e testing.
 *
 * Implements the subset of OpenID Connect that openid-client v6 exercises
 * during a mobile authorization-code exchange (no browser redirect needed):
 *
 *   GET  /.well-known/openid-configuration  — discovery document
 *   GET  /.well-known/jwks.json             — RSA-2048 public key (JWK)
 *   POST /token                              — code → id_token + access_token
 *   GET  /auth                               — browser flow stub (→ redirect)
 *   GET  /logout                             — stub (→ redirect)
 *
 * Uses only Node.js built-in `crypto` — no external JWT libraries needed.
 * Any submitted code/code_verifier pair is accepted (PKCE validation is
 * intentionally omitted; the test flow is not testing PKCE correctness).
 * The returned id_token is a real RS256-signed JWT verified by openid-client.
 */
import http from "node:http";
import crypto from "node:crypto";

const KEY_ID = "mock-key-1";

// ---------------------------------------------------------------------------
// Key pair — generated once at module load time (sync, RSA-2048)
// ---------------------------------------------------------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "der" },
  privateKeyEncoding: { type: "pkcs8", format: "der" },
});

const privateKeyObj = crypto.createPrivateKey({ key: privateKey, format: "der", type: "pkcs8" });
const publicKeyObj = crypto.createPublicKey({ key: publicKey, format: "der", type: "spki" });

/** Export the public key as a JWK (with kid + alg + use added). */
function getPublicJwk(): Record<string, string> {
  const jwk = publicKeyObj.export({ format: "jwk" }) as Record<string, string>;
  return { ...jwk, kid: KEY_ID, alg: "RS256", use: "sig" };
}

// ---------------------------------------------------------------------------
// Minimal JWT signing with Node.js crypto (RS256 = RSA-PKCS1v15 + SHA-256)
// ---------------------------------------------------------------------------
function b64url(data: Buffer | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function signJwt(
  payload: Record<string, unknown>,
  privKey: crypto.KeyObject,
  kid: string,
): string {
  const header = { alg: "RS256", kid, typ: "JWT" };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const msg = `${head}.${body}`;
  const sig = crypto.sign("SHA256", Buffer.from(msg), {
    key: privKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  return `${msg}.${b64url(sig)}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function respond(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
export function startMockOidc(port: number): Promise<http.Server> {
  const issuer = `http://127.0.0.1:${port}`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", issuer);

    try {
      // ── Discovery document ──────────────────────────────────────────────
      if (url.pathname === "/.well-known/openid-configuration") {
        respond(res, 200, {
          issuer,
          authorization_endpoint: `${issuer}/auth`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          scopes_supported: ["openid", "email", "profile", "offline_access"],
          token_endpoint_auth_methods_supported: [
            "none",
            "client_secret_basic",
            "client_secret_post",
          ],
          code_challenge_methods_supported: ["S256", "plain"],
          grant_types_supported: ["authorization_code"],
          end_session_endpoint: `${issuer}/logout`,
        });
        return;
      }

      // ── JWKS ────────────────────────────────────────────────────────────
      if (url.pathname === "/.well-known/jwks.json") {
        respond(res, 200, { keys: [getPublicJwk()] });
        return;
      }

      // ── Authorization endpoint (browser flow stub) ───────────────────────
      if (url.pathname === "/auth") {
        const redirectUri = url.searchParams.get("redirect_uri") ?? "";
        const state = url.searchParams.get("state") ?? "";
        const code = crypto.randomBytes(12).toString("hex");
        const dest = new URL(redirectUri);
        dest.searchParams.set("code", code);
        dest.searchParams.set("state", state);
        dest.searchParams.set("iss", issuer);
        res.writeHead(302, { Location: dest.href });
        res.end();
        return;
      }

      // ── Token endpoint ──────────────────────────────────────────────────
      if (url.pathname === "/token" && req.method === "POST") {
        const body = await readBody(req);
        const params = new URLSearchParams(body);

        const clientId =
          params.get("client_id") ?? process.env.REPL_ID ?? "test-client";
        const nonce = params.get("nonce") ?? undefined;

        const now = Math.floor(Date.now() / 1000);
        // Fixed sub so repeated token exchanges upsert the same DB row and
        // never violate the users_email_unique constraint across test cases.
        const sub = "e2e-mock-user-fixed";

        const idToken = signJwt(
          {
            iss: issuer,
            aud: clientId,
            sub,
            email: "e2e@test.local",
            first_name: "E2E",
            last_name: "Test",
            iat: now,
            exp: now + 3600,
            ...(nonce !== undefined ? { nonce } : {}),
          },
          privateKeyObj,
          KEY_ID,
        );

        respond(res, 200, {
          access_token: "mock-access-" + crypto.randomBytes(8).toString("hex"),
          token_type: "Bearer",
          expires_in: 3600,
          id_token: idToken,
        });
        return;
      }

      // ── Logout stub ─────────────────────────────────────────────────────
      if (url.pathname === "/logout") {
        res.writeHead(302, { Location: "/" });
        res.end();
        return;
      }

      respond(res, 404, { error: "not_found" });
    } catch (err) {
      console.error("[mock-oidc] handler error:", err);
      respond(res, 500, { error: "internal_error" });
    }
  });

  return new Promise<http.Server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

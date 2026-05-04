import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";
import { logger } from "../lib/logger";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

/**
 * Derive the application's canonical public origin from trusted environment
 * variables — NOT from request headers.
 *
 * Security rationale (OIDC redirect-URI pinning):
 *   The previous implementation read `x-forwarded-proto`, `x-forwarded-host`,
 *   and `host` from the incoming request to build the OIDC `redirect_uri` and
 *   `post_logout_redirect_uri`. In proxy deployments those headers can be
 *   attacker-controlled: a poisoned `Host: attacker.example` header would cause
 *   the server to send Replit OIDC an `redirect_uri=https://attacker.example/…`
 *   authorization request. If the provider accepted the dynamically supplied URI,
 *   the victim's completed-login callback (and therefore the session ID) could be
 *   observed by the attacker.
 *
 * Trusted sources (in priority order):
 *   1. APP_ORIGIN env var — explicit operator override, useful for custom domains.
 *   2. First entry of REPLIT_DOMAINS — set by the Replit platform for production
 *      deployments; not forwardable by a client.
 *   3. REPLIT_DEV_DOMAIN — the per-Repl development preview hostname, also
 *      set by the platform.
 *   4. http://localhost:3000 — local development only (not reachable from outside).
 *
 * Request headers are never consulted.
 */
function getCanonicalOrigin(): string {
  // Explicit operator-configured override (e.g. custom domain).
  const appOrigin = process.env.APP_ORIGIN;
  if (appOrigin) return appOrigin.replace(/\/$/, "");

  // Production: first entry of the Replit-managed domain list.
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const first = replitDomains.split(",").map((s) => s.trim()).filter(Boolean)[0];
    if (first) return `https://${first}`;
  }

  // Development preview: Replit-assigned per-Repl domain.
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${devDomain}`;

  // Local fallback — only reachable in a developer's own environment.
  // Security note: this value is never derived from request headers (Host,
  // X-Forwarded-Host, X-Forwarded-Proto). Those headers are attacker-controlled
  // in proxy deployments and must not be trusted for OIDC redirect URI construction.
  logger.warn("getCanonicalOrigin: no APP_ORIGIN / REPLIT_DOMAINS / REPLIT_DEV_DOMAIN set — falling back to localhost");
  return "http://localhost:3000";
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const userData = {
    id: claims.sub as string,
    email: (claims.email as string) || null,
    firstName: (claims.first_name as string) || null,
    lastName: (claims.last_name as string) || null,
    profileImageUrl: (claims.profile_image_url || claims.picture) as
      | string
      | null,
  };

  try {
    const [user] = await db
      .insert(usersTable)
      .values(userData)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  } catch (err: unknown) {
    // Postgres enforces ALL unique constraints at INSERT time, before the
    // ON CONFLICT handler fires.  If a different user row already holds this
    // email address (e.g. a leftover row from a prior random sub), we update
    // only the mutable profile fields on that row — never the primary key —
    // so that existing related records are not orphaned.
    const isEmailConflict =
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string" &&
      (err as { message: string }).message.includes("users_email_unique");

    if (isEmailConflict && userData.email) {
      const { eq } = await import("drizzle-orm");
      const [user] = await db
        .update(usersTable)
        // IMPORTANT: do NOT include `id` here — mutating the primary key
        // would orphan any related records that reference the old user id.
        .set({
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.email, userData.email))
        .returning();
      return user;
    }
    throw err;
  }
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  // Use the server-side canonical origin — never derived from request headers.
  const callbackUrl = `${getCanonicalOrigin()}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  // Must match the redirect_uri sent in /login — pinned to the canonical origin.
  const callbackUrl = `${getCanonicalOrigin()}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

// POST (not GET) so that SameSite=Lax prevents cookies being sent on
// cross-site navigations, closing the CSRF logout vector described in
// GHSA-style reports where an attacker-controlled page suppresses the
// Referer header and forces a top-level GET navigation to /api/logout.
// The client receives a JSON { redirectUrl } and navigates programmatically.
router.post("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  // Post-logout redirect pinned to the canonical origin — not request headers.
  const origin = getCanonicalOrigin();

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.json({ redirectUrl: endSessionUrl.href });
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;

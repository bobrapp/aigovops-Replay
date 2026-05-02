/**
 * app.ts — Express application bootstrap.
 *
 * ─── AUTHENTICATION AND ORIGIN CONTROLS (defense-in-depth) ───────────────────
 *
 * 1. CORS ALLOWLIST (buildAllowedOrigins + cors middleware)
 *    Credentials are reflected ONLY to origins in an explicit allowlist built
 *    from REPLIT_DOMAINS and REPLIT_DEV_DOMAIN.  The previous `origin: true`
 *    reflected any caller-supplied Origin header.  Unrecognised origins receive
 *    no Access-Control-Allow-Origin and no Access-Control-Allow-Credentials.
 *
 * 2. CSRF ORIGIN GUARD (sameOriginGuard middleware)
 *    CORS alone does not protect against CSRF from same-site sibling origins
 *    because cookies with SameSite=Lax are still sent on same-site cross-origin
 *    top-level navigations and the CORS preflight only applies to "non-simple"
 *    requests.  Simple application/x-www-form-urlencoded POSTs, for example,
 *    do not trigger a preflight even under the CORS spec.
 *
 *    The sameOriginGuard middleware addresses this by independently validating
 *    the Origin (and Referer as a fallback) header for:
 *      - All state-changing methods: POST, PUT, PATCH, DELETE
 *      - GET /api/logout — clears the server-side session (state-changing despite GET)
 *
 *    Any request with an Origin or Referer header that is NOT in the allowlist
 *    is rejected with 403 before reaching any route handler.
 *
 *    Requests with no Origin and no Referer (server-to-server, CLI tools, and
 *    React Native mobile fetch) are allowed through because the browser always
 *    includes Origin for cross-origin requests; its absence indicates a
 *    same-origin or non-browser client.
 *
 * 3. OIDC REDIRECT-URI PINNING (auth.ts — getCanonicalOrigin)
 *    redirect_uri and post_logout_redirect_uri are derived from env vars only,
 *    never from attacker-controllable request headers.
 *
 * 4. MOBILE SECURE TOKEN STORAGE (aigovops-mobile AuthContext.tsx)
 *    Bearer session tokens are stored in expo-secure-store (iOS Keychain /
 *    Android Keystore) rather than unencrypted AsyncStorage.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";

const app: Express = express();

/**
 * Build the CORS/CSRF origin allowlist from environment variables set by Replit.
 *
 * - REPLIT_DOMAINS: comma-separated production domains (e.g. "foo.replit.app")
 * - REPLIT_DEV_DOMAIN: the per-Repl development preview hostname
 *
 * Any unrecognised origin is silently blocked; credentials are never
 * reflected to arbitrary origins, closing the cross-origin credentialed
 * request vector described in the security scan.
 */
function buildAllowedOrigins(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [];

  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    for (const d of replitDomains.split(",").map(s => s.trim()).filter(Boolean)) {
      origins.push(`https://${d}`);
    }
  }

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    origins.push(`https://${devDomain}`);
  }

  if (process.env.NODE_ENV !== "production") {
    origins.push(/^https?:\/\/localhost(:\d+)?$/);
    origins.push(/^https?:\/\/127\.0\.0\.1(:\d+)?$/);
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

/** Returns true when the given origin string is in the allowlist. */
function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.some(a =>
    typeof a === "string" ? a === origin : a.test(origin),
  );
}

/**
 * CSRF / same-origin guard for state-changing requests.
 *
 * Validates the Origin header (Referer as fallback) against allowedOrigins for:
 *   - POST, PUT, PATCH, DELETE (state-changing HTTP methods)
 *   - GET /api/logout (clears the server-side session — state-changing despite GET)
 *
 * Why Origin header validation works for CSRF:
 *   Browsers always include Origin on cross-origin requests that could carry
 *   cookies.  A same-site sibling origin would include its own origin in the
 *   header, and if that origin is not in the allowlist this middleware rejects
 *   the request before any route handler sees it — even for simple
 *   application/x-www-form-urlencoded POSTs that would not trigger a CORS
 *   preflight.
 *
 * Non-browser clients (curl, scripts, React Native mobile fetch) do not send
 * Origin or Referer, so they are allowed through.  These clients cannot exploit
 * CSRF because they cannot read or replay browser cookies.
 */
function sameOriginGuard(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  // GET /api/logout clears the session — protect it too.
  const isLogoutGet = method === "GET" && req.path.startsWith("/api/logout");

  if (!isStateChanging && !isLogoutGet) {
    next();
    return;
  }

  // If there are no allowed origins configured (e.g. bare local dev without env
  // vars), skip enforcement rather than locking out all clients.  Log a warning.
  if (allowedOrigins.length === 0) {
    logger.warn("sameOriginGuard: allowedOrigins is empty — skipping enforcement");
    next();
    return;
  }

  const origin = req.headers.origin;

  if (origin) {
    // Browsers always send Origin for cross-origin requests with state-changing
    // methods.  If it is not in the allowlist, reject immediately.
    if (!isAllowedOrigin(origin)) {
      res.status(403).json({ error: "Forbidden: request origin not permitted" });
      return;
    }
    next();
    return;
  }

  // No Origin header — check Referer as a secondary signal (older browsers,
  // some redirected requests, and certain proxy configurations).
  const referer = req.headers.referer;
  if (referer) {
    let refOrigin: string;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      // Malformed Referer — reject to be safe.
      res.status(403).json({ error: "Forbidden: malformed Referer header" });
      return;
    }
    if (!isAllowedOrigin(refOrigin)) {
      res.status(403).json({ error: "Forbidden: request referer not permitted" });
      return;
    }
  }

  // No Origin or Referer — allow.  This covers:
  //   • Same-origin browser requests (browser omits Origin on same-origin GETs)
  //   • Server-to-server / CLI requests (curl, scripts, health checks)
  //   • React Native mobile fetch (does not send Origin/Referer)
  next();
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  }),
);
app.use(cookieParser());

/**
 * Limit JSON request bodies to 64 KB to prevent body-based resource exhaustion.
 * prompt + response fields are capped at this size; anything larger is rejected
 * with 413 Payload Too Large before any route handler runs.
 */
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

/**
 * Global rate limiter: 300 requests per minute per IP.
 * Prevents brute-force and bulk enumeration across all endpoints.
 */
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down." },
});

/**
 * Stricter limiter for expensive read-heavy endpoints.
 * /api/stats runs fullChainIntegrityCheck (3 parallel DB queries).
 * /api/interactions triggers a count(*) plus paginated select.
 * /api/chain runs fullChainIntegrityCheck + a 100-row select.
 */
const heavyReadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests to this endpoint — please slow down." },
});

app.use(globalLimiter);
app.use(["/api/stats", "/api/interactions", "/api/chain"], heavyReadLimiter);

// CSRF / same-origin guard — must run after cookieParser so cookies are readable
// (for future cookie-presence checks), and before authMiddleware + routes so that
// malicious requests are rejected before any session or DB access occurs.
app.use(sameOriginGuard);

app.use(authMiddleware);

app.use("/api", router);

export default app;

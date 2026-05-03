import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";

const app: Express = express();

// Trust the reverse proxy (Replit's shared proxy sets X-Forwarded-For).
// Required for express-rate-limit to correctly identify client IPs.
app.set("trust proxy", 1);

/**
 * Build the CORS/CSRF origin allowlist from environment variables.
 *
 * Sources (in priority order):
 *   APP_ORIGIN      — explicit operator override for custom domains
 *   REPLIT_DOMAINS  — comma-separated production domains set by the platform
 *   REPLIT_DEV_DOMAIN — per-Repl development preview hostname
 *   localhost/127.x — allowed only in non-production environments
 *
 * Any unrecognised origin is silently blocked; credentials are never
 * reflected to arbitrary origins.
 */
function buildAllowedOrigins(): (string | RegExp)[] {
  const origins: (string | RegExp)[] = [];

  // Explicit operator-configured custom domain (also used by getCanonicalOrigin).
  const appOrigin = process.env.APP_ORIGIN;
  if (appOrigin) {
    origins.push(appOrigin.replace(/\/$/, ""));
  }

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

// Fail fast in production if no origins are configured — the CSRF guard
// would otherwise skip enforcement, leaving state-changing routes unprotected.
if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  throw new Error(
    "FATAL: allowedOrigins is empty in production. " +
    "Set APP_ORIGIN or ensure REPLIT_DOMAINS / REPLIT_DEV_DOMAIN are present.",
  );
}

logger.info({ count: allowedOrigins.length }, "CORS/CSRF origin allowlist configured");

function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.some(a =>
    typeof a === "string" ? a === origin : a.test(origin),
  );
}

/**
 * CSRF / same-origin guard for state-changing requests.
 *
 * Validates Origin (or Referer as fallback) against the allowlist for
 * POST/PUT/PATCH/DELETE and GET /api/logout. CORS alone is insufficient
 * because SameSite=Lax cookies are still sent on same-site cross-origin
 * navigations, and simple form POSTs do not trigger a CORS preflight.
 *
 * Requests with no Origin/Referer (CLI, server-to-server, mobile native
 * fetch) are allowed through — browsers always include Origin for
 * cross-site requests that carry cookies.
 */
function sameOriginGuard(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const isLogoutGet = method === "GET" && req.path.startsWith("/api/logout");

  if (!isStateChanging && !isLogoutGet) {
    next();
    return;
  }

  // Skip enforcement if allowlist is empty (bare local dev with no env vars).
  if (allowedOrigins.length === 0) {
    logger.warn("sameOriginGuard: allowedOrigins is empty — skipping enforcement");
    next();
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin)) {
      res.status(403).json({ error: "Forbidden: request origin not permitted" });
      return;
    }
    next();
    return;
  }

  // No Origin — check Referer as secondary signal.
  const referer = req.headers.referer;
  if (referer) {
    let refOrigin: string;
    try {
      refOrigin = new URL(referer).origin;
    } catch {
      res.status(403).json({ error: "Forbidden: malformed Referer header" });
      return;
    }
    if (!isAllowedOrigin(refOrigin)) {
      res.status(403).json({ error: "Forbidden: request referer not permitted" });
      return;
    }
  }

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
// Security: origin must be an explicit allowlist, never `true` (which reflects any caller-supplied
// Origin header back as Access-Control-Allow-Origin). Reflecting arbitrary origins combined with
// credentials:true allows any website — including attacker-controlled same-site sibling subdomains —
// to make credentialed cross-origin requests and read protected API responses.
// When no origins are configured (bare local dev) we disable CORS entirely rather than open it up.
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

// CSRF / same-origin guard: runs after cookieParser, before auth and routes.
app.use(sameOriginGuard);

app.use(authMiddleware);

app.use("/api", router);

export default app;

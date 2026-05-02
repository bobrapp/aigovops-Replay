import { randomBytes } from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

export const ADMIN_COOKIE = "aigovops_admin";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * In-process session store: sessionToken → expiry timestamp (ms).
 *
 * A random 32-byte token is generated at login; only this opaque token
 * is stored in the browser cookie — the raw ADMIN_API_KEY is never sent
 * to the client at any point.
 *
 * Tokens expire after COOKIE_MAX_AGE_MS. Expired entries are lazily pruned
 * when a new session is created.
 */
const sessions = new Map<string, number>();

function pruneExpiredSessions(): void {
  const now = Date.now();
  for (const [id, expiry] of sessions) {
    if (now > expiry) sessions.delete(id);
  }
}

function createSession(): string {
  pruneExpiredSessions();
  const id = randomBytes(32).toString("hex");
  sessions.set(id, Date.now() + COOKIE_MAX_AGE_MS);
  return id;
}

function isValidSession(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const expiry = sessions.get(id);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    sessions.delete(id);
    return false;
  }
  return true;
}

/**
 * Express middleware that gates policy-mutation routes.
 *
 * Validates the HttpOnly session cookie set by POST /api/admin/login.
 * The session token is an opaque random value — ADMIN_API_KEY is
 * checked only at login time and is never transmitted to the browser.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.ADMIN_API_KEY) {
    res.status(503).json({
      error: "Policy management is not available: ADMIN_API_KEY is not configured on this server.",
    });
    return;
  }

  if (!isValidSession(req.cookies?.[ADMIN_COOKIE])) {
    res.status(401).json({ error: "Unauthorized: an active admin session is required." });
    return;
  }

  next();
}

const router: IRouter = Router();

/** Check whether the current session token is valid. */
router.get("/admin/status", (req, res) => {
  if (!process.env.ADMIN_API_KEY) {
    res.status(503).json({ authenticated: false, reason: "not_configured" });
    return;
  }
  if (isValidSession(req.cookies?.[ADMIN_COOKIE])) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

/**
 * Exchange the admin token for an opaque session cookie.
 *
 * Flow:
 *   1. Client sends { token: "<ADMIN_API_KEY>" } in the request body.
 *   2. Server validates token against process.env.ADMIN_API_KEY.
 *   3. On success, server generates a random session ID, stores it
 *      server-side with an expiry, and sets an HttpOnly cookie.
 *   4. The raw key is never included in the response or cookie.
 */
router.post("/admin/login", (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ error: "Admin access is not configured on this server." });
    return;
  }

  const { token } = (req.body ?? {}) as { token?: unknown };
  if (typeof token !== "string" || token !== adminKey) {
    res.status(401).json({ error: "Invalid admin token." });
    return;
  }

  const sessionId = createSession();

  res.cookie(ADMIN_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_MAX_AGE_MS,
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ authenticated: true });
});

/** Invalidate the current session and clear the browser cookie. */
router.post("/admin/logout", (req, res) => {
  const sessionId = req.cookies?.[ADMIN_COOKIE];
  if (typeof sessionId === "string") sessions.delete(sessionId);
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.json({ authenticated: false });
});

export default router;

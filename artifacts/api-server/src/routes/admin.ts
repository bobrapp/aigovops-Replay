import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";

export const ADMIN_COOKIE = "aigovops_admin";
const COOKIE_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Express middleware that gates policy-mutation routes.
 *
 * Reads the HttpOnly session cookie set by POST /api/admin/login.
 * The cookie value is compared to ADMIN_API_KEY server-side only —
 * the key is never transmitted to the browser.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({
      error: "Policy management is not available: ADMIN_API_KEY is not configured on this server.",
    });
    return;
  }

  const cookie = req.cookies?.[ADMIN_COOKIE];
  if (typeof cookie !== "string" || cookie !== adminKey) {
    res.status(401).json({ error: "Unauthorized: an active admin session is required." });
    return;
  }

  next();
}

const router: IRouter = Router();

/** Check whether the current session cookie is valid. */
router.get("/admin/status", (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({ authenticated: false, reason: "not_configured" });
    return;
  }
  const cookie = req.cookies?.[ADMIN_COOKIE];
  if (typeof cookie === "string" && cookie === adminKey) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

/**
 * Exchange the admin token for a session cookie.
 * The token is validated server-side and never echoed back.
 */
router.post("/admin/login", (req, res) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({
      error: "Admin access is not configured on this server.",
    });
    return;
  }

  const { token } = (req.body ?? {}) as { token?: unknown };
  if (typeof token !== "string" || token !== adminKey) {
    res.status(401).json({ error: "Invalid admin token." });
    return;
  }

  res.cookie(ADMIN_COOKIE, adminKey, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  res.json({ authenticated: true });
});

/** Clear the admin session cookie. */
router.post("/admin/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.json({ authenticated: false });
});

export default router;

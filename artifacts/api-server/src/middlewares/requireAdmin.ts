import { type Request, type Response, type NextFunction } from "express";

/**
 * Restricts a route to admin principals only.
 *
 * Admins are identified by their Replit user ID, declared via the
 * ADMIN_USER_IDS environment variable (comma-separated list of IDs).
 *
 * Must be placed after requireAuth in the middleware chain — requireAuth
 * guarantees req.user is set, so no additional authentication check is needed.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const rawIds = process.env.ADMIN_USER_IDS ?? "";
  const adminIds = rawIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (adminIds.length === 0) {
    res.status(403).json({ error: "Forbidden: no admin principals are configured" });
    return;
  }

  const currentUserId = (req as Request & { user?: { id: string } }).user?.id ?? "";
  if (!adminIds.includes(currentUserId)) {
    res.status(403).json({ error: "Forbidden: admin privilege required" });
    return;
  }

  next();
}

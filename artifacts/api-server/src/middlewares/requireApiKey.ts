import type { Request, Response, NextFunction } from "express";

const API_KEY = process.env["API_SECRET_KEY"];

if (!API_KEY) {
  throw new Error("API_SECRET_KEY environment variable is required but was not set.");
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === API_KEY) {
      next();
      return;
    }
  }

  res.status(401).json({ error: "Unauthorized: valid API key required" });
}

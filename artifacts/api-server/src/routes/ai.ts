import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const MODEL = "gemini-2.5-flash";

/**
 * Stricter per-IP rate limiter for AI generation.
 *
 * The global limiter (app.ts) allows 300 req/min/IP across all routes.
 * Each call to this endpoint triggers an external Gemini API request with
 * up to 8,192 output tokens, making it orders of magnitude more expensive
 * than a typical database read. 20 req/min is generous for legitimate
 * interactive use while meaningfully limiting quota-exhaustion abuse.
 */
const aiGenerateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many AI generation requests — please slow down." },
});

/**
 * POST /api/ai/generate
 * Sends a prompt to Gemini Flash and returns the response text.
 * Used to create receipts from real AI interactions.
 *
 * Security: requireAuth ensures only authenticated users can consume the
 * server-side Gemini integration. Without this guard, any unauthenticated
 * caller could exhaust the application's AI API quota. The aiGenerateLimiter
 * provides a tighter per-IP cap on top of the global 300 req/min limiter.
 */
router.post("/ai/generate", requireAuth, aiGenerateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { prompt } = req.body as { prompt?: unknown };

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt must be a non-empty string" });
    return;
  }
  if (prompt.length > 32768) {
    res.status(400).json({ error: "prompt exceeds 32 KiB limit" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!baseUrl || !apiKey) {
    req.log.error("Gemini env vars not configured");
    res.status(503).json({ error: "AI integration not configured" });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } });

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });

    const text = result.text ?? "";
    res.json({ response: text, model: MODEL });
  } catch (err: unknown) {
    req.log.error({ err }, "Gemini generate failed");
    res.status(502).json({ error: "AI generation failed" });
  }
});

export default router;

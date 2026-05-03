import { Router, type IRouter, type Request, type Response } from "express";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

const MODEL = "gemini-2.5-flash";

/**
 * POST /api/ai/generate
 * Sends a prompt to Gemini Flash and returns the response text.
 * Used to create receipts from real AI interactions.
 */
router.post("/ai/generate", async (req: Request, res: Response): Promise<void> => {
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
    const ai = new GoogleGenAI({ apiKey, httpOptions: { baseUrl } });

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

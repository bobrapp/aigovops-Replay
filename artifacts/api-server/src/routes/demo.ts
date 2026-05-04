import { Router, type IRouter, type Request, type Response } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { interactionsTable, usersTable } from "@workspace/db";
import { hashPrompt, hashResponse, buildChainHash } from "../lib/crypto";
import { generateId } from "../lib/id";

/**
 * Public, no-login "Try it now" surface.
 *
 * Goal: let any visitor make ONE real Gemini call and get back a real,
 * cryptographically-chained receipt — without creating an account. This is
 * the frictionless path that lets people experience the product end-to-end
 * before deciding to sign up.
 *
 * Safety model:
 *   - All demo receipts are written under a single shared synthetic user
 *     (`DEMO_USER_ID`). They never touch a real user's chain, and the
 *     authenticated routes never read them (they always scope by req.user.id).
 *   - The shared user is upserted lazily on the first request so this route
 *     works even on a fresh database with no migrations to add it.
 *   - Both endpoints are aggressively rate-limited PER IP using the official
 *     IPv6-safe key generator from express-rate-limit (so an attacker can't
 *     bypass the limit by varying the low bits of an IPv6 address).
 *   - Prompt size is capped much tighter than the authenticated endpoint
 *     (2 KiB vs 32 KiB) and Gemini output is capped at 1024 tokens (vs 8192)
 *     so a flood can't blow the AI quota or DB budget.
 *   - Policy evaluation, webhooks, and activity-log inserts are intentionally
 *     skipped: demo traffic must not be able to inflate violation counters
 *     on real policies or trigger webhook deliveries on real endpoints.
 */
const router: IRouter = Router();

const MODEL = "gemini-2.5-flash";
const DEMO_USER_ID = "demo-public";
const DEMO_USER_EMAIL = "demo@aigovops.public";
const MAX_DEMO_PROMPT_BYTES = 2048;
const MAX_DEMO_OUTPUT_TOKENS = 1024;

const CHAIN_WRITE_LOCK_KEY = 0x52455041; // "REPA" — same key as interactions.ts so demo + auth mints serialize together

/**
 * Per-IP rate limiter for /demo/generate.
 * 8 generations per hour per IP — enough for a person to play with the
 * product, far below the threshold that would let scrapers exhaust quota.
 */
const demoGenerateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Demo limit reached — you've made 8 free AI calls in the last hour. Sign in to keep going.",
  },
});

/**
 * Per-IP rate limiter for /demo/mint.
 * Tighter than generate (3/hour) because each mint writes a row.
 */
const demoMintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error:
      "Demo mint limit reached — you've created 3 free receipts in the last hour. Sign in to mint more.",
  },
});

/**
 * Lazily insert the shared demo user on first use. Idempotent — uses
 * ON CONFLICT DO NOTHING on the primary key. Cached after the first
 * successful insert so we don't hit the DB on every request.
 */
let demoUserEnsured = false;
async function ensureDemoUser(): Promise<void> {
  if (demoUserEnsured) return;
  await db
    .insert(usersTable)
    .values({
      id: DEMO_USER_ID,
      email: DEMO_USER_EMAIL,
      firstName: "Demo",
      lastName: "Visitor",
    })
    .onConflictDoNothing({ target: usersTable.id });
  demoUserEnsured = true;
}

/**
 * POST /api/demo/generate
 * Public. Sends a prompt to Gemini Flash and returns the response text.
 * Stricter input/output caps and IP-based rate limit vs /api/ai/generate.
 */
router.post(
  "/demo/generate",
  demoGenerateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { prompt } = req.body as { prompt?: unknown };

    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      res.status(400).json({ error: "prompt must be a non-empty string" });
      return;
    }
    if (Buffer.byteLength(prompt, "utf8") > MAX_DEMO_PROMPT_BYTES) {
      res.status(400).json({
        error: `Demo prompt exceeds ${MAX_DEMO_PROMPT_BYTES} byte limit — sign in for the full ${32}KiB limit.`,
      });
      return;
    }

    const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!baseUrl || !apiKey) {
      req.log.error("Gemini env vars not configured (demo)");
      res.status(503).json({ error: "AI integration not configured" });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } });
      const result = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { maxOutputTokens: MAX_DEMO_OUTPUT_TOKENS },
      });
      res.json({ response: result.text ?? "", model: MODEL });
    } catch (err: unknown) {
      req.log.error({ err }, "Gemini generate failed (demo)");
      res.status(502).json({ error: "AI generation failed" });
    }
  },
);

/**
 * POST /api/demo/mint
 * Public. Creates a receipt under the shared DEMO_USER_ID chain.
 *
 * Implementation notes:
 *   - Reuses the same chain-append advisory lock as authenticated mints so
 *     concurrent demo + authenticated writes never fork.
 *   - Skips policy evaluation, webhooks, and activity-log inserts (see file
 *     header for why).
 *   - The body schema deliberately mirrors CreateInteractionBody so the
 *     client-side code can share validation logic.
 */
router.post(
  "/demo/mint",
  demoMintLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const { prompt, response, model } = req.body as {
      prompt?: unknown;
      response?: unknown;
      model?: unknown;
    };

    if (
      typeof prompt !== "string" ||
      prompt.trim().length === 0 ||
      typeof response !== "string" ||
      response.trim().length === 0 ||
      typeof model !== "string" ||
      model.trim().length === 0
    ) {
      res.status(400).json({
        error: "prompt, response, and model must all be non-empty strings",
      });
      return;
    }
    if (Buffer.byteLength(prompt, "utf8") > MAX_DEMO_PROMPT_BYTES) {
      res
        .status(400)
        .json({ error: `Demo prompt exceeds ${MAX_DEMO_PROMPT_BYTES} byte limit` });
      return;
    }
    if (Buffer.byteLength(response, "utf8") > 32 * 1024) {
      res.status(400).json({ error: "Demo response exceeds 32 KiB limit" });
      return;
    }

    await ensureDemoUser();

    const id = generateId();
    const pHash = hashPrompt(prompt);
    const rHash = hashResponse(response);

    const interaction = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_WRITE_LOCK_KEY})`);

      const [latest] = await tx
        .select({ chainHash: interactionsTable.chainHash })
        .from(interactionsTable)
        .where(eq(interactionsTable.userId, DEMO_USER_ID))
        .orderBy(desc(interactionsTable.createdAt))
        .limit(1);

      const prevHash = latest?.chainHash ?? null;
      const chainHash = buildChainHash(pHash, rHash, prevHash);

      const [inserted] = await tx
        .insert(interactionsTable)
        .values({
          id,
          prompt,
          response,
          model,
          userId: DEMO_USER_ID,
          tags: ["demo"],
          promptHash: pHash,
          responseHash: rHash,
          prevHash,
          chainHash,
          // Demo mints always pass — policy evaluation is intentionally skipped
          // to keep anonymous traffic from inflating real policy violation counters.
          policyStatus: "pass",
          policyViolations: [],
          replayCount: 0,
        })
        .returning();

      return inserted;
    });

    if (!interaction) {
      res.status(500).json({ error: "Failed to mint demo receipt" });
      return;
    }

    res.status(201).json({
      id: interaction.id,
      model: interaction.model,
      promptHash: interaction.promptHash,
      responseHash: interaction.responseHash,
      prevHash: interaction.prevHash,
      chainHash: interaction.chainHash,
      createdAt: interaction.createdAt.toISOString(),
    });
  },
);

/**
 * GET /api/demo/chain
 * Public. Returns the most recent N receipts on the shared demo chain so
 * visitors can see their freshly-minted receipt linked into the chain.
 *
 * Returned fields are intentionally minimal — no prompt or response text —
 * because the chain is shared across all anonymous visitors.
 */
router.get(
  "/demo/chain",
  async (req: Request, res: Response): Promise<void> => {
    const limitRaw = Number(req.query.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 50
        ? Math.trunc(limitRaw)
        : 10;

    const rows = await db
      .select({
        id: interactionsTable.id,
        model: interactionsTable.model,
        promptHash: interactionsTable.promptHash,
        responseHash: interactionsTable.responseHash,
        prevHash: interactionsTable.prevHash,
        chainHash: interactionsTable.chainHash,
        createdAt: interactionsTable.createdAt,
      })
      .from(interactionsTable)
      .where(eq(interactionsTable.userId, DEMO_USER_ID))
      .orderBy(desc(interactionsTable.createdAt))
      .limit(limit);

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        model: r.model,
        promptHash: r.promptHash,
        responseHash: r.responseHash,
        prevHash: r.prevHash,
        chainHash: r.chainHash,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  },
);

export default router;

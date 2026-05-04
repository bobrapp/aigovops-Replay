/**
 * demo.ts — public, no-login demo endpoints.
 *
 * POST /demo/mint  — Bring-your-own-AI-output: visitor pastes a prompt +
 *                    response from any AI tool, gets a real cryptographically
 *                    chained receipt back. IP rate-limited to 3/hour.
 * GET  /demo/chain — Return the latest N entries from the shared public
 *                    demo chain (seeded fixtures plus any visitor mints).
 *
 * Why anonymous, and what's protected against abuse
 * ─────────────────────────────────────────────────
 *   1. There is no live LLM call here. The previous prototype that proxied
 *      Gemini for unauthenticated visitors was deleted in Task #52 to
 *      eliminate the cost and abuse surface.
 *   2. Per-IP rate limit (3/hour) caps how many rows a single source can add.
 *   3. Body-size limit: prompt ≤ 2 KiB, response ≤ 32 KiB (enforced by
 *      DemoMintBody zod). express.json({limit:"64kb"}) is a second guard.
 *   4. Demo writes never:
 *        - run policy evaluation (no policiesTable access)
 *        - increment policy violation counters
 *        - enqueue webhook deliveries
 *        - insert into activity_log
 *      Anonymous traffic must not be able to inflate real-user counters or
 *      fire real-user webhooks.
 *   5. Every demo write uses userId = DEMO_USER_ID. Every authenticated
 *      route in interactions.ts scopes its queries by req.user.id, so demo
 *      rows never appear in any authenticated user's chain or stats.
 *   6. Chain writes serialize on the same CHAIN_WRITE_LOCK_KEY advisory lock
 *      as authenticated mints — no fork can be introduced even under load.
 */
import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { sql, eq, desc, count } from "drizzle-orm";
import { z } from "zod";
import { db, interactionsTable } from "@workspace/db";
import { hashPrompt, hashResponse, buildChainHash } from "../lib/crypto";
import { generateId } from "../lib/id";
import { DEMO_USER_ID } from "../lib/demo-seeder";

const router: IRouter = Router();

/**
 * Same advisory-lock key as routes/interactions.ts. Do NOT change without
 * also changing it there — both writers must contend on the same lock.
 */
const CHAIN_WRITE_LOCK_KEY = 0x52455041;

/**
 * Demo chain page size for GET /demo/chain.
 *
 * The landing-page gallery only ever shows the head of the chain; deep
 * pagination is intentionally not supported on the public endpoint. Capping
 * the response size also bounds the worst-case payload for abusive callers.
 */
const DEMO_CHAIN_LIMIT = 50;

/**
 * Per-IP rate limiter for POST /demo/mint.
 *
 * 3 requests per hour, keyed on the client IP. The express app already calls
 * `app.set('trust proxy', 1)` so req.ip resolves to the first X-Forwarded-For
 * value populated by Replit's shared reverse proxy (not the proxy IP).
 *
 * The default per-IP keyGenerator is used; we explicitly omit `keyGenerator`
 * so the express-rate-limit ipv6 helper handles address normalization.
 */
const demoMintLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Demo mint rate limit reached — try again in an hour.",
  },
});

/**
 * Hand-written request body schema.
 *
 * We keep this local rather than relying on the orval-generated Zod export
 * because the route handler always parses the request body before any other
 * work, and the local schema is the source of truth for the per-field caps:
 *
 *   prompt   ≤ 2 048 chars  (≈ 2 KiB)
 *   response ≤ 32 768 chars (≈ 32 KiB — matches the authenticated mint cap)
 *   model    ≤   100 chars
 *
 * The OpenAPI spec mirrors these limits so the generated DemoMintBody Zod
 * stays in sync — `pnpm run test:spec` enforces that they match.
 */
const DemoMintBody = z.object({
  prompt: z.string().min(1).max(2048),
  response: z.string().min(1).max(32768),
  model: z.string().min(1).max(100),
});

function toDemoReceiptDto(i: typeof interactionsTable.$inferSelect) {
  return {
    id: i.id,
    prompt: i.prompt,
    response: i.response,
    model: i.model,
    tags: i.tags ?? [],
    promptHash: i.promptHash,
    responseHash: i.responseHash,
    prevHash: i.prevHash ?? null,
    chainHash: i.chainHash,
    policyStatus: i.policyStatus,
    policyViolations: i.policyViolations ?? [],
    createdAt: i.createdAt.toISOString(),
  };
}

/**
 * GET /demo/chain
 * Returns the most recent DEMO_CHAIN_LIMIT receipts on the shared public
 * demo chain, plus the total count. Anonymous; no auth required.
 */
router.get("/demo/chain", async (_req, res) => {
  const items = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.userId, DEMO_USER_ID))
    .orderBy(desc(interactionsTable.createdAt))
    .limit(DEMO_CHAIN_LIMIT);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(interactionsTable)
    .where(eq(interactionsTable.userId, DEMO_USER_ID));

  res.json({
    items: items.map(toDemoReceiptDto),
    total: Number(total),
  });
});

/**
 * POST /demo/mint
 * Bring-your-own-AI-output: visitor supplies prompt + response + model and
 * receives a real chained receipt. Anonymous; per-IP rate-limited.
 */
router.post("/demo/mint", demoMintLimiter, async (req, res) => {
  const parsed = DemoMintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid demo mint body",
      details: parsed.error.issues,
    });
    return;
  }
  const body = parsed.data;

  const id = generateId();
  const promptHash = hashPrompt(body.prompt);
  const responseHash = hashResponse(body.response);

  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_WRITE_LOCK_KEY})`);

    const [latest] = await tx
      .select({ chainHash: interactionsTable.chainHash })
      .from(interactionsTable)
      .where(eq(interactionsTable.userId, DEMO_USER_ID))
      .orderBy(desc(interactionsTable.createdAt))
      .limit(1);

    const prevHash = latest?.chainHash ?? null;
    const chainHash = buildChainHash(promptHash, responseHash, prevHash);

    const [row] = await tx
      .insert(interactionsTable)
      .values({
        id,
        prompt: body.prompt,
        response: body.response,
        model: body.model,
        userId: DEMO_USER_ID,
        tags: ["demo", "byoai"],
        promptHash,
        responseHash,
        prevHash,
        chainHash,
        // Demo mints do NOT run policy evaluation. Marking pending preserves
        // the contract that "fail" only appears for receipts that actually
        // failed a configured policy rule. The visible policy violations on
        // the gallery come from the seeded fixtures, not anonymous mints.
        policyStatus: "pending",
        policyViolations: [],
        replayCount: 0,
      })
      .returning();

    return row;
  });

  res.status(201).json(toDemoReceiptDto(inserted));
});

export default router;

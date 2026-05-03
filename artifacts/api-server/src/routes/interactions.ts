/**
 * interactions.ts — AI receipt CRUD, chain, verify, replay, and stats routes.
 *
 * ─── RESOURCE EXHAUSTION PROTECTIONS (defense-in-depth) ───────────────────────
 *
 * 1. BODY SIZE LIMIT (app.ts)
 *    express.json({ limit: '64kb' }) rejects payloads larger than 64 KiB before
 *    any route handler runs.  This is the outermost guard.
 *
 * 2. RATE LIMITING (app.ts)
 *    - Global limiter:     300 requests / minute / IP (all routes)
 *    - Heavy-read limiter:  60 requests / minute / IP on GET /interactions,
 *                           GET /stats, GET /chain — the expensive DB aggregation
 *                           endpoints.
 *
 * 3. PER-FIELD INPUT CAPS (CreateInteractionBody — OpenAPI → Zod)
 *    Generated from lib/api-spec/openapi.yaml via Orval:
 *      prompt   : min 1 char, max 32 768 chars (createInteractionBodyPromptMax)
 *      response : min 1 char, max 32 768 chars (createInteractionBodyResponseMax)
 *      model    : min 1 char, max 200 chars    (createInteractionBodyModelMax)
 *      tags     : max 50 items                 (createInteractionBodyTagsMax)
 *      tag item : max 100 chars each           (createInteractionBodyTagsItemMax)
 *    These caps prevent a caller from filling the entire 64 KiB budget with one
 *    field, providing per-field resource exhaustion protection in addition to the
 *    global body limit.
 *
 * 4. PAGINATION CAPS (ListInteractionsQueryParams — OpenAPI → Zod)
 *    Generated from lib/api-spec/openapi.yaml via Orval:
 *      limit  : min 1,   max 200     (listInteractionsQueryLimitMax)
 *      offset : min 0,   max 100 000 (listInteractionsQueryOffsetMax)
 *    Callers requesting ?limit=100000000 receive a Zod 400 before any DB call.
 *    Math.trunc() is additionally applied before passing to Drizzle because
 *    zod.coerce.number() accepts decimal inputs (e.g. "50.5") that PostgreSQL's
 *    LIMIT/OFFSET clause would reject with a 500 error.
 *
 * 5. AGGREGATION CAPS (GET /stats)
 *    modelsUsed  : .limit(200) — caps the SELECT DISTINCT model scan to 200 rows.
 *    recentActivity : .limit(10) — caps the activity log join to 10 rows.
 *    The count queries use COUNT(*), which PostgreSQL executes as a fast
 *    sequential aggregate without materializing the full result set.
 *
 * 6. USER SCOPING (ALL routes)
 *    Every DB query is filtered by the authenticated userId (from the verified
 *    session, never from the request body/query string).  This prevents a
 *    resource-exhaustion path where a user triggers aggregations over another
 *    user's (potentially larger) dataset.
 *
 * 7. PER-USER CHAINS
 *    Chain appends (POST /interactions and POST /interactions/:id/replay) scope
 *    the "latest chainHash" lookup to the current user so each user maintains
 *    their own independent append-only chain.  Without this filter, receipts
 *    from different users interleave into a global chain, causing per-user
 *    /chain integrity checks to falsely report broken links.  The genesis
 *    uniqueness check in GET /interactions/:id/verify is likewise scoped to
 *    the receipt owner so that each user's first receipt is legitimately a
 *    genesis node without triggering a false "multiple genesis" error.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { db, interactionsTable, activityLogTable, policiesTable, shareTokensTable } from "@workspace/db";
import { eq, desc, asc, count, and, sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import {
  ListInteractionsQueryParams,
  CreateInteractionBody,
  GetInteractionParams,
  VerifyInteractionParams,
  ReplayInteractionParams,
} from "@workspace/api-zod";
import { hashPrompt, hashResponse, buildChainHash } from "../lib/crypto";
import { generateId } from "../lib/id";
import { evalPolicyRule } from "../lib/policy-eval";
import { insertActivityLog } from "../lib/activity-log";
import { requireAuth } from "../middlewares/requireAuth";

/**
 * SHARE_TOKEN_EXPIRY_DAYS — configurable TTL for public share tokens.
 * Default: 7 days.
 */
const SHARE_TOKEN_EXPIRY_DAYS = Number(process.env["SHARE_TOKEN_EXPIRY_DAYS"] ?? 7);

/**
 * CHAIN_HEALTH_ROW_CAP — max receipts examined by GET /chain/health per call.
 * Prevents unbounded scans on very long chains. Default: 50 000.
 */
const CHAIN_HEALTH_ROW_CAP = Number(process.env["CHAIN_HEALTH_ROW_CAP"] ?? 50_000);

/**
 * CHAIN_VERIFY_DEPTH_LIMIT — max depth of the recursive ancestry CTE in
 * GET /interactions/:id/verify. Chains deeper than this return 422.
 * Default: 10 000.
 */
const CHAIN_VERIFY_DEPTH_LIMIT = Number(process.env["CHAIN_VERIFY_DEPTH_LIMIT"] ?? 10_000);

/**
 * Hash a raw share token for safe DB storage (prevents leaking usable tokens
 * via a DB dump). We use SHA-256(rawToken) — the token itself is a 32-byte
 * cryptographically random value, so plain SHA-256 is sufficient; HMAC is not
 * required because the input is already high-entropy.
 */
function hashShareToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** requireAuth guarantees req.user is set; this helper narrows the type. */
function userId(req: Express.Request): string {
  return (req as Express.Request & { user: NonNullable<Express.Request["user"]> }).user.id;
}

/**
 * Per-user mint rate limiter for POST /interactions.
 *
 * Keyed on the authenticated userId (set by requireAuth before this middleware
 * runs). This prevents a single user from exhausting DB space or inflating chain
 * length by minting receipts at an unbounded rate, while having no effect on other
 * users' allowances.
 *
 * Configurable via environment variables with sensible defaults:
 *   MINT_RATE_LIMIT_MAX        — max mints per window  (default: 30)
 *   MINT_RATE_LIMIT_WINDOW_MS  — window in ms          (default: 60 000 = 1 min)
 */
const mintRateLimiter = rateLimit({
  windowMs: Number(process.env["MINT_RATE_LIMIT_WINDOW_MS"] ?? 60_000),
  limit: Number(process.env["MINT_RATE_LIMIT_MAX"] ?? 30),
  keyGenerator: (req) => userId(req as Express.Request),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: () => {
    const max = Number(process.env["MINT_RATE_LIMIT_MAX"] ?? 30);
    const windowSec = Math.round(
      Number(process.env["MINT_RATE_LIMIT_WINDOW_MS"] ?? 60_000) / 1000,
    );
    const windowLabel = windowSec === 60 ? "minute" : `${windowSec} seconds`;
    return {
      error: `Mint rate limit exceeded — you can create at most ${max} receipts per ${windowLabel}. Please try again shortly.`,
    };
  },
});

const router: IRouter = Router();

/**
 * Advisory lock key used to serialize all chain-append operations.
 *
 * Security rationale (fork prevention):
 *   Without serialization, two concurrent POST /interactions requests can each
 *   read the same latest chainHash, independently compute a new chainHash from
 *   it, and both insert successfully — creating a fork. This corrupts the
 *   append-only audit guarantee.
 *
 * Mitigations applied (defense-in-depth):
 *   1. Application layer: pg_advisory_xact_lock inside a transaction ensures
 *      only one writer can read-then-insert the chain tip at a time.
 *      pg_advisory_xact_lock is automatically released at transaction end.
 *   2. Database layer: a partial unique index on prev_hash (WHERE prev_hash IS
 *      NOT NULL) in the interactions table rejects any second receipt that
 *      claims an already-claimed predecessor, even if the lock is bypassed
 *      (e.g. direct DB write or a future multi-instance deployment).
 */
const CHAIN_WRITE_LOCK_KEY = 0x52455041; // "REPA" in hex — unique to this app

/**
 * Per-user chain integrity check over ALL of the user's receipts (no window limit).
 *
 * All three queries are scoped to the calling user's receipts so that
 * integrity metadata for other users is never included in the result.
 *
 * Returns:
 *   brokenLinks  — user's receipts whose prevHash doesn't match any chainHash
 *                  they own (orphaned within their sub-chain)
 *   forks        — prevHash values claimed by more than one of the user's receipts
 *                  (indicates a concurrent-write race that produced a split)
 *   genesisCount — count of the user's receipts with NULL prevHash (should be ≤ 1)
 *   intact       — true only when brokenLinks === 0, forks === 0, genesisCount <= 1
 */
async function userChainIntegrityCheck(uid: string): Promise<{
  brokenLinks: number;
  forks: number;
  genesisCount: number;
  intact: boolean;
}> {
  const [brokenLinksResult, forksResult, genesisResult] = await Promise.all([
    // Broken link: user's receipt whose prevHash doesn't match any chainHash they own
    db.execute<{ broken: string }>(sql`
      SELECT COUNT(*) AS broken
      FROM interactions
      WHERE user_id = ${uid}
        AND prev_hash IS NOT NULL
        AND prev_hash NOT IN (
          SELECT chain_hash FROM interactions WHERE user_id = ${uid}
        )
    `),
    // Fork: more than one of the user's receipts sharing the same non-null prevHash
    db.execute<{ forks: string }>(sql`
      SELECT COUNT(*) AS forks
      FROM (
        SELECT prev_hash
        FROM interactions
        WHERE user_id = ${uid}
          AND prev_hash IS NOT NULL
        GROUP BY prev_hash
        HAVING COUNT(*) > 1
      ) dup
    `),
    // Genesis count: exactly one of the user's receipts should have NULL prevHash
    db.execute<{ genesis_count: string }>(sql`
      SELECT COUNT(*) AS genesis_count
      FROM interactions
      WHERE user_id = ${uid}
        AND prev_hash IS NULL
    `),
  ]);

  const brokenLinks = Number((brokenLinksResult.rows[0] as { broken: string } | undefined)?.broken ?? 0);
  const forks = Number((forksResult.rows[0] as { forks: string } | undefined)?.forks ?? 0);
  const genesisCount = Number((genesisResult.rows[0] as { genesis_count: string } | undefined)?.genesis_count ?? 0);

  const intact = brokenLinks === 0 && forks === 0 && genesisCount <= 1;

  return { brokenLinks, forks, genesisCount, intact };
}

router.get("/interactions", requireAuth, async (req, res) => {
  const query = ListInteractionsQueryParams.parse(req.query);
  const conditions: ReturnType<typeof eq>[] = [];

  // Scope reads to the authenticated user's own receipts
  conditions.push(eq(interactionsTable.userId, userId(req)));

  if (query.model) conditions.push(eq(interactionsTable.model, query.model));
  if (query.policyStatus) conditions.push(eq(interactionsTable.policyStatus, query.policyStatus));

  const where = and(...conditions);

  // Zod coerces query strings to numbers but does not enforce integers.
  // Math.trunc() ensures PostgreSQL receives an integer LIMIT/OFFSET value;
  // a float such as 50.5 would cause a DB error without this guard.
  // The Zod schema already caps limit ≤ 200 and offset ≤ 100 000.
  const safeLimit = Math.trunc(query.limit);
  const safeOffset = Math.trunc(query.offset);

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(interactionsTable)
      .where(where)
      .orderBy(desc(interactionsTable.createdAt))
      .limit(safeLimit)
      .offset(safeOffset),
    db.select({ count: count() }).from(interactionsTable).where(where),
  ]);

  res.json({
    items: items.map(toInteractionDto),
    total: Number(totalResult[0]?.count ?? 0),
    limit: safeLimit,
    offset: safeOffset,
  });
});

router.post("/interactions", requireAuth, mintRateLimiter, async (req, res) => {
  const body = CreateInteractionBody.parse(req.body);

  // userId always comes from the authenticated session, never from the request body.
  // requireAuth guarantees req.user is set before this handler is reached.
  const uid = userId(req);

  // Evaluate policies before the locked transaction (read-only, no chain state needed).
  // Safety: evalPolicyRule executes rules in a vm.Script sandbox with a prototype-less
  // frozen context, dangerous built-ins (Function/eval/globalThis) nulled out, and a
  // hard 500ms timeout. Node.js globals (process, require) are not propagated into the
  // vm context. Rules were validated by validatePolicyRule() at storage time so
  // structurally dangerous expressions are rejected before they ever reach this path.
  const policies = await db
    .select()
    .from(policiesTable)
    .where(eq(policiesTable.enabled, 1));

  // Run each policy rule exactly once and cache results keyed by policy.id.
  // The same map is reused below for violation-count increments so we never
  // run evalPolicyRule twice per mint (avoids double CPU cost + divergence risk).
  const evalResults = new Map<string, { passed: boolean; error: string | null }>();
  for (const policy of policies) {
    evalResults.set(
      policy.id,
      evalPolicyRule(policy.rule, {
        prompt: body.prompt,
        response: body.response,
        model: body.model,
        userId: uid,
      }),
    );
  }

  const violations: string[] = [];
  let policyEvalError = false;
  for (const policy of policies) {
    const { passed, error } = evalResults.get(policy.id)!;
    if (error) {
      // Rule evaluation failed — surface as "error" status rather than silently
      // treating as a pass. The route continues (fail-open) so one broken policy
      // rule doesn't block all minting for the user.
      policyEvalError = true;
      req.log.warn({ policyId: policy.id, policyName: policy.name, error }, "Policy evaluation error");
    } else if (!passed) {
      // Intentionally omit policy.rule from the violation string.
      // Exposing the rule expression would let users reverse-engineer governance
      // logic and craft prompts to evade future policy checks. Policy rules are
      // admin-only data (protected by requireAdminAuth on policy CRUD endpoints).
      // The severity label and policy name are sufficient for audit purposes.
      violations.push(`[${policy.severity.toUpperCase()}] ${policy.name}`);
    }
  }

  // policyStatus priority: "error" > "fail" > "pass"
  const policyStatus: "pass" | "fail" | "error" = policyEvalError
    ? "error"
    : violations.length > 0
      ? "fail"
      : "pass";
  const id = generateId();
  const pHash = hashPrompt(body.prompt);
  const rHash = hashResponse(body.response);

  // Serialize chain appends with an advisory lock so concurrent inserts
  // cannot read the same prevHash and create a fork.
  const interaction = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_WRITE_LOCK_KEY})`);

    // Scope the latest chainHash to the current user so each user maintains
    // their own independent chain. Without this filter, receipts from different
    // users would interleave into a single global chain, causing per-user
    // integrity checks to report broken links for legitimate receipts.
    const [latest] = await tx
      .select({ chainHash: interactionsTable.chainHash })
      .from(interactionsTable)
      .where(eq(interactionsTable.userId, uid))
      .orderBy(desc(interactionsTable.createdAt))
      .limit(1);

    const prevHash = latest?.chainHash ?? null;
    const chainHash = buildChainHash(pHash, rHash, prevHash);

    const [inserted] = await tx
      .insert(interactionsTable)
      .values({
        id,
        prompt: body.prompt,
        response: body.response,
        model: body.model,
        userId: uid,
        tags: body.tags ?? [],
        promptHash: pHash,
        responseHash: rHash,
        prevHash,
        chainHash,
        policyStatus,
        policyViolations: violations,
        replayCount: 0,
      })
      .returning();

    return inserted;
  });

  // Update violation counts outside the lock window using cached eval results.
  // Reuses evalResults from the single evaluation pass above — no second vm.Script
  // execution per policy. Skip count update if evaluation errored to avoid
  // incrementing counts on broken rules (the "error" status is already on the receipt).
  for (const policy of policies) {
    const { passed, error } = evalResults.get(policy.id)!;
    if (!error && !passed) {
      await db
        .update(policiesTable)
        .set({ violationCount: sql`${policiesTable.violationCount} + 1` })
        .where(eq(policiesTable.id, policy.id));
    }
  }

  await insertActivityLog({
    type: "created",
    interactionId: id,
    summary: `Receipt minted: ${body.model} — ${body.prompt.slice(0, 60)}`,
  });

  res.status(201).json(toInteractionDto(interaction));
});

router.get("/interactions/:id", requireAuth, async (req, res) => {
  const { id } = GetInteractionParams.parse(req.params);
  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Access control: users can only access their own receipts
  if (interaction.userId !== userId(req)) {
    res.status(403).json({ error: "Forbidden: this receipt belongs to another user" });
    return;
  }

  res.json(toInteractionDto(interaction));
});

router.get("/interactions/:id/verify", requireAuth, async (req, res) => {
  const { id } = VerifyInteractionParams.parse(req.params);
  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Access control: users can only access their own receipts
  if (interaction.userId !== userId(req)) {
    res.status(403).json({ error: "Forbidden: this receipt belongs to another user" });
    return;
  }

  // 1. Verify the receipt's own content hashes
  const promptHashMatch = hashPrompt(interaction.prompt) === interaction.promptHash;
  const responseHashMatch = hashResponse(interaction.response) === interaction.responseHash;

  // 2. Verify the receipt's own chainHash is correctly computed from its stored fields
  const expectedChainHash = buildChainHash(interaction.promptHash, interaction.responseHash, interaction.prevHash ?? null);
  const chainHashSelfConsistent = expectedChainHash === interaction.chainHash;

  // 3. Verify the predecessor exists in the chain (detects orphaned receipts).
  //    Scoped to the receipt owner's userId: without this filter, a cross-user
  //    chainHash collision (two users with the same genesis content produce the
  //    same chainHash) could cause a different user's receipt to satisfy the
  //    predecessor check, masking a genuinely orphaned link.
  let predecessorExists = true;
  if (interaction.prevHash !== null) {
    const [pred] = await db
      .select({ id: interactionsTable.id })
      .from(interactionsTable)
      .where(
        and(
          eq(interactionsTable.chainHash, interaction.prevHash),
          eq(interactionsTable.userId, interaction.userId),
        ),
      )
      .limit(1);
    predecessorExists = pred !== undefined;
  }

  // 4. Walk the full ancestry using a recursive CTE to detect any fork in the lineage.
  //    For each ancestor, we check whether more than one receipt claims that ancestor
  //    as its predecessor — if so, this receipt is a descendant of a fork.
  //    Both the recursive join and the fork-detection subquery are scoped to
  //    interaction.userId so the ancestry walk stays within the owner's chain and
  //    cross-user receipts with colliding hashes don't pollute the lineage or
  //    trigger false-positive fork detections.
  //
  //    Depth limit: the CTE tracks a `depth` counter and stops recursing when
  //    depth >= CHAIN_VERIFY_DEPTH_LIMIT (default 10 000). If the result set
  //    contains any row at the depth limit AND that row still has a prev_hash,
  //    the walk was truncated — return 422 to signal the caller.
  const lineageForkResult = await db.execute<{ fork_in_lineage: string; max_depth: string }>(sql`
    WITH RECURSIVE ancestry AS (
      SELECT id, chain_hash, prev_hash, 0 AS depth
      FROM interactions
      WHERE id = ${id}
      UNION ALL
      SELECT i.id, i.chain_hash, i.prev_hash, a.depth + 1
      FROM interactions i
      JOIN ancestry a ON i.chain_hash = a.prev_hash
      WHERE a.prev_hash IS NOT NULL
        AND i.user_id = ${interaction.userId}
        AND a.depth < ${CHAIN_VERIFY_DEPTH_LIMIT}
    )
    SELECT
      COUNT(*) FILTER (WHERE (
        SELECT COUNT(*) FROM interactions
        WHERE prev_hash = ancestry.chain_hash
          AND user_id = ${interaction.userId}
      ) > 1) AS fork_in_lineage,
      MAX(depth) AS max_depth
    FROM ancestry
  `);

  const maxDepth = Number((lineageForkResult.rows[0] as { fork_in_lineage: string; max_depth: string } | undefined)?.max_depth ?? 0);
  if (maxDepth >= CHAIN_VERIFY_DEPTH_LIMIT) {
    res.status(422).json({
      error: `Chain ancestry exceeds the depth limit of ${CHAIN_VERIFY_DEPTH_LIMIT}. Use the chain health endpoint for bulk verification of very long chains.`,
    });
    return;
  }
  const lineageForked = Number((lineageForkResult.rows[0] as { fork_in_lineage: string } | undefined)?.fork_in_lineage ?? 0) > 0;

  // 5. Per-user genesis uniqueness: a valid per-user chain has exactly one genesis entry
  //    (prev_hash IS NULL) owned by the receipt's user. Multiple genesis nodes in the same
  //    user's chain corrupt their chain root. Scoping to interaction.userId avoids false
  //    positives when other users each legitimately have their own genesis receipt.
  const genesisResult = await db.execute<{ genesis_count: string }>(sql`
    SELECT COUNT(*) AS genesis_count FROM interactions
    WHERE prev_hash IS NULL AND user_id = ${interaction.userId}
  `);
  const genesisCount = Number((genesisResult.rows[0] as { genesis_count: string } | undefined)?.genesis_count ?? 0);
  const multipleGenesisNodes = genesisCount > 1;

  const chainIntact = chainHashSelfConsistent && predecessorExists && !lineageForked && !multipleGenesisNodes;
  const valid = promptHashMatch && responseHashMatch && chainIntact;

  const failReasons: string[] = [];
  if (!promptHashMatch) failReasons.push("prompt hash mismatch");
  if (!responseHashMatch) failReasons.push("response hash mismatch");
  if (!chainHashSelfConsistent) failReasons.push("chain hash mismatch");
  if (!predecessorExists) failReasons.push("predecessor receipt not found (orphaned)");
  if (lineageForked) failReasons.push("fork detected in ancestry: this receipt descends from a split chain");
  if (multipleGenesisNodes) failReasons.push("multiple genesis entries: chain root is ambiguous");

  await insertActivityLog({
    type: "verified",
    interactionId: id,
    summary: `Receipt verified: ${valid ? "PASS" : "FAIL"} — ${id.slice(0, 16)}`,
  });

  res.json({
    id,
    valid,
    promptHashMatch,
    responseHashMatch,
    chainIntact,
    details: valid
      ? "All cryptographic checks passed. Receipt is authentic and chain is intact."
      : `Verification failed: ${failReasons.join("; ")}`,
    checkedAt: new Date().toISOString(),
  });
});

/**
 * POST /interactions/:id/share-token
 *
 * Authenticated, owner-only. Generates a short-lived random share token that
 * allows anyone (no account required) to view this receipt's verification result
 * via GET /verify/:id?token=... .
 *
 * The raw token is returned to the caller; the DB stores only SHA-256(rawToken).
 * Expiry defaults to SHARE_TOKEN_EXPIRY_DAYS (7) days from now.
 */
router.post("/interactions/:id/share-token", requireAuth, async (req, res) => {
  const { id } = GetInteractionParams.parse(req.params);
  const uid = userId(req);

  const [interaction] = await db
    .select({ id: interactionsTable.id, userId: interactionsTable.userId })
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (interaction.userId !== uid) {
    res.status(403).json({ error: "Forbidden: this receipt belongs to another user" });
    return;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashShareToken(rawToken);
  const tokenId = generateId();
  const expiresAt = new Date(Date.now() + SHARE_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(shareTokensTable).values({
    id: tokenId,
    interactionId: id,
    userId: uid,
    tokenHash,
    expiresAt,
  });

  // Build the canonical public URL. The /api prefix is the API base path; the
  // public verify page is served by the web app at /verify/:id, not /api/verify/:id.
  // We return the raw token so the client can construct or display the URL.
  const origin = `${req.protocol}://${req.get("host") ?? ""}`;
  // Strip /api suffix that's present when accessed through the proxy
  const base = origin.replace(/\/api\/?$/, "");
  const verifyUrl = `${base}/verify/${id}?token=${rawToken}`;

  res.status(201).json({
    token: rawToken,
    verifyUrl,
    expiresAt: expiresAt.toISOString(),
  });
});

/**
 * GET /verify/:id?token=TOKEN
 *
 * Public endpoint — no auth required. Validates the share token, then runs the
 * same verification checks as the authenticated /interactions/:id/verify endpoint.
 * Prompt and response are omitted when ?redact=1 is passed.
 *
 * Security:
 *   - Token is looked up by SHA-256 hash to prevent timing leaks from partial matches.
 *   - Expired tokens return 401 (not 403) to avoid leaking existence of the receipt.
 *   - The interaction lookup is scoped to the userId stored on the token row so a
 *     token minted for receipt A cannot be reused to access receipt B.
 */
router.get("/verify/:id", async (req, res) => {
  const { id } = GetInteractionParams.parse(req.params);
  const rawToken = typeof req.query["token"] === "string" ? req.query["token"] : null;
  const redact = req.query["redact"] === "1";

  if (!rawToken) {
    res.status(401).json({ error: "Missing share token. Pass ?token=TOKEN in the URL." });
    return;
  }

  const tokenHash = hashShareToken(rawToken);
  const now = new Date();

  const [tokenRow] = await db
    .select()
    .from(shareTokensTable)
    .where(
      and(
        eq(shareTokensTable.interactionId, id),
        eq(shareTokensTable.tokenHash, tokenHash),
      ),
    )
    .limit(1);

  if (!tokenRow || tokenRow.expiresAt < now) {
    res.status(401).json({ error: "Share token is invalid or has expired." });
    return;
  }

  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(
      and(
        eq(interactionsTable.id, id),
        eq(interactionsTable.userId, tokenRow.userId),
      ),
    );

  if (!interaction) {
    res.status(404).json({ error: "Receipt not found." });
    return;
  }

  // Run the same verification checks as the authenticated endpoint
  const promptHashMatch = hashPrompt(interaction.prompt) === interaction.promptHash;
  const responseHashMatch = hashResponse(interaction.response) === interaction.responseHash;
  const expectedChainHash = buildChainHash(interaction.promptHash, interaction.responseHash, interaction.prevHash ?? null);
  const chainHashSelfConsistent = expectedChainHash === interaction.chainHash;

  let predecessorExists = true;
  if (interaction.prevHash !== null) {
    const [pred] = await db
      .select({ id: interactionsTable.id })
      .from(interactionsTable)
      .where(
        and(
          eq(interactionsTable.chainHash, interaction.prevHash),
          eq(interactionsTable.userId, interaction.userId),
        ),
      )
      .limit(1);
    predecessorExists = pred !== undefined;
  }

  // Depth-limited recursive CTE for fork detection
  const lineageForkResult = await db.execute<{ fork_in_lineage: string; max_depth: string }>(sql`
    WITH RECURSIVE ancestry AS (
      SELECT id, chain_hash, prev_hash, 0 AS depth
      FROM interactions
      WHERE id = ${id}
      UNION ALL
      SELECT i.id, i.chain_hash, i.prev_hash, a.depth + 1
      FROM interactions i
      JOIN ancestry a ON i.chain_hash = a.prev_hash
      WHERE a.prev_hash IS NOT NULL
        AND i.user_id = ${interaction.userId}
        AND a.depth < ${CHAIN_VERIFY_DEPTH_LIMIT}
    )
    SELECT
      COUNT(*) FILTER (WHERE (
        SELECT COUNT(*) FROM interactions
        WHERE prev_hash = ancestry.chain_hash
          AND user_id = ${interaction.userId}
      ) > 1) AS fork_in_lineage,
      MAX(depth) AS max_depth
    FROM ancestry
  `);

  const maxDepth = Number((lineageForkResult.rows[0] as { fork_in_lineage: string; max_depth: string } | undefined)?.max_depth ?? 0);
  if (maxDepth >= CHAIN_VERIFY_DEPTH_LIMIT) {
    res.status(422).json({
      error: `Chain ancestry exceeds the depth limit of ${CHAIN_VERIFY_DEPTH_LIMIT}.`,
    });
    return;
  }

  const lineageForked = Number((lineageForkResult.rows[0] as { fork_in_lineage: string } | undefined)?.fork_in_lineage ?? 0) > 0;

  const genesisResult = await db.execute<{ genesis_count: string }>(sql`
    SELECT COUNT(*) AS genesis_count FROM interactions
    WHERE prev_hash IS NULL AND user_id = ${interaction.userId}
  `);
  const genesisCount = Number((genesisResult.rows[0] as { genesis_count: string } | undefined)?.genesis_count ?? 0);
  const multipleGenesisNodes = genesisCount > 1;

  const chainIntact = chainHashSelfConsistent && predecessorExists && !lineageForked && !multipleGenesisNodes;
  const valid = promptHashMatch && responseHashMatch && chainIntact;

  const failReasons: string[] = [];
  if (!promptHashMatch) failReasons.push("prompt hash mismatch");
  if (!responseHashMatch) failReasons.push("response hash mismatch");
  if (!chainHashSelfConsistent) failReasons.push("chain hash mismatch");
  if (!predecessorExists) failReasons.push("predecessor receipt not found (orphaned)");
  if (lineageForked) failReasons.push("fork detected in ancestry");
  if (multipleGenesisNodes) failReasons.push("multiple genesis entries");

  res.json({
    id,
    model: interaction.model,
    createdAt: interaction.createdAt.toISOString(),
    prompt: redact ? null : interaction.prompt,
    response: redact ? null : interaction.response,
    redacted: redact,
    promptHash: interaction.promptHash,
    responseHash: interaction.responseHash,
    chainHash: interaction.chainHash,
    prevHash: interaction.prevHash ?? null,
    policyStatus: interaction.policyStatus,
    valid,
    promptHashMatch,
    responseHashMatch,
    chainIntact,
    details: valid
      ? "All cryptographic checks passed. Receipt is authentic and chain is intact."
      : `Verification failed: ${failReasons.join("; ")}`,
    checkedAt: new Date().toISOString(),
  });
});

router.post("/interactions/:id/replay", requireAuth, async (req, res) => {
  const { id } = ReplayInteractionParams.parse(req.params);
  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Access control: users can only access their own receipts
  if (interaction.userId !== userId(req)) {
    res.status(403).json({ error: "Forbidden: this receipt belongs to another user" });
    return;
  }

  const simulatedReplay = interaction.response + "\n\n[REPLAYED — same model, same prompt, same seed conditions]";

  const originalLines = interaction.response.split("\n");
  const replayedLines = simulatedReplay.split("\n");
  const diffLines: string[] = [];
  const maxLen = Math.max(originalLines.length, replayedLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (originalLines[i] !== replayedLines[i]) {
      if (originalLines[i]) diffLines.push(`- ${originalLines[i]}`);
      if (replayedLines[i]) diffLines.push(`+ ${replayedLines[i]}`);
    }
  }
  const outputDiff = diffLines.join("\n") || "(no difference)";
  const semanticMatch = interaction.response === simulatedReplay;

  await db
    .update(interactionsTable)
    .set({ replayCount: sql`${interactionsTable.replayCount} + 1` })
    .where(eq(interactionsTable.id, id));

  const pHash = hashPrompt(interaction.prompt);
  const rHash = hashResponse(simulatedReplay);
  const newId = generateId();

  // Serialize the replay receipt append the same way as regular receipts
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_WRITE_LOCK_KEY})`);

    // Scope to the receipt owner's chain (same user as the original interaction)
    // to maintain per-user chain integrity.
    const [latest] = await tx
      .select({ chainHash: interactionsTable.chainHash })
      .from(interactionsTable)
      .where(eq(interactionsTable.userId, interaction.userId))
      .orderBy(desc(interactionsTable.createdAt))
      .limit(1);

    const prevHash = latest?.chainHash ?? null;
    const chainHash = buildChainHash(pHash, rHash, prevHash);

    await tx.insert(interactionsTable).values({
      id: newId,
      prompt: interaction.prompt,
      response: simulatedReplay,
      model: interaction.model,
      userId: interaction.userId,
      tags: [...(interaction.tags ?? []), "replay"],
      promptHash: pHash,
      responseHash: rHash,
      prevHash,
      chainHash,
      policyStatus: "pending",
      policyViolations: [],
      replayCount: 0,
    });
  });

  await insertActivityLog({
    type: "replayed",
    interactionId: id,
    summary: `Replayed: ${id.slice(0, 16)} → new receipt ${newId.slice(0, 16)}`,
  });

  res.json({
    originalId: id,
    originalResponse: interaction.response,
    replayedResponse: simulatedReplay,
    outputDiff,
    semanticMatch,
    replayedAt: new Date().toISOString(),
    newReceiptId: newId,
  });
});

/**
 * GET /chain/health
 *
 * Authenticated. Walks ALL of the user's receipts in chronological order
 * (oldest-first), re-derives each hash, and verifies that each receipt's
 * prevHash equals the preceding receipt's chainHash. Returns a summary:
 *   total      — number of receipts examined
 *   valid      — number that passed all hash checks
 *   firstFailedId — ID of the first failing receipt (null if all pass)
 *   capped     — true when the scan stopped at CHAIN_HEALTH_ROW_CAP
 *   elapsedMs  — wall-clock time the scan took
 *
 * Resource exhaustion protection:
 *   - Capped at CHAIN_HEALTH_ROW_CAP rows (default 50 000).
 *   - Returns capped:true when the limit is hit so the caller knows the result
 *     is not a full chain scan.
 */
router.get("/chain/health", requireAuth, async (req, res) => {
  const uid = userId(req);
  const startMs = Date.now();

  const rows = await db
    .select({
      id: interactionsTable.id,
      prompt: interactionsTable.prompt,
      response: interactionsTable.response,
      promptHash: interactionsTable.promptHash,
      responseHash: interactionsTable.responseHash,
      prevHash: interactionsTable.prevHash,
      chainHash: interactionsTable.chainHash,
    })
    .from(interactionsTable)
    .where(eq(interactionsTable.userId, uid))
    .orderBy(asc(interactionsTable.createdAt))
    .limit(CHAIN_HEALTH_ROW_CAP + 1); // fetch one extra to detect capping

  const capped = rows.length > CHAIN_HEALTH_ROW_CAP;
  const receipts = capped ? rows.slice(0, CHAIN_HEALTH_ROW_CAP) : rows;

  let validCount = 0;
  let firstFailedId: string | null = null;
  let prevChainHash: string | null = null; // chain hash of the previous receipt in the walk

  for (const row of receipts) {
    const promptOk = hashPrompt(row.prompt) === row.promptHash;
    const responseOk = hashResponse(row.response) === row.responseHash;
    const selfOk = buildChainHash(row.promptHash, row.responseHash, row.prevHash ?? null) === row.chainHash;
    // Linkage check: if this is not the genesis receipt, its prevHash must equal
    // the chainHash of the immediately preceding receipt in the walk order.
    const linkageOk = prevChainHash === null
      ? row.prevHash === null   // first receipt must be genesis
      : row.prevHash === prevChainHash;

    if (promptOk && responseOk && selfOk && linkageOk) {
      validCount++;
    } else if (firstFailedId === null) {
      firstFailedId = row.id;
    }

    prevChainHash = row.chainHash;
  }

  res.json({
    total: receipts.length,
    valid: validCount,
    firstFailedId,
    capped,
    elapsedMs: Date.now() - startMs,
  });
});

router.get("/chain", requireAuth, async (req, res) => {
  const uid = userId(req);

  const [totalCountResult, chainStatus] = await Promise.all([
    db.select({ cnt: count() }).from(interactionsTable).where(eq(interactionsTable.userId, uid)),
    userChainIntegrityCheck(uid),
  ]);

  const totalCount = Number(totalCountResult[0]?.cnt ?? 0);

  // Return most recent 100 of the caller's own entries — integrity is verified over the full chain above
  const entries = await db
    .select({
      id: interactionsTable.id,
      chainHash: interactionsTable.chainHash,
      prevHash: interactionsTable.prevHash,
      createdAt: interactionsTable.createdAt,
    })
    .from(interactionsTable)
    .where(eq(interactionsTable.userId, uid))
    .orderBy(desc(interactionsTable.createdAt))
    .limit(100);

  const headHash = entries[0]?.chainHash ?? "";
  const tailHash = entries[entries.length - 1]?.chainHash ?? null;

  res.json({
    length: totalCount,
    headHash,
    tailHash,
    intact: chainStatus.intact,
    forkCount: chainStatus.forks,
    brokenLinkCount: chainStatus.brokenLinks,
    genesisCount: chainStatus.genesisCount,
    entries: entries.map((e) => ({
      id: e.id,
      chainHash: e.chainHash,
      prevHash: e.prevHash ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

/**
 * GET /stats
 *
 * Resource exhaustion mitigations applied to this aggregation-heavy route:
 *
 * Rate limit  : 60 req/min/IP (heavy-read limiter in app.ts) — prevents
 *               flooding this endpoint to drive expensive DB aggregations.
 *
 * User scoping: All five parallel COUNT queries and both sequential queries
 *               are filtered by userId so that one user cannot trigger
 *               aggregations over another user's (potentially larger) dataset.
 *
 * COUNT(*) safety: COUNT(*) is a streaming aggregate; PostgreSQL does not
 *               materialise the full result set in memory.  No row limit is
 *               needed for count-only queries.
 *
 * modelsUsed cap: .limit(200) — caps the SELECT DISTINCT model scan to at
 *               most 200 rows.  Without this cap, a user with many distinct
 *               models could force the DB to scan a large index range and
 *               return a large JSON array.
 *
 * recentActivity cap: .limit(10) — caps the activity_log JOIN to 10 rows.
 */
router.get("/stats", requireAuth, async (req, res) => {
  const uid = userId(req);

  const [totalResult, policyPassResult, policyFailResult, replayResult, chainStatus] = await Promise.all([
    db.select({ count: count() }).from(interactionsTable).where(eq(interactionsTable.userId, uid)),
    db.select({ count: count() }).from(interactionsTable).where(and(eq(interactionsTable.userId, uid), eq(interactionsTable.policyStatus, "pass"))),
    db.select({ count: count() }).from(interactionsTable).where(and(eq(interactionsTable.userId, uid), eq(interactionsTable.policyStatus, "fail"))),
    db.select({ count: sql<number>`sum(${interactionsTable.replayCount})` }).from(interactionsTable).where(eq(interactionsTable.userId, uid)),
    userChainIntegrityCheck(uid),
  ]);

  // Resource exhaustion cap: .limit(200) prevents a SELECT DISTINCT from
  // scanning the entire model column index for users with many distinct models.
  const modelsResult = await db
    .selectDistinct({ model: interactionsTable.model })
    .from(interactionsTable)
    .where(eq(interactionsTable.userId, uid))
    .limit(200);

  // Filter recent activity to the caller's own receipts by joining through the interactions table.
  // activity_log has no owner column; ownership is inferred from the linked interaction's userId.
  // Resource exhaustion cap: .limit(10) — only the 10 most recent entries are returned.
  const recentActivity = await db
    .select({
      id: activityLogTable.id,
      type: activityLogTable.type,
      interactionId: activityLogTable.interactionId,
      summary: activityLogTable.summary,
      createdAt: activityLogTable.createdAt,
    })
    .from(activityLogTable)
    .innerJoin(interactionsTable, eq(activityLogTable.interactionId, interactionsTable.id))
    .where(eq(interactionsTable.userId, uid))
    .orderBy(desc(activityLogTable.createdAt))
    .limit(10);

  const totalCount = Number(totalResult[0]?.count ?? 0);

  res.json({
    totalInteractions: totalCount,
    verifiedCount: totalCount,
    policyPassCount: Number(policyPassResult[0]?.count ?? 0),
    policyFailCount: Number(policyFailResult[0]?.count ?? 0),
    replayCount: Number(replayResult[0]?.count ?? 0),
    modelsUsed: modelsResult.map((r) => r.model),
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      type: a.type,
      interactionId: a.interactionId,
      summary: a.summary,
      createdAt: a.createdAt.toISOString(),
    })),
    chainLength: totalCount,
    chainIntact: chainStatus.intact,
  });
});

function toInteractionDto(i: typeof interactionsTable.$inferSelect) {
  return {
    id: i.id,
    prompt: i.prompt,
    response: i.response,
    model: i.model,
    userId: i.userId,
    tags: i.tags ?? [],
    promptHash: i.promptHash,
    responseHash: i.responseHash,
    prevHash: i.prevHash ?? null,
    chainHash: i.chainHash,
    policyStatus: i.policyStatus,
    policyViolations: i.policyViolations ?? [],
    createdAt: i.createdAt.toISOString(),
    replayCount: i.replayCount,
  };
}

export default router;

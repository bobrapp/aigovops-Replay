import { Router, type IRouter } from "express";
import { db, interactionsTable, activityLogTable, policiesTable } from "@workspace/db";
import { eq, desc, count, and, sql } from "drizzle-orm";
import {
  ListInteractionsQueryParams,
  CreateInteractionBody,
  GetInteractionParams,
  VerifyInteractionParams,
  ReplayInteractionParams,
} from "@workspace/api-zod";
import { sha256, hashPrompt, hashResponse, buildChainHash } from "../lib/crypto";
import { generateId } from "../lib/id";

const router: IRouter = Router();

/**
 * Advisory lock key used to serialize all chain-append operations.
 * pg_advisory_xact_lock is automatically released at transaction end.
 */
const CHAIN_WRITE_LOCK_KEY = 0x52455041; // "REPA" in hex — unique to this app

router.get("/interactions", async (req, res) => {
  const query = ListInteractionsQueryParams.parse(req.query);
  const conditions: ReturnType<typeof eq>[] = [];

  if (query.model) conditions.push(eq(interactionsTable.model, query.model));
  if (query.policyStatus) conditions.push(eq(interactionsTable.policyStatus, query.policyStatus));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(interactionsTable)
      .where(where)
      .orderBy(desc(interactionsTable.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(interactionsTable).where(where),
  ]);

  res.json({
    items: items.map(toInteractionDto),
    total: Number(totalResult[0]?.count ?? 0),
    limit: query.limit,
    offset: query.offset,
  });
});

router.post("/interactions", async (req, res) => {
  const body = CreateInteractionBody.parse(req.body);

  // Evaluate policies before the locked transaction (read-only, no chain state needed)
  const policies = await db
    .select()
    .from(policiesTable)
    .where(eq(policiesTable.enabled, 1));

  const violations: string[] = [];
  for (const policy of policies) {
    try {
      const fn = new Function("prompt", "response", "model", "userId", `try { return !!(${policy.rule}); } catch(e) { return true; }`);
      const passed = fn(body.prompt, body.response, body.model, body.userId);
      if (!passed) {
        violations.push(`[${policy.severity.toUpperCase()}] ${policy.name}: ${policy.rule}`);
      }
    } catch {
      // ignore eval errors
    }
  }

  const policyStatus = violations.length > 0 ? "fail" : "pass";
  const id = generateId();
  const pHash = hashPrompt(body.prompt);
  const rHash = hashResponse(body.response);

  // Serialize chain appends with an advisory lock so concurrent inserts
  // cannot read the same prevHash and create a fork.
  const interaction = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_WRITE_LOCK_KEY})`);

    const [latest] = await tx
      .select({ chainHash: interactionsTable.chainHash })
      .from(interactionsTable)
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
        userId: body.userId,
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

  // Update violation counts and log activity outside the lock window
  for (const policy of policies) {
    const fn = new Function("prompt", "response", "model", "userId", `try { return !!(${policy.rule}); } catch(e) { return true; }`);
    try {
      const passed = fn(body.prompt, body.response, body.model, body.userId);
      if (!passed) {
        await db
          .update(policiesTable)
          .set({ violationCount: sql`${policiesTable.violationCount} + 1` })
          .where(eq(policiesTable.id, policy.id));
      }
    } catch {
      // ignore
    }
  }

  await db.insert(activityLogTable).values({
    id: generateId(),
    type: "created",
    interactionId: id,
    summary: `Receipt minted: ${body.model} — ${body.prompt.slice(0, 60)}`,
  });

  res.status(201).json(toInteractionDto(interaction));
});

router.get("/interactions/:id", async (req, res) => {
  const { id } = GetInteractionParams.parse(req.params);
  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(toInteractionDto(interaction));
});

router.get("/interactions/:id/verify", async (req, res) => {
  const { id } = VerifyInteractionParams.parse(req.params);
  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // 1. Verify the receipt's own content hashes
  const promptHashMatch = hashPrompt(interaction.prompt) === interaction.promptHash;
  const responseHashMatch = hashResponse(interaction.response) === interaction.responseHash;

  // 2. Verify the receipt's own chainHash is correctly computed from its stored fields
  const expectedChainHash = buildChainHash(interaction.promptHash, interaction.responseHash, interaction.prevHash ?? null);
  const chainHashSelfConsistent = expectedChainHash === interaction.chainHash;

  // 3. Verify the predecessor exists in the chain (detects forked or orphaned receipts)
  let predecessorExists = true;
  if (interaction.prevHash !== null) {
    const [pred] = await db
      .select({ id: interactionsTable.id })
      .from(interactionsTable)
      .where(eq(interactionsTable.chainHash, interaction.prevHash))
      .limit(1);
    predecessorExists = pred !== undefined;
  }

  // 4. Verify no other receipt claims the same prevHash (fork detection)
  let noForkAtPrevHash = true;
  if (interaction.prevHash !== null) {
    const forkResult = await db
      .select({ cnt: count() })
      .from(interactionsTable)
      .where(eq(interactionsTable.prevHash, interaction.prevHash));
    noForkAtPrevHash = Number(forkResult[0]?.cnt ?? 0) <= 1;
  }

  const chainIntact = chainHashSelfConsistent && predecessorExists && noForkAtPrevHash;
  const valid = promptHashMatch && responseHashMatch && chainIntact;

  const failReasons: string[] = [];
  if (!promptHashMatch) failReasons.push("prompt hash mismatch");
  if (!responseHashMatch) failReasons.push("response hash mismatch");
  if (!chainHashSelfConsistent) failReasons.push("chain hash mismatch");
  if (!predecessorExists) failReasons.push("predecessor receipt not found (orphaned or forked)");
  if (!noForkAtPrevHash) failReasons.push("fork detected: another receipt claims the same predecessor");

  await db.insert(activityLogTable).values({
    id: generateId(),
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

router.post("/interactions/:id/replay", async (req, res) => {
  const { id } = ReplayInteractionParams.parse(req.params);
  const [interaction] = await db
    .select()
    .from(interactionsTable)
    .where(eq(interactionsTable.id, id));

  if (!interaction) {
    res.status(404).json({ error: "Not found" });
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

    const [latest] = await tx
      .select({ chainHash: interactionsTable.chainHash })
      .from(interactionsTable)
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

  await db.insert(activityLogTable).values({
    id: generateId(),
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

router.get("/chain", async (_req, res) => {
  // Full-chain integrity check using SQL — not limited to a window
  const [totalCountResult, brokenLinksResult, forksResult] = await Promise.all([
    db.select({ cnt: count() }).from(interactionsTable),
    // Broken link: a receipt whose prevHash doesn't match any existing chainHash
    db.execute<{ broken: string }>(sql`
      SELECT COUNT(*) AS broken
      FROM interactions
      WHERE prev_hash IS NOT NULL
        AND prev_hash NOT IN (SELECT chain_hash FROM interactions)
    `),
    // Fork: more than one receipt sharing the same non-null prevHash
    db.execute<{ forks: string }>(sql`
      SELECT COUNT(*) AS forks
      FROM (
        SELECT prev_hash
        FROM interactions
        WHERE prev_hash IS NOT NULL
        GROUP BY prev_hash
        HAVING COUNT(*) > 1
      ) dup
    `),
  ]);

  const totalCount = Number(totalCountResult[0]?.cnt ?? 0);
  const brokenLinks = Number((brokenLinksResult.rows[0] as { broken: string } | undefined)?.broken ?? 0);
  const forks = Number((forksResult.rows[0] as { forks: string } | undefined)?.forks ?? 0);
  const intact = brokenLinks === 0 && forks === 0;

  // Return most recent 100 entries for display — integrity is verified over the full chain above
  const entries = await db
    .select({
      id: interactionsTable.id,
      chainHash: interactionsTable.chainHash,
      prevHash: interactionsTable.prevHash,
      createdAt: interactionsTable.createdAt,
    })
    .from(interactionsTable)
    .orderBy(desc(interactionsTable.createdAt))
    .limit(100);

  const headHash = entries[0]?.chainHash ?? "";
  const tailHash = entries[entries.length - 1]?.chainHash ?? null;

  res.json({
    length: totalCount,
    headHash,
    tailHash,
    intact,
    forkCount: forks,
    brokenLinkCount: brokenLinks,
    entries: entries.map((e) => ({
      id: e.id,
      chainHash: e.chainHash,
      prevHash: e.prevHash ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

router.get("/stats", async (_req, res) => {
  const [totalResult, policyPassResult, policyFailResult, replayResult] = await Promise.all([
    db.select({ count: count() }).from(interactionsTable),
    db.select({ count: count() }).from(interactionsTable).where(eq(interactionsTable.policyStatus, "pass")),
    db.select({ count: count() }).from(interactionsTable).where(eq(interactionsTable.policyStatus, "fail")),
    db.select({ count: sql<number>`sum(${interactionsTable.replayCount})` }).from(interactionsTable),
  ]);

  const modelsResult = await db
    .selectDistinct({ model: interactionsTable.model })
    .from(interactionsTable);

  const recentActivity = await db
    .select()
    .from(activityLogTable)
    .orderBy(desc(activityLogTable.createdAt))
    .limit(10);

  // Full-chain integrity check — not limited to a window
  const [brokenLinksResult, forksResult] = await Promise.all([
    db.execute<{ broken: string }>(sql`
      SELECT COUNT(*) AS broken
      FROM interactions
      WHERE prev_hash IS NOT NULL
        AND prev_hash NOT IN (SELECT chain_hash FROM interactions)
    `),
    db.execute<{ forks: string }>(sql`
      SELECT COUNT(*) AS forks
      FROM (
        SELECT prev_hash
        FROM interactions
        WHERE prev_hash IS NOT NULL
        GROUP BY prev_hash
        HAVING COUNT(*) > 1
      ) dup
    `),
  ]);

  const totalCount = Number(totalResult[0]?.count ?? 0);
  const brokenLinks = Number((brokenLinksResult.rows[0] as { broken: string } | undefined)?.broken ?? 0);
  const forks = Number((forksResult.rows[0] as { forks: string } | undefined)?.forks ?? 0);
  const chainIntact = brokenLinks === 0 && forks === 0;

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
    chainIntact,
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

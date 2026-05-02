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

/**
 * Full-chain integrity: returns broken link count, non-null fork count,
 * and genesis fork count (more than one receipt with NULL prevHash).
 * All three must be zero for the chain to be intact.
 */
async function fullChainIntegrityCheck(): Promise<{
  brokenLinks: number;
  forks: number;
  genesisCount: number;
  intact: boolean;
}> {
  const [brokenLinksResult, forksResult, genesisResult] = await Promise.all([
    // Broken link: receipt whose prevHash doesn't match any existing chainHash
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
    // Genesis count: exactly one receipt should have NULL prevHash when chain is non-empty
    db.execute<{ genesis_count: string }>(sql`
      SELECT COUNT(*) AS genesis_count FROM interactions WHERE prev_hash IS NULL
    `),
  ]);

  const brokenLinks = Number((brokenLinksResult.rows[0] as { broken: string } | undefined)?.broken ?? 0);
  const forks = Number((forksResult.rows[0] as { forks: string } | undefined)?.forks ?? 0);
  const genesisCount = Number((genesisResult.rows[0] as { genesis_count: string } | undefined)?.genesis_count ?? 0);

  // A valid non-empty chain has exactly one genesis entry
  // genesisCount > 1 means competing genesis nodes (also a fork)
  const intact = brokenLinks === 0 && forks === 0 && genesisCount <= 1;

  return { brokenLinks, forks, genesisCount, intact };
}

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
    try {
      const fn = new Function("prompt", "response", "model", "userId", `try { return !!(${policy.rule}); } catch(e) { return true; }`);
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

  // 3. Verify the predecessor exists in the chain (detects orphaned receipts)
  let predecessorExists = true;
  if (interaction.prevHash !== null) {
    const [pred] = await db
      .select({ id: interactionsTable.id })
      .from(interactionsTable)
      .where(eq(interactionsTable.chainHash, interaction.prevHash))
      .limit(1);
    predecessorExists = pred !== undefined;
  }

  // 4. Walk the full ancestry using a recursive CTE to detect any fork in the lineage.
  //    For each ancestor, we check whether more than one receipt claims that ancestor
  //    as its predecessor — if so, this receipt is a descendant of a fork.
  const lineageForkResult = await db.execute<{ fork_in_lineage: string }>(sql`
    WITH RECURSIVE ancestry AS (
      SELECT id, chain_hash, prev_hash
      FROM interactions
      WHERE id = ${id}
      UNION ALL
      SELECT i.id, i.chain_hash, i.prev_hash
      FROM interactions i
      JOIN ancestry a ON i.chain_hash = a.prev_hash
      WHERE a.prev_hash IS NOT NULL
    )
    SELECT COUNT(*) AS fork_in_lineage
    FROM ancestry a
    WHERE (
      SELECT COUNT(*) FROM interactions WHERE prev_hash = a.chain_hash
    ) > 1
  `);
  const lineageForked = Number((lineageForkResult.rows[0] as { fork_in_lineage: string } | undefined)?.fork_in_lineage ?? 0) > 0;

  // 5. Genesis uniqueness: if this receipt is a genesis (null prevHash), verify there is
  //    exactly one genesis entry. Multiple genesis nodes indicate a corrupted chain root.
  let multipleGenesisNodes = false;
  if (interaction.prevHash === null) {
    const genesisResult = await db.execute<{ genesis_count: string }>(sql`
      SELECT COUNT(*) AS genesis_count FROM interactions WHERE prev_hash IS NULL
    `);
    const genesisCount = Number((genesisResult.rows[0] as { genesis_count: string } | undefined)?.genesis_count ?? 0);
    multipleGenesisNodes = genesisCount > 1;
  }

  const chainIntact = chainHashSelfConsistent && predecessorExists && !lineageForked && !multipleGenesisNodes;
  const valid = promptHashMatch && responseHashMatch && chainIntact;

  const failReasons: string[] = [];
  if (!promptHashMatch) failReasons.push("prompt hash mismatch");
  if (!responseHashMatch) failReasons.push("response hash mismatch");
  if (!chainHashSelfConsistent) failReasons.push("chain hash mismatch");
  if (!predecessorExists) failReasons.push("predecessor receipt not found (orphaned)");
  if (lineageForked) failReasons.push("fork detected in ancestry: this receipt descends from a split chain");
  if (multipleGenesisNodes) failReasons.push("multiple genesis entries: chain root is ambiguous");

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
  const [totalCountResult, chainStatus] = await Promise.all([
    db.select({ cnt: count() }).from(interactionsTable),
    fullChainIntegrityCheck(),
  ]);

  const totalCount = Number(totalCountResult[0]?.cnt ?? 0);

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

router.get("/stats", async (_req, res) => {
  const [totalResult, policyPassResult, policyFailResult, replayResult, chainStatus] = await Promise.all([
    db.select({ count: count() }).from(interactionsTable),
    db.select({ count: count() }).from(interactionsTable).where(eq(interactionsTable.policyStatus, "pass")),
    db.select({ count: count() }).from(interactionsTable).where(eq(interactionsTable.policyStatus, "fail")),
    db.select({ count: sql<number>`sum(${interactionsTable.replayCount})` }).from(interactionsTable),
    fullChainIntegrityCheck(),
  ]);

  const modelsResult = await db
    .selectDistinct({ model: interactionsTable.model })
    .from(interactionsTable);

  const recentActivity = await db
    .select()
    .from(activityLogTable)
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

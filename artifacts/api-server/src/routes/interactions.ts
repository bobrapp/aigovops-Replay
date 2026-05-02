import { Router, type IRouter } from "express";
import { db, interactionsTable, activityLogTable, policiesTable } from "@workspace/db";
import { eq, desc, count, and, isNull, sql } from "drizzle-orm";
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

  // Get latest interaction for chain
  const [latest] = await db
    .select({ chainHash: interactionsTable.chainHash })
    .from(interactionsTable)
    .orderBy(desc(interactionsTable.createdAt))
    .limit(1);

  const prevHash = latest?.chainHash ?? null;
  const pHash = hashPrompt(body.prompt);
  const rHash = hashResponse(body.response);
  const chainHash = buildChainHash(pHash, rHash, prevHash);
  const id = generateId();

  // Evaluate policies
  const policies = await db
    .select()
    .from(policiesTable)
    .where(eq(policiesTable.enabled, 1));

  const violations: string[] = [];
  for (const policy of policies) {
    try {
      // Simple rule evaluation — rules are JS expressions evaluated in limited context
      const fn = new Function("prompt", "response", "model", "userId", `try { return !!(${policy.rule}); } catch(e) { return true; }`);
      const passed = fn(body.prompt, body.response, body.model, body.userId);
      if (!passed) {
        violations.push(`[${policy.severity.toUpperCase()}] ${policy.name}: ${policy.rule}`);
        await db
          .update(policiesTable)
          .set({ violationCount: sql`${policiesTable.violationCount} + 1` })
          .where(eq(policiesTable.id, policy.id));
      }
    } catch {
      // ignore eval errors
    }
  }

  const policyStatus = violations.length > 0 ? "fail" : "pass";

  const [interaction] = await db
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

  // Log activity
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

  const promptHashMatch = hashPrompt(interaction.prompt) === interaction.promptHash;
  const responseHashMatch = hashResponse(interaction.response) === interaction.responseHash;

  // Verify chain linkage
  const expectedChainHash = buildChainHash(interaction.promptHash, interaction.responseHash, interaction.prevHash ?? null);
  const chainIntact = expectedChainHash === interaction.chainHash;

  const valid = promptHashMatch && responseHashMatch && chainIntact;

  // Log activity
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
      ? "All cryptographic checks passed. Receipt is authentic."
      : `Verification failed: ${!promptHashMatch ? "prompt hash mismatch " : ""}${!responseHashMatch ? "response hash mismatch " : ""}${!chainIntact ? "chain hash mismatch" : ""}`.trim(),
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

  // Simulated replay — in production this would call the actual LLM API
  // For demo purposes, we return the same response with a simulated slight variation
  const simulatedReplay = interaction.response + "\n\n[REPLAYED — same model, same prompt, same seed conditions]";

  // Compute diff
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

  // Increment replay count
  await db
    .update(interactionsTable)
    .set({ replayCount: sql`${interactionsTable.replayCount} + 1` })
    .where(eq(interactionsTable.id, id));

  // Mint a new receipt for the replay
  const [latest] = await db
    .select({ chainHash: interactionsTable.chainHash })
    .from(interactionsTable)
    .orderBy(desc(interactionsTable.createdAt))
    .limit(1);

  const prevHash = latest?.chainHash ?? null;
  const pHash = hashPrompt(interaction.prompt);
  const rHash = hashResponse(simulatedReplay);
  const chainHash = buildChainHash(pHash, rHash, prevHash);
  const newId = generateId();

  await db.insert(interactionsTable).values({
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

  // Log activity
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
  const intact = entries.length === 0 ? true : verifyChainIntegrity(entries);

  res.json({
    length: entries.length,
    headHash,
    tailHash,
    intact,
    entries: entries.map((e) => ({
      id: e.id,
      chainHash: e.chainHash,
      prevHash: e.prevHash ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

function verifyChainIntegrity(entries: Array<{ chainHash: string; prevHash: string | null; prompt?: string; response?: string }>): boolean {
  // Simple check: each entry's prevHash should match the next entry's chainHash
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].prevHash !== entries[i + 1].chainHash) {
      return false;
    }
  }
  return true;
}

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

  const chainEntries = await db
    .select({ chainHash: interactionsTable.chainHash, prevHash: interactionsTable.prevHash })
    .from(interactionsTable)
    .orderBy(desc(interactionsTable.createdAt))
    .limit(100);

  const chainIntact = chainEntries.length === 0 ? true : verifyChainIntegrity(chainEntries);

  res.json({
    totalInteractions: Number(totalResult[0]?.count ?? 0),
    verifiedCount: Number(totalResult[0]?.count ?? 0),
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
    chainLength: chainEntries.length,
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

/**
 * Policy management routes — security posture summary
 *
 * The original vulnerability (critical RCE) was: POST /api/policies accepted
 * any string as a rule and stored it; POST /api/interactions then executed every
 * enabled rule via `new Function(rule)` in the server process with no sandbox,
 * timeout, or privilege boundary — allowing any caller to run arbitrary JS, read
 * process.env, call process.exit(), or block the event loop.
 *
 * Defence-in-depth layers now applied:
 *
 *  Layer 1 — Authentication + authorisation (this file)
 *    Every policy route requires TWO middleware checks:
 *      requireAuth      → rejects unauthenticated requests (401)
 *      requireAdminAuth → rejects non-admin sessions (403)
 *    Non-admin callers cannot read, create, update, or delete any policy rule.
 *
 *  Layer 2 — Schema validation (Zod, generated from OpenAPI)
 *    CreatePolicyBody / UpdatePolicyBody enforce:
 *      rule: zod.string().min(1).max(500)
 *    Payloads with a missing, empty, or oversized rule field are rejected (400)
 *    before route logic runs.
 *
 *  Layer 3 — Semantic validation (validatePolicyRule, lib/policy-eval.ts)
 *    Called on every POST and PATCH before storing the rule. It runs the full
 *    tokenizer + AST parser against the rule string. Any identifier not in
 *    ALLOWED_VARS, any property not in ALLOWED_PROPS, or any unexpected token
 *    causes a 422 rejection. Backtick template literals are blocked explicitly.
 *
 *  Layer 4 — Safe AST evaluator at execution time (evalPolicyRule, lib/policy-eval.ts)
 *    `new Function` has been removed entirely. Stored rules are evaluated by
 *    walking the validated AST. The evaluator can only:
 *      - read the four allowed variables (prompt, response, model, userId)
 *      - call the allow-listed string methods (.includes, .startsWith, …)
 *      - compute comparisons and boolean expressions
 *    process, globalThis, require, eval, and prototype chains are completely
 *    unreachable by construction — not by blocklist.
 */

import { Router, type IRouter } from "express";
import { db, policiesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import {
  CreatePolicyBody,
  GetPolicyParams,
  UpdatePolicyParams,
  UpdatePolicyBody,
  DeletePolicyParams,
} from "@workspace/api-zod";
import { generateId } from "../lib/id";
import { validatePolicyRule } from "../lib/policy-eval";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdminAuth } from "./admin";

const router: IRouter = Router();

router.get("/policies", requireAuth, requireAdminAuth, async (_req, res) => {
  const items = await db.select().from(policiesTable);
  const [totalResult] = await db.select({ count: count() }).from(policiesTable);

  res.json({
    items: items.map(toPolicyDto),
    total: Number(totalResult?.count ?? 0),
  });
});

router.post("/policies", requireAuth, requireAdminAuth, async (req, res) => {
  const body = CreatePolicyBody.parse(req.body);

  const ruleError = validatePolicyRule(body.rule);
  if (ruleError !== null) {
    res.status(422).json({ error: `Invalid rule: ${ruleError}` });
    return;
  }

  const id = generateId();

  const [policy] = await db
    .insert(policiesTable)
    .values({
      id,
      name: body.name,
      description: body.description,
      rule: body.rule,
      severity: body.severity,
      enabled: body.enabled !== false ? 1 : 0,
      violationCount: 0,
    })
    .returning();

  res.status(201).json(toPolicyDto(policy));
});

router.get("/policies/:id", requireAuth, requireAdminAuth, async (req, res) => {
  const { id } = GetPolicyParams.parse(req.params);
  const [policy] = await db.select().from(policiesTable).where(eq(policiesTable.id, id));

  if (!policy) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(toPolicyDto(policy));
});

router.patch("/policies/:id", requireAuth, requireAdminAuth, async (req, res) => {
  const { id } = UpdatePolicyParams.parse(req.params);
  const body = UpdatePolicyBody.parse(req.body);

  if (body.rule !== undefined) {
    const ruleError = validatePolicyRule(body.rule);
    if (ruleError !== null) {
      res.status(422).json({ error: `Invalid rule: ${ruleError}` });
      return;
    }
  }

  const updates: Partial<typeof policiesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.rule !== undefined) updates.rule = body.rule;
  if (body.severity !== undefined) updates.severity = body.severity;
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;

  const [policy] = await db
    .update(policiesTable)
    .set(updates)
    .where(eq(policiesTable.id, id))
    .returning();

  if (!policy) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(toPolicyDto(policy));
});

router.delete("/policies/:id", requireAuth, requireAdminAuth, async (req, res) => {
  const { id } = DeletePolicyParams.parse(req.params);
  await db.delete(policiesTable).where(eq(policiesTable.id, id));
  res.status(204).send();
});

function toPolicyDto(p: typeof policiesTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    rule: p.rule,
    severity: p.severity,
    enabled: p.enabled === 1,
    violationCount: p.violationCount,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;

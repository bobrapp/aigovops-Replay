import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
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

const router: IRouter = Router();

/**
 * Require a valid admin bearer token for policy-mutation endpoints.
 *
 * Token is read from the ADMIN_API_KEY environment variable and must be
 * supplied as `Authorization: Bearer <token>` in the request.
 *
 * This guard prevents unauthenticated callers from creating or modifying
 * policy rules, which are evaluated server-side against every new interaction.
 */
function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    res.status(503).json({
      error:
        "Policy management is not available: ADMIN_API_KEY is not configured on this server.",
    });
    return;
  }

  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token || token !== adminKey) {
    res.status(401).json({ error: "Unauthorized: a valid admin token is required." });
    return;
  }

  next();
}

router.get("/policies", async (_req, res) => {
  const items = await db.select().from(policiesTable);
  const [totalResult] = await db.select({ count: count() }).from(policiesTable);

  res.json({
    items: items.map(toPolicyDto),
    total: Number(totalResult?.count ?? 0),
  });
});

router.post("/policies", requireAdminAuth, async (req, res) => {
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

router.get("/policies/:id", async (req, res) => {
  const { id } = GetPolicyParams.parse(req.params);
  const [policy] = await db.select().from(policiesTable).where(eq(policiesTable.id, id));

  if (!policy) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(toPolicyDto(policy));
});

router.patch("/policies/:id", requireAdminAuth, async (req, res) => {
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

router.delete("/policies/:id", requireAdminAuth, async (req, res) => {
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

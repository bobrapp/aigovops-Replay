/**
 * webhooks.ts — CRUD endpoints for webhook endpoint configuration.
 *
 * All routes require user authentication and are scoped to the authenticated user.
 * Endpoints:
 *   GET  /webhooks                    — list user's webhook endpoints
 *   POST /webhooks                    — create a new endpoint (max 10 per user)
 *   PATCH /webhooks/:id               — update url/secret/enabled/eventFilter/emailAlerts/policyIds
 *   DELETE /webhooks/:id              — delete endpoint + all its delivery records
 *   POST /webhooks/:id/test           — fire a synthetic test webhook to the endpoint
 *   GET  /webhooks/:id/deliveries     — list recent deliveries for an endpoint (last 50)
 *
 * Security:
 *   - SSRF: URLs are validated against isUnsafeUrl() (async — includes DNS resolution)
 *     at creation, update, and test time to block DNS rebinding attacks.
 *   - Ownership: every mutating route verifies endpoint.userId === req.user.id.
 *   - Secrets are never returned in responses; hasSecret:boolean is sent instead.
 *   - Max 10 endpoints per user to prevent abuse.
 */

import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, webhookEndpointsTable, webhookDeliveriesTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import {
  isUnsafeUrl,
  signWebhookPayload,
  buildViolationPayload,
} from "../lib/webhook-worker";

const MAX_ENDPOINTS_PER_USER = 10;

// ── Input validation schemas ──────────────────────────────────────────────────

const PolicyIdsZ = z.array(z.string().min(1).max(200)).max(50).optional();

const CreateWebhookBodyZ = z.object({
  url: z.string().url("Must be a valid URL").max(2000),
  secret: z.string().max(256).optional(),
  eventFilter: z.enum(["all", "critical", "high_and_critical"]).default("all"),
  emailAlerts: z.boolean().default(false),
  policyIds: PolicyIdsZ,
});

const UpdateWebhookBodyZ = z.object({
  url: z.string().url().max(2000).optional(),
  secret: z.string().max(256).nullable().optional(),
  enabled: z.boolean().optional(),
  eventFilter: z.enum(["all", "critical", "high_and_critical"]).optional(),
  emailAlerts: z.boolean().optional(),
  policyIds: z.array(z.string().min(1).max(200)).max(50).nullable().optional(),
});

const WebhookIdZ = z.object({ id: z.string().min(1).max(200) });

// ── Helper ────────────────────────────────────────────────────────────────────

function userId(req: Express.Request): string {
  return (req as Express.Request & { user: NonNullable<Express.Request["user"]> }).user.id;
}

// ── Router ────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

// GET /webhooks — list user's webhook endpoints
router.get("/webhooks", requireAuth, async (req, res) => {
  const uid = userId(req);
  const items = await db
    .select()
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.userId, uid))
    .orderBy(desc(webhookEndpointsTable.createdAt));

  const [totalRow] = await db
    .select({ count: count() })
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.userId, uid));

  res.json({ items: items.map(toEndpointDto), total: Number(totalRow?.count ?? 0) });
});

// GET /webhooks/:id/deliveries — recent deliveries for an endpoint
router.get("/webhooks/:id/deliveries", requireAuth, async (req, res) => {
  const { id } = WebhookIdZ.parse(req.params);
  const uid = userId(req);

  const [endpoint] = await db
    .select({ id: webhookEndpointsTable.id, userId: webhookEndpointsTable.userId })
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.id, id))
    .limit(1);

  if (!endpoint) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (endpoint.userId !== uid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const deliveries = await db
    .select()
    .from(webhookDeliveriesTable)
    .where(eq(webhookDeliveriesTable.webhookEndpointId, id))
    .orderBy(desc(webhookDeliveriesTable.createdAt))
    .limit(50);

  res.json({ items: deliveries.map(toDeliveryDto) });
});

// POST /webhooks — create a new webhook endpoint
router.post("/webhooks", requireAuth, async (req, res) => {
  const uid = userId(req);
  let body: z.infer<typeof CreateWebhookBodyZ>;
  try {
    body = CreateWebhookBodyZ.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request body" });
    return;
  }

  if (await isUnsafeUrl(body.url)) {
    res.status(422).json({
      error: "URL must use http/https and must not point to private, loopback, or link-local addresses.",
    });
    return;
  }

  const [existingRow] = await db
    .select({ count: count() })
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.userId, uid));

  if (Number(existingRow?.count ?? 0) >= MAX_ENDPOINTS_PER_USER) {
    res.status(422).json({
      error: `You may configure at most ${MAX_ENDPOINTS_PER_USER} webhook endpoints.`,
    });
    return;
  }

  const id = generateId();
  const policyIdsJson =
    body.policyIds && body.policyIds.length > 0 ? JSON.stringify(body.policyIds) : null;

  const [created] = await db
    .insert(webhookEndpointsTable)
    .values({
      id,
      userId: uid,
      url: body.url,
      secret: body.secret ?? null,
      enabled: 1,
      eventFilter: body.eventFilter,
      emailAlerts: body.emailAlerts ? 1 : 0,
      policyIds: policyIdsJson,
    })
    .returning();

  logger.info({ userId: uid, endpointId: id }, "Webhook endpoint created");
  res.status(201).json(toEndpointDto(created!));
});

// PATCH /webhooks/:id — update fields on a webhook endpoint
router.patch("/webhooks/:id", requireAuth, async (req, res) => {
  const { id } = WebhookIdZ.parse(req.params);
  const uid = userId(req);

  let body: z.infer<typeof UpdateWebhookBodyZ>;
  try {
    body = UpdateWebhookBodyZ.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request body" });
    return;
  }

  const [endpoint] = await db
    .select()
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.id, id))
    .limit(1);

  if (!endpoint) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (endpoint.userId !== uid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (body.url !== undefined && await isUnsafeUrl(body.url)) {
    res.status(422).json({
      error: "URL must use http/https and must not point to private, loopback, or link-local addresses.",
    });
    return;
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.url !== undefined) patch["url"] = body.url;
  if (body.secret !== undefined) patch["secret"] = body.secret;
  if (body.enabled !== undefined) patch["enabled"] = body.enabled ? 1 : 0;
  if (body.eventFilter !== undefined) patch["eventFilter"] = body.eventFilter;
  if (body.emailAlerts !== undefined) patch["emailAlerts"] = body.emailAlerts ? 1 : 0;
  if (body.policyIds !== undefined) {
    patch["policyIds"] =
      body.policyIds === null || body.policyIds.length === 0
        ? null
        : JSON.stringify(body.policyIds);
  }

  const [updated] = await db
    .update(webhookEndpointsTable)
    .set(patch)
    .where(eq(webhookEndpointsTable.id, id))
    .returning();

  res.json(toEndpointDto(updated!));
});

// DELETE /webhooks/:id — delete endpoint and all its delivery records
router.delete("/webhooks/:id", requireAuth, async (req, res) => {
  const { id } = WebhookIdZ.parse(req.params);
  const uid = userId(req);

  const [endpoint] = await db
    .select({ id: webhookEndpointsTable.id, userId: webhookEndpointsTable.userId })
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.id, id))
    .limit(1);

  if (!endpoint) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (endpoint.userId !== uid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(webhookDeliveriesTable).where(eq(webhookDeliveriesTable.webhookEndpointId, id));
  await db.delete(webhookEndpointsTable).where(eq(webhookEndpointsTable.id, id));

  logger.info({ userId: uid, endpointId: id }, "Webhook endpoint deleted");
  res.status(204).end();
});

// POST /webhooks/:id/test — fire a synthetic test payload to the endpoint
router.post("/webhooks/:id/test", requireAuth, async (req, res) => {
  const { id } = WebhookIdZ.parse(req.params);
  const uid = userId(req);

  const [endpoint] = await db
    .select()
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.id, id))
    .limit(1);

  if (!endpoint) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (endpoint.userId !== uid) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (await isUnsafeUrl(endpoint.url)) {
    res.json({ ok: false, statusCode: null, error: "URL is private or unsafe — delivery blocked" });
    return;
  }

  const testPayload = {
    ...buildViolationPayload({
      receiptId: "test-00000000",
      violatedPolicies: [{ id: "test-policy-id", name: "Test Policy", severity: "high" }],
    }),
    summary: "Test webhook from AIGovOps REPLAY",
    test: true,
  };
  const payloadStr = JSON.stringify(testPayload);
  const signature = signWebhookPayload(payloadStr, endpoint.secret ?? null);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AIGovOps-Webhook/1.0",
    "X-AIGovOps-Test": "true",
  };
  if (signature) headers["X-AIGovOps-Signature"] = signature;

  let statusCode: number | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: payloadStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    statusCode = resp.status;
  } catch (err_) {
    error = err_ instanceof Error ? err_.message : "Request failed";
    logger.info({ endpointId: id, error }, "Test webhook delivery failed");
  }

  res.json({
    ok: statusCode !== null && statusCode >= 200 && statusCode < 300,
    statusCode,
    error,
  });
});

// ── DTO helpers ───────────────────────────────────────────────────────────────

function toEndpointDto(ep: typeof webhookEndpointsTable.$inferSelect) {
  const policyIds = ep.policyIds
    ? (JSON.parse(ep.policyIds) as string[])
    : null;
  return {
    id: ep.id,
    url: ep.url,
    hasSecret: ep.secret !== null && ep.secret.length > 0,
    enabled: ep.enabled === 1,
    eventFilter: ep.eventFilter,
    emailAlerts: ep.emailAlerts === 1,
    policyIds,
    createdAt: ep.createdAt.toISOString(),
    updatedAt: ep.updatedAt.toISOString(),
  };
}

function toDeliveryDto(d: typeof webhookDeliveriesTable.$inferSelect) {
  return {
    id: d.id,
    webhookEndpointId: d.webhookEndpointId,
    receiptId: d.receiptId,
    status: d.status,
    attempts: d.attempts,
    lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
    responseCode: d.responseCode,
    createdAt: d.createdAt.toISOString(),
  };
}

export default router;

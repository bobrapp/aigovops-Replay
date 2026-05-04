/**
 * webhook-worker.ts — In-process delivery loop for policy violation webhooks.
 *
 * Architecture:
 *   - startWebhookWorker() registers a setInterval that polls webhook_deliveries
 *     every WEBHOOK_POLL_INTERVAL_MS for pending rows with elapsed retry timers.
 *   - Each pending delivery: load endpoint config → sign payload → POST → update status.
 *   - Max MAX_WEBHOOK_ATTEMPTS (3) with exponential backoff: 5 s → 25 s → 125 s.
 *   - If the endpoint is disabled or deleted, the delivery is immediately failed.
 *
 * SSRF protection (exported so webhooks.ts can reuse at creation/update time):
 *   - Only http: and https: schemes are allowed.
 *   - Private RFC-1918, loopback, and link-local ranges are blocked by hostname pattern.
 *   - The resolved IP address is additionally checked via DNS lookup to prevent
 *     DNS rebinding attacks (public hostname → private IP).
 *   - Fetches are wrapped with a 10-second AbortController timeout.
 *
 * Email alerts (optional):
 *   - Activated only when SMTP_HOST env var is set.
 *   - Only fires for critical-severity violations on endpoints with emailAlerts=1.
 *   - Recipient address falls back to ALERT_EMAIL env var until per-endpoint
 *     email fields are added (see follow-up task #45).
 */

import { createHmac } from "node:crypto";
import { promises as dns } from "node:dns";
import nodemailer from "nodemailer";
import { db, webhookEndpointsTable, webhookDeliveriesTable } from "@workspace/db";
import { eq, and, lte, or, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./id";

const MAX_WEBHOOK_ATTEMPTS = 3;
const WEBHOOK_POLL_INTERVAL_MS = Number(process.env["WEBHOOK_POLL_INTERVAL_MS"] ?? 5_000);
const WEBHOOK_FETCH_TIMEOUT_MS = 10_000;

/**
 * Backoff delays indexed by (attempts already made - 1):
 *   1st failure → wait 5 s, 2nd failure → wait 25 s, 3rd failure → permanent fail
 */
const BACKOFF_DELAYS_MS = [5_000, 25_000, 125_000] as const;

// ── SSRF guard ────────────────────────────────────────────────────────────────

/**
 * Returns true if the given dotted-decimal or IPv6 string is a private,
 * loopback, or link-local address that must not be reached via outbound fetch.
 */
function isPrivateIp(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  if (/^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return true;
  return false;
}

/**
 * Returns true if the URL should be blocked due to SSRF risk.
 * Performs two checks:
 *   1. Hostname-pattern check (fast, synchronous — catches literal private addresses).
 *   2. DNS resolution check (async — catches hostnames that resolve to private IPs,
 *      preventing DNS rebinding attacks). On DNS failure the URL is allowed through
 *      fail-open; the delivery fetch will simply fail at the network layer.
 * Exported so webhooks.ts can validate at endpoint creation/update/test time.
 */
export async function isUnsafeUrl(rawUrl: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return true;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (isPrivateIp(h)) return true;
  // DNS resolution check — detects public hostnames that resolve to private IPs
  try {
    const { address } = await dns.lookup(h, { family: 4 });
    if (isPrivateIp(address)) return true;
  } catch {
    // DNS resolution failed — fail-open (the outbound fetch will fail naturally)
  }
  return false;
}

// ── HMAC signing ──────────────────────────────────────────────────────────────

/**
 * Compute X-AIGovOps-Signature for a webhook payload.
 * Format: "sha256=<hex>" — identical to GitHub's webhook signature convention.
 * Returns null when no secret is configured (unsigned delivery).
 * Exported so webhooks.ts can sign test payloads without duplicating logic.
 */
export function signWebhookPayload(payload: string, secret: string | null): string | null {
  if (!secret) return null;
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  return `sha256=${hmac}`;
}

// ── Payload builder ───────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

function mostSevere(
  violations: Array<{ id: string; name: string; severity: string }>,
): { id: string; name: string; severity: string } {
  return violations.reduce((a, b) =>
    (SEVERITY_RANK[b.severity] ?? 0) > (SEVERITY_RANK[a.severity] ?? 0) ? b : a,
  );
}

/**
 * Policy violation webhook payload shape.
 *
 * Top-level policyId/policyName/severity represent the primary (most severe)
 * violated policy for easy filtering by simple consumers.
 * The violations[] array provides the full set for consumers that need it.
 */
export interface WebhookPayload {
  event: "policy.violation";
  receiptId: string;
  policyId: string;
  policyName: string;
  severity: string;
  violations: Array<{ policyId: string; policyName: string; severity: string }>;
  summary: string;
  timestamp: string;
}

/** Build a canonical violation payload from policy evaluation results. */
export function buildViolationPayload(params: {
  receiptId: string;
  violatedPolicies: Array<{ id: string; name: string; severity: string }>;
}): WebhookPayload {
  const { receiptId, violatedPolicies } = params;
  const primary = mostSevere(violatedPolicies);
  const summary =
    violatedPolicies.length === 1
      ? `Policy violation: [${primary.severity.toUpperCase()}] ${primary.name}`
      : `${violatedPolicies.length} policy violations: ${violatedPolicies
          .map((v) => `[${v.severity.toUpperCase()}] ${v.name}`)
          .join(", ")}`;
  return {
    event: "policy.violation",
    receiptId,
    policyId: primary.id,
    policyName: primary.name,
    severity: primary.severity,
    violations: violatedPolicies.map((v) => ({
      policyId: v.id,
      policyName: v.name,
      severity: v.severity,
    })),
    summary,
    timestamp: new Date().toISOString(),
  };
}

// ── Event filter ──────────────────────────────────────────────────────────────

function matchesEventFilter(
  violations: Array<{ id: string; severity: string }>,
  filter: "all" | "critical" | "high_and_critical",
  policyIds: string[] | null,
): boolean {
  if (violations.length === 0) return false;
  // Specific policy IDs take precedence over severity-based filter
  if (policyIds && policyIds.length > 0) {
    return violations.some((v) => policyIds.includes(v.id));
  }
  if (filter === "all") return true;
  if (filter === "critical") return violations.some((v) => v.severity === "critical");
  return violations.some((v) => v.severity === "high" || v.severity === "critical");
}

// ── Email alerts (optional) ───────────────────────────────────────────────────

/**
 * Optionally send an email alert for critical violations.
 * Requires SMTP_HOST env var. Falls back to ALERT_EMAIL env var for recipient
 * until per-endpoint email addresses are supported (see task #45).
 */
async function maybeSendEmailAlert(params: {
  receiptId: string;
  payload: WebhookPayload;
}): Promise<void> {
  if (!process.env["SMTP_HOST"]) return;
  const recipient = process.env["ALERT_EMAIL"];
  if (!recipient) return;
  try {
    const transporter = nodemailer.createTransport({
      host: process.env["SMTP_HOST"],
      port: Number(process.env["SMTP_PORT"] ?? 587),
      secure: process.env["SMTP_SECURE"] === "true",
      auth: process.env["SMTP_USER"]
        ? { user: process.env["SMTP_USER"], pass: process.env["SMTP_PASS"] ?? "" }
        : undefined,
    });
    await transporter.sendMail({
      from: process.env["SMTP_FROM"] ?? "alerts@aigovops.app",
      to: recipient,
      subject: `AIGovOps Alert: ${params.payload.summary}`,
      text:
        `Receipt ID: ${params.receiptId}\n` +
        `${params.payload.summary}\n\n` +
        `Violations:\n` +
        params.payload.violations
          .map((v) => `  - [${v.severity.toUpperCase()}] ${v.policyName}`)
          .join("\n") +
        `\n\nTimestamp: ${params.payload.timestamp}`,
    });
    logger.info({ email: recipient, receiptId: params.receiptId }, "Email alert sent");
  } catch (err) {
    logger.warn({ err, smtpHost: process.env["SMTP_HOST"] }, "Email alert failed — check SMTP config");
  }
}

// ── Enqueue helper ────────────────────────────────────────────────────────────

/**
 * Create webhook_deliveries rows for each enabled endpoint whose eventFilter
 * matches the violations. Called from interactions.ts after a receipt is minted.
 * Fire-and-forget safe: caller should `.catch()` and log any error.
 */
export async function enqueueWebhookDeliveries(params: {
  receiptId: string;
  userId: string;
  violatedPolicies: Array<{ id: string; name: string; severity: string }>;
}): Promise<void> {
  const { receiptId, userId, violatedPolicies } = params;
  if (violatedPolicies.length === 0) return;

  const endpoints = await db
    .select()
    .from(webhookEndpointsTable)
    .where(and(eq(webhookEndpointsTable.userId, userId), eq(webhookEndpointsTable.enabled, 1)));

  if (endpoints.length === 0) return;

  const payload = buildViolationPayload({ receiptId, violatedPolicies });
  const payloadStr = JSON.stringify(payload);

  const hasCritical = violatedPolicies.some((v) => v.severity === "critical");

  const rows = [];
  for (const ep of endpoints) {
    const parsedPolicyIds = ep.policyIds
      ? (JSON.parse(ep.policyIds) as string[])
      : null;

    if (!matchesEventFilter(violatedPolicies, ep.eventFilter, parsedPolicyIds)) continue;

    rows.push({
      id: generateId(),
      webhookEndpointId: ep.id,
      receiptId,
      status: "pending" as const,
      attempts: 0,
      payload: payloadStr,
    });

    // Fire email alert for critical violations when emailAlerts is enabled
    if (ep.emailAlerts === 1 && hasCritical) {
      maybeSendEmailAlert({ receiptId, payload }).catch((err) => {
        logger.warn({ err, endpointId: ep.id }, "Email alert error");
      });
    }
  }

  if (rows.length > 0) {
    await db.insert(webhookDeliveriesTable).values(rows);
    logger.info({ receiptId, endpointCount: rows.length }, "Webhook deliveries enqueued");
  }
}

// ── Delivery worker ───────────────────────────────────────────────────────────

async function processDelivery(deliveryId: string): Promise<void> {
  const [delivery] = await db
    .select()
    .from(webhookDeliveriesTable)
    .where(eq(webhookDeliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery || delivery.status !== "pending") return;

  const [endpoint] = await db
    .select()
    .from(webhookEndpointsTable)
    .where(eq(webhookEndpointsTable.id, delivery.webhookEndpointId))
    .limit(1);

  if (!endpoint || !endpoint.enabled) {
    await db
      .update(webhookDeliveriesTable)
      .set({ status: "failed", lastAttemptAt: new Date() })
      .where(eq(webhookDeliveriesTable.id, deliveryId));
    return;
  }

  if (await isUnsafeUrl(endpoint.url)) {
    logger.warn({ deliveryId, url: endpoint.url }, "Webhook delivery blocked: private/unsafe URL");
    await db
      .update(webhookDeliveriesTable)
      .set({ status: "failed", lastAttemptAt: new Date() })
      .where(eq(webhookDeliveriesTable.id, deliveryId));
    return;
  }

  const signature = signWebhookPayload(delivery.payload, endpoint.secret ?? null);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AIGovOps-Webhook/1.0",
    "X-AIGovOps-Delivery": deliveryId,
  };
  if (signature) headers["X-AIGovOps-Signature"] = signature;

  const newAttempts = delivery.attempts + 1;
  let responseCode: number | null = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_FETCH_TIMEOUT_MS);
    const resp = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body: delivery.payload,
      signal: controller.signal,
    });
    clearTimeout(timer);
    responseCode = resp.status;
    success = resp.ok;
  } catch (err) {
    logger.warn({ deliveryId, endpointId: endpoint.id, err }, "Webhook fetch failed");
  }

  const now = new Date();
  if (success) {
    await db
      .update(webhookDeliveriesTable)
      .set({ status: "delivered", attempts: newAttempts, lastAttemptAt: now, responseCode })
      .where(eq(webhookDeliveriesTable.id, deliveryId));
    logger.info({ deliveryId, responseCode }, "Webhook delivered successfully");
  } else {
    const isFinal = newAttempts >= MAX_WEBHOOK_ATTEMPTS;
    const nextRetryAt = isFinal
      ? null
      : new Date(now.getTime() + (BACKOFF_DELAYS_MS[newAttempts - 1] ?? 125_000));
    await db
      .update(webhookDeliveriesTable)
      .set({
        status: isFinal ? "failed" : "pending",
        attempts: newAttempts,
        lastAttemptAt: now,
        nextRetryAt,
        responseCode,
      })
      .where(eq(webhookDeliveriesTable.id, deliveryId));
    if (isFinal) {
      logger.warn({ deliveryId, responseCode }, "Webhook delivery permanently failed after max attempts");
    } else {
      logger.info({ deliveryId, nextRetryAt, responseCode }, "Webhook delivery failed, will retry");
    }
  }
}

async function processPendingDeliveries(): Promise<void> {
  const now = new Date();
  const pending = await db
    .select({ id: webhookDeliveriesTable.id })
    .from(webhookDeliveriesTable)
    .where(
      and(
        eq(webhookDeliveriesTable.status, "pending"),
        or(isNull(webhookDeliveriesTable.nextRetryAt), lte(webhookDeliveriesTable.nextRetryAt, now)),
      ),
    )
    .limit(50);

  for (const { id } of pending) {
    try {
      await processDelivery(id);
    } catch (err) {
      logger.error({ deliveryId: id, err }, "Unexpected error processing webhook delivery");
    }
  }
}

/**
 * Start the in-process webhook delivery worker.
 * Call exactly once at server startup (artifacts/api-server/src/index.ts).
 * Returns the interval handle so tests can clear it.
 */
export function startWebhookWorker(): NodeJS.Timeout {
  logger.info({ pollIntervalMs: WEBHOOK_POLL_INTERVAL_MS }, "Webhook delivery worker started");
  processPendingDeliveries().catch((err) =>
    logger.error({ err }, "Webhook worker initial poll failed"),
  );
  return setInterval(() => {
    processPendingDeliveries().catch((err) =>
      logger.error({ err }, "Webhook delivery worker poll error"),
    );
  }, WEBHOOK_POLL_INTERVAL_MS);
}

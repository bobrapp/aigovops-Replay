/**
 * webhook-worker.ts — In-process delivery loop for policy violation webhooks.
 *
 * Architecture:
 *   - startWebhookWorker() registers a setInterval that polls webhook_deliveries
 *     every WEBHOOK_POLL_INTERVAL_MS for pending rows with elapsed retry timers.
 *   - Each pending delivery: load endpoint config → sign payload → POST → update status.
 *   - MAX_WEBHOOK_ATTEMPTS = 4: 1 initial attempt + up to 3 retries with exponential
 *     backoff: retry 1 after 5 s, retry 2 after 25 s, retry 3 after 125 s, then fail.
 *   - Concurrent duplicate prevention: processPendingDeliveries() uses
 *     SELECT ... FOR UPDATE SKIP LOCKED inside a transaction to atomically claim rows
 *     and advance their nextRetryAt past a claim window before releasing the lock.
 *     A concurrent poll will skip locked rows entirely, preventing double-sends.
 *   - If the endpoint is disabled or deleted, the delivery is immediately failed.
 *
 * SSRF protection (exported so webhooks.ts can reuse at creation/update time):
 *   - Only http: and https: schemes are allowed.
 *   - Private RFC-1918, loopback, and link-local ranges are blocked by hostname pattern.
 *   - All resolved A and AAAA addresses are checked via dns.lookup(..., { all: true })
 *     to prevent DNS rebinding attacks. Creation/update/test paths are fail-closed;
 *     the delivery worker is fail-open so transient DNS outages don't strand retries.
 *   - Fetches are wrapped with a 10-second AbortController timeout.
 *
 * Email alerts:
 *   - The emailAlerts field is stored in the DB and exposed through the API.
 *   - Actual email delivery is pending task #45, which adds a per-endpoint recipient
 *     address. No emails are sent in the current implementation.
 */

import { createHmac } from "node:crypto";
import { promises as dns } from "node:dns";
import nodemailer from "nodemailer";
import { db, webhookEndpointsTable, webhookDeliveriesTable } from "@workspace/db";
import { eq, and, lte, or, isNull, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { generateId } from "./id";

const MAX_WEBHOOK_ATTEMPTS = 4; // 1 initial + 3 retries (uses all three backoff delays)
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
 *   2. DNS resolution check (async, all address families) — resolves ALL A and AAAA
 *      records and blocks if any resolved IP is private, loopback, or link-local.
 *      This prevents DNS rebinding attacks where a public hostname resolves to an
 *      internal IP.
 *
 * @param rawUrl - The URL to check.
 * @param opts.failClosedOnDnsError - When true (use at endpoint creation/update/test),
 *   DNS resolution failures cause the URL to be blocked. When false (delivery worker),
 *   DNS errors fail-open so already-validated endpoints are not silently broken by
 *   transient DNS outages. Defaults to false.
 */
export async function isUnsafeUrl(
  rawUrl: string,
  opts: { failClosedOnDnsError?: boolean } = {},
): Promise<boolean> {
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
  // Resolve ALL A and AAAA records and block if any address is private.
  // Using { all: true } returns every address rather than just the first one,
  // preventing evasion by mixing public and private addresses in DNS responses.
  try {
    const addresses = await dns.lookup(h, { all: true });
    for (const { address: addr } of addresses) {
      if (isPrivateIp(addr)) return true;
    }
  } catch {
    if (opts.failClosedOnDnsError) return true;
    // Fail-open for the delivery worker: transient DNS failures during retry
    // should not permanently block an otherwise-valid endpoint.
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

// ── Email alerts (pending task #45) ──────────────────────────────────────────
// Email delivery requires a per-endpoint recipient address persisted in the DB.
// The emailAlerts flag is stored and exposed through the API so the schema
// is already in place, but no emails are sent until task #45 adds the
// alertEmail column and wires the correct per-user recipient.
// nodemailer is retained as an installed dependency for that implementation.
void nodemailer;

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
  // Claim window: if the process crashes before updating the final status, the
  // delivery becomes eligible for reprocessing once this window expires.
  const claimUntil = new Date(now.getTime() + 30_000);

  // Atomically claim pending deliveries using FOR UPDATE SKIP LOCKED.
  // Rows being processed by a concurrent worker poll are skipped, preventing
  // the same delivery from being POSTed to the endpoint more than once.
  const claimedIds = await db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT id FROM webhook_deliveries
          WHERE status = 'pending'
            AND (next_retry_at IS NULL OR next_retry_at <= ${now})
          LIMIT 50
          FOR UPDATE SKIP LOCKED`,
    );
    const ids = (result.rows as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];
    // Advance nextRetryAt past the claim window so concurrent polls skip these rows
    // until the current batch finishes and sets the correct backoff or final status.
    await tx
      .update(webhookDeliveriesTable)
      .set({ nextRetryAt: claimUntil })
      .where(inArray(webhookDeliveriesTable.id, ids));
    return ids;
  });

  for (const id of claimedIds) {
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

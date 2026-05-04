import { pgTable, text, integer, bigserial, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const policyStatusEnum = pgEnum("policy_status", ["pass", "fail", "pending", "error"]);
export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);
export const activityTypeEnum = pgEnum("activity_type", ["created", "replayed", "verified", "policy_check"]);

export const interactionsTable = pgTable("interactions", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  response: text("response").notNull(),
  model: text("model").notNull(),
  userId: text("user_id").notNull(),
  tags: text("tags").array().notNull().default([]),
  promptHash: text("prompt_hash").notNull(),
  responseHash: text("response_hash").notNull(),
  prevHash: text("prev_hash"),
  chainHash: text("chain_hash").notNull(),
  policyStatus: policyStatusEnum("policy_status").notNull().default("pending"),
  policyViolations: text("policy_violations").array().notNull().default([]),
  replayCount: integer("replay_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  // Composite unique index: chainHash must be unique within a user's chain.
  // Replaced the previous global uniqueIndex("interactions_chain_hash_unique")
  // which scoped uniqueness across ALL users. buildChainHash() is content-
  // addressed (promptHash + responseHash + prevHash only); two different users
  // minting a first receipt with identical content produce the same chainHash.
  // The global index caused the second user's insert to fail, letting an
  // attacker pre-mint common first-receipt pairs to block others.
  // The composite (userId, chainHash) index fixes this: uniqueness is enforced
  // per user, so independent users with identical content can both succeed.
  // All chainHash-based lookups in route handlers are scoped to userId to
  // maintain per-user chain isolation even when hashes are numerically equal.
  uniqueIndex("interactions_user_chain_hash_unique").on(table.userId, table.chainHash),
  // Partial composite unique index: ensures at most one receipt per user can
  // claim any given predecessor (prevHash), providing DB-level fork prevention
  // as defense-in-depth alongside the application-level advisory lock.
  // Changed from global (prevHash) to per-user (userId, prevHash) for the same
  // reason as chainHash above: prevHash values are chainHashes of predecessors,
  // which can collide across users with identical content. A global constraint
  // would reject a second user's receipt whose prevHash numerically equals
  // another user's claimed prevHash, blocking their chain writes entirely.
  uniqueIndex("interactions_user_prev_hash_unique").on(table.userId, table.prevHash).where(sql`prev_hash IS NOT NULL`),
]);

export const insertInteractionSchema = createInsertSchema(interactionsTable).omit({ createdAt: true });
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactionsTable.$inferSelect;

export const policiesTable = pgTable("policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  rule: text("rule").notNull(),
  severity: severityEnum("severity").notNull().default("medium"),
  enabled: integer("enabled").notNull().default(1),
  violationCount: integer("violation_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPolicySchema = createInsertSchema(policiesTable).omit({ createdAt: true, updatedAt: true });
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policiesTable.$inferSelect;

export const activityLogTable = pgTable("activity_log", {
  id: text("id").primaryKey(),
  type: activityTypeEnum("type").notNull(),
  interactionId: text("interaction_id").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  /**
   * seq: monotonic BIGSERIAL insertion-order counter.
   * Assigned by PostgreSQL under the advisory lock (pg_advisory_xact_lock
   * 0x4C4F4748) so seq order == insertion order, always.
   * Used as the sole chain-ordering key in both insertActivityLog
   * (ORDER BY seq DESC for predecessor lookup) and GET /audit/chain-status
   * (ORDER BY seq ASC for verification walk). This eliminates any ambiguity
   * from created_at timestamp ties.
   * Pre-migration rows get seq values auto-filled by the sequence; they are
   * skipped during hash verification (logHash IS NULL) so their seq ordering
   * relative to post-migration rows does not affect chain correctness.
   */
  seq: bigserial("seq", { mode: "bigint" }),
  /**
   * logHash integrity chain — makes the audit log tamper-evident.
   *
   * prevLogHash: logHash of the immediately preceding activity_log row
   *   (globally; the audit chain is a single shared sequence, not per-user).
   *   NULL for the genesis entry and for pre-migration legacy rows.
   *
   * logHash: sha256("log:" + type + ":" + interactionId + ":" + summary
   *           + ":" + createdAt.toISOString() + ":" + prevLogHash|"GENESIS")
   *   Nullable for backward compatibility — pre-migration rows without hashes
   *   are skipped (not failed) during chain verification.
   *
   * Inserts must be serialized via pg_advisory_xact_lock to prevent races
   * on the prevLogHash lookup (see lib/activity-log.ts).
   */
  prevLogHash: text("prev_log_hash"),
  /**
   * logHash is nullable for backward compatibility: pre-migration rows that
   * existed before 0001_add_activity_log_hash_chain.sql was applied will have
   * NULL here and are skipped (not failed) during chain verification.
   * Post-migration rows always have a non-null hash (enforced in insertActivityLog).
   */
  logHash: text("log_hash"),
});

export type ActivityLog = typeof activityLogTable.$inferSelect;

/**
 * share_tokens — short-lived opaque bearer tokens granting public read-only
 * access to a single receipt's verification result.
 *
 * Design: each raw token is a 32-byte cryptographically random value.
 * Only SHA-256(rawToken) is persisted — a DB dump never leaks usable tokens.
 * (HMAC is not required because the input is already high-entropy.)
 *
 * Each row ties one token to one interaction. The owner generates a token via
 * POST /api/interactions/:id/share-token; anyone with the raw token can
 * call GET /api/verify/:id?token=... without logging in.
 *
 * Security properties:
 *   - token_hash stores sha256(rawToken) so a DB dump doesn't leak usable tokens.
 *   - expires_at enforces a configurable TTL (default 7 days).
 *   - interaction_id + user_id are stored so the public endpoint can scope its
 *     verification query without a second lookup.
 */
export const shareTokensTable = pgTable("share_tokens", {
  id: text("id").primaryKey(),
  interactionId: text("interaction_id").notNull(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  /**
   * redact: issuer-controlled redaction flag.
   * When true, GET /verify/:id will omit the prompt and response from the
   * public result regardless of what the caller passes in the query string.
   * This ensures that a privacy decision made at share-link generation time
   * cannot be overridden by the recipient.
   */
  redact: text("redact").notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShareToken = typeof shareTokensTable.$inferSelect;

export const webhookEventFilterEnum = pgEnum("webhook_event_filter", [
  "all",
  "critical",
  "high_and_critical",
]);

export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", [
  "pending",
  "delivered",
  "failed",
]);

/**
 * webhook_endpoints — user-configured delivery targets for policy violation alerts.
 *
 * Security notes:
 *   - url is validated at request time against an SSRF blocklist (private ranges,
 *     loopback, link-local). The stored value is re-checked at delivery time.
 *   - secret is stored in plaintext as an HMAC key (not a password). It is used
 *     to compute HMAC-SHA256(payload) sent in X-AIGovOps-Signature. The secret
 *     is never included in list/detail responses; hasSecret:boolean is sent instead.
 *   - enabled is stored as integer (0/1) for SQLite compatibility in tests.
 *   - Max 10 endpoints per user enforced at the API layer.
 */
export const webhookEndpointsTable = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret"),
  enabled: integer("enabled").notNull().default(1),
  eventFilter: webhookEventFilterEnum("event_filter").notNull().default("all"),
  emailAlerts: integer("email_alerts").notNull().default(0),
  policyIds: text("policy_ids"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type WebhookEndpoint = typeof webhookEndpointsTable.$inferSelect;

/**
 * webhook_deliveries — per-delivery tracking for each webhook firing.
 *
 * One row is created per (enabled endpoint, receipt) when a receipt is minted
 * with one or more policy violations matching the endpoint's eventFilter.
 * The worker retries up to MAX_WEBHOOK_ATTEMPTS (3) with exponential backoff.
 */
export const webhookDeliveriesTable = pgTable("webhook_deliveries", {
  id: text("id").primaryKey(),
  webhookEndpointId: text("webhook_endpoint_id").notNull(),
  receiptId: text("receipt_id").notNull(),
  status: webhookDeliveryStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  responseCode: integer("response_code"),
  payload: text("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;

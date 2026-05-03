import { pgTable, text, integer, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
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

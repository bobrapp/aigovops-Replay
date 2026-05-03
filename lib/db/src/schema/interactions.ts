import { pgTable, text, integer, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const policyStatusEnum = pgEnum("policy_status", ["pass", "fail", "pending"]);
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
  // Partial unique index on non-null prevHash: ensures at most one receipt
  // can claim any given predecessor, providing DB-level fork prevention as
  // defense-in-depth alongside the application-level advisory lock.
  uniqueIndex("interactions_prev_hash_unique").on(table.prevHash).where(sql`prev_hash IS NOT NULL`),
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
});

export type ActivityLog = typeof activityLogTable.$inferSelect;

/**
 * Serialized activity log insertion helper.
 *
 * Every audit event (receipt minted, verified, replayed, policy checked) must
 * be inserted through this helper to maintain the audit log hash chain.
 *
 * Race condition prevention:
 *   prevLogHash is the logHash of the most recently inserted activity_log row.
 *   Without serialization, two concurrent insertions can both read the same
 *   "latest" row and produce two entries that both claim the same predecessor —
 *   breaking the chain's append-only property.
 *
 *   Solution: acquire a session-level advisory lock inside a transaction before
 *   reading the latest logHash. pg_advisory_xact_lock is automatically released
 *   at the end of the transaction, so the lock window is exactly the
 *   read-prevLogHash → compute-logHash → insert sequence.
 *
 * Backward compatibility:
 *   Pre-migration rows with NULL logHash are not affected. The chain walk in
 *   GET /api/audit/chain-status skips null-logHash rows rather than failing them.
 */

import { db, activityLogTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { buildLogHash } from "./crypto";
import { generateId } from "./id";
import { logger } from "./logger";

/**
 * Advisory lock key for audit log insert serialization.
 * "LOGH" encoded as a 32-bit integer (0x4C4F4748).
 * Must be distinct from CHAIN_WRITE_LOCK_KEY (0x52455041) in interactions.ts.
 */
const AUDIT_LOG_LOCK_KEY = 0x4c4f4748;

export async function insertActivityLog(params: {
  type: "created" | "replayed" | "verified" | "policy_check";
  interactionId: string;
  summary: string;
}): Promise<void> {
  const id = generateId();
  const createdAt = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_LOG_LOCK_KEY})`);

      const [latest] = await tx
        .select({ logHash: activityLogTable.logHash })
        .from(activityLogTable)
        .orderBy(desc(activityLogTable.createdAt))
        .limit(1);

      const prevLogHash = latest?.logHash ?? null;

      const logHash = buildLogHash({
        type: params.type,
        interactionId: params.interactionId,
        summary: params.summary,
        createdAt,
        prevLogHash,
      });

      await tx.insert(activityLogTable).values({
        id,
        type: params.type,
        interactionId: params.interactionId,
        summary: params.summary,
        createdAt,
        prevLogHash,
        logHash,
      });
    });
  } catch (err) {
    logger.error({ err, params }, "Failed to insert activity log entry");
    throw err;
  }
}

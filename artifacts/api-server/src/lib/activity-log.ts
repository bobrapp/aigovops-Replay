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
 *   Solution: acquire pg_advisory_xact_lock inside a transaction before reading
 *   the latest logHash. The lock is automatically released at the end of the
 *   transaction, so the critical window is exactly:
 *     lock → read-prevLogHash → insert (with DB-generated timestamp) → derive-logHash → update
 *
 * Timestamp ordering guarantee:
 *   createdAt is NOT pre-computed in JS before lock acquisition. Instead:
 *     1. The row is inserted with DEFAULT (now()) so PostgreSQL assigns the
 *        created_at under the same serialization lock.
 *     2. The INSERT … RETURNING clause gives us back the DB-assigned timestamp.
 *     3. We derive logHash from that returned timestamp and UPDATE the row.
 *   This ensures that: (a) the hashed timestamp always matches the stored
 *   timestamp, and (b) the insertion order (lock order) matches the
 *   created_at order, so ORDER BY created_at, id produces a deterministic
 *   chain walk consistent with insertion order.
 *
 * Backward compatibility:
 *   Pre-migration rows with NULL logHash are not affected. The chain walk in
 *   GET /api/audit/chain-status skips null-logHash rows rather than failing
 *   them, so the endpoint works correctly on databases that have not yet been
 *   backfilled.
 */

import { db, activityLogTable } from "@workspace/db";
import { desc, isNotNull, sql } from "drizzle-orm";
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

  try {
    await db.transaction(async (tx) => {
      // Serialize all audit-log writes globally so that the prevLogHash
      // lookup, the INSERT, and the logHash derivation are one atomic unit.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_LOG_LOCK_KEY})`);

      // Read the predecessor's logHash using deterministic ordering.
      // ORDER BY created_at ASC, id ASC matches the verification walk so that
      // "latest" here and "last seen during verification" are always the same row.
      const [latest] = await tx
        .select({ logHash: activityLogTable.logHash })
        .from(activityLogTable)
        .where(isNotNull(activityLogTable.logHash))
        .orderBy(desc(activityLogTable.createdAt), desc(activityLogTable.id))
        .limit(1);

      const prevLogHash = latest?.logHash ?? null;

      // Insert the row first and let PostgreSQL assign created_at (DEFAULT now()).
      // The RETURNING clause gives us the DB-assigned timestamp so our logHash
      // is derived from the value that will actually be stored.
      const [inserted] = await tx
        .insert(activityLogTable)
        .values({
          id,
          type: params.type,
          interactionId: params.interactionId,
          summary: params.summary,
          prevLogHash,
          logHash: "pending",
        })
        .returning({ createdAt: activityLogTable.createdAt });

      const logHash = buildLogHash({
        type: params.type,
        interactionId: params.interactionId,
        summary: params.summary,
        createdAt: inserted.createdAt,
        prevLogHash,
      });

      await tx
        .update(activityLogTable)
        .set({ logHash })
        .where(sql`id = ${id}`);
    });
  } catch (err) {
    logger.error({ err, params }, "Failed to insert activity log entry");
    throw err;
  }
}

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
 *     lock → read-prev (by seq DESC) → insert → RETURNING createdAt+seq → hash → update
 *
 * Monotonic ordering via seq (BIGSERIAL):
 *   created_at is microsecond-precision but two rows acquired under the same
 *   lock can still share the same timestamp if the OS clock does not advance
 *   between them. To guarantee a deterministic, non-ambiguous chain order,
 *   activity_log has a BIGSERIAL `seq` column. PostgreSQL assigns seq inside
 *   the same advisory-locked transaction as the insert, so seq order is always
 *   consistent with insertion order regardless of timestamp ties.
 *
 *   Both the predecessor lookup (ORDER BY seq DESC) and the verification walk
 *   (ORDER BY seq ASC) use seq as the sole ordering key.
 *
 * Timestamp guarantee:
 *   The row is inserted with DEFAULT now() so PostgreSQL assigns created_at.
 *   INSERT … RETURNING gives us back both createdAt and seq. logHash is then
 *   derived from the DB-returned createdAt so the hashed and stored timestamps
 *   are always identical.
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

      // Read the predecessor using seq — the only fully deterministic order.
      // seq is a BIGSERIAL assigned by PG under the same lock, so DESC seq
      // always gives the most recently inserted hashed row.
      const [latest] = await tx
        .select({ logHash: activityLogTable.logHash })
        .from(activityLogTable)
        .where(isNotNull(activityLogTable.logHash))
        .orderBy(desc(activityLogTable.seq))
        .limit(1);

      const prevLogHash = latest?.logHash ?? null;

      // Insert with logHash=null (placeholder); let PG assign created_at + seq.
      // RETURNING gives us the DB-assigned values so our hash is derived from
      // the values that will actually be stored.
      const [inserted] = await tx
        .insert(activityLogTable)
        .values({
          id,
          type: params.type,
          interactionId: params.interactionId,
          summary: params.summary,
          prevLogHash,
          logHash: null,
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

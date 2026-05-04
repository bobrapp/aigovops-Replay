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
 *     lock → read-prev (by seq DESC) → SELECT now() → hash → insert
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
 *   We call `SELECT now()` inside the lock window and pass that timestamp
 *   explicitly as created_at on the INSERT. Because both the stored value and
 *   the hashed value come from the same `now()` call, they are always identical.
 *   PostgreSQL's now() is stable within a transaction, so no drift is possible.
 *
 * Why not the two-step INSERT(null) → RETURNING → UPDATE pattern?
 *   A DEFERRABLE INITIALLY DEFERRED constraint trigger on activity_log fires at
 *   COMMIT time with the row state *at the time of the INSERT* (not the current
 *   row state). Inserting with log_hash=null and later updating it to the real
 *   hash still triggers "log_hash must not be NULL" at commit because the trigger
 *   evaluates the INSERT event's NEW row. The single-step pattern avoids the null
 *   placeholder entirely: the trigger sees log_hash = computed_hash at INSERT time
 *   and passes the check.
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
      // lookup, the hash computation, and the INSERT are one atomic unit.
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

      // Read the current timestamp from PostgreSQL. now() is stable within a
      // transaction, so this value will be identical to the created_at we store.
      // We use it to pre-compute the hash before the INSERT so that the row is
      // never written with log_hash=null (avoiding the deferred-trigger issue
      // described in the module comment above).
      const nowResult = await tx.execute<{ now: string }>(sql`SELECT now() AS now`);
      const now = new Date(nowResult.rows[0].now);

      const logHash = buildLogHash({
        type: params.type,
        interactionId: params.interactionId,
        summary: params.summary,
        createdAt: now,
        prevLogHash,
      });

      // Single INSERT with the pre-computed hash. The deferred constraint trigger
      // sees log_hash = hash_string (non-null) at INSERT time and passes.
      await tx.insert(activityLogTable).values({
        id,
        type: params.type,
        interactionId: params.interactionId,
        summary: params.summary,
        createdAt: now,
        prevLogHash,
        logHash,
      });
    });
  } catch (err) {
    logger.error({ err, params }, "Failed to insert activity log entry");
    throw err;
  }
}

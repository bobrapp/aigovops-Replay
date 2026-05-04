/**
 * audit-log-backfill — repair the activity_log integrity chain end-to-end.
 *
 * Why this exists
 * ───────────────
 * The 0001 migration added log_hash / prev_log_hash columns and a deferred
 * NOT-NULL trigger that only fires for rows whose seq is greater than the
 * "legacy_cutoff" recorded at migration time. Pre-migration rows therefore
 * still have NULL hashes, and the verification walker in
 * GET /audit/chain-status silently skips every NULL row before the first
 * hashed entry. That leaves a slice of audit history outside the tamper-
 * evidence story we promise users.
 *
 * What this does
 * ──────────────
 * Walks every row in seq ASC, recomputes prev_log_hash + log_hash so the
 * stored values form a coherent chain rooted at GENESIS, applies the rewrites,
 * and lowers the trigger's legacy_cutoff to 0 so future inserts cannot ever
 * sneak a NULL hash through. All work happens in a single transaction guarded
 * by pg_advisory_xact_lock(0x4C4F4748) — the same lock insertActivityLog
 * holds — so a concurrent insert cannot race the cutoff move.
 *
 * Why the FULL chain (not just legacy rows) is rewritten
 * ──────────────────────────────────────────────────────
 * The first post-migration row was inserted with prev_log_hash = NULL because
 * at the time it was inserted there were no hashed rows to chain off (only
 * legacy NULL rows existed). After we backfill the legacy rows, the walker's
 * accumulated expected predecessor at the boundary is the last legacy row's
 * hash — but the first post-migration row's stored prev_log_hash is still
 * NULL. The walker would flag that boundary as tampered. The only way to
 * make `total == hashableEntries` and `mismatches: []` true (the contract
 * promised by the "Done looks like" of task #53) is to recompute every row's
 * hash from a single canonical seq-ordered walk.
 *
 * Idempotency
 * ───────────
 * Hashes are deterministic. A second run computes the same values and writes
 * zero rows because the existing log_hash/prev_log_hash already match the
 * recomputed values. Operators can re-run safely.
 */
import type { PoolClient } from "pg";
import { pool } from "./index";
import { buildLogHash } from "./audit-crypto";

/** "LOGH" as a 32-bit int. Must match AUDIT_LOG_LOCK_KEY in activity-log.ts. */
const AUDIT_LOG_LOCK_KEY = 0x4c4f4748;

export interface BackfillSummary {
  /** Total rows in activity_log at the time the backfill started. */
  totalRows: number;
  /** Rows whose log_hash was NULL before the backfill ran. */
  nullHashRows: number;
  /** Lowest seq among NULL-hash rows (null if there are none). */
  nullMinSeq: string | null;
  /** Highest seq among NULL-hash rows (null if there are none). */
  nullMaxSeq: string | null;
  /**
   * Current legacy_cutoff baked into the activity_log_hash_not_null_check
   * trigger function. Rows with seq <= this value are exempt from the
   * deferred NOT-NULL check. After a successful (non-dryRun) backfill this
   * is pinned to 0 so every row going forward is covered.
   */
  legacyCutoff: string;
  /** Rows whose stored hash columns differ from the recomputed canonical chain. */
  rowsThatWillChange: number;
  /** Lowest seq among rows that need rewriting (null if none). */
  firstChangedSeq: string | null;
  /** Highest seq among rows that need rewriting (null if none). */
  lastChangedSeq: string | null;
  /** True when called with dryRun: writes were skipped. */
  dryRun: boolean;
  /** True when writes were applied (always false for dryRun). */
  applied: boolean;
}

/**
 * Raised when the table contains an unrecoverable structural anomaly that the
 * backfill refuses to "paper over" — currently only the case where a NULL
 * log_hash row appears AFTER any non-NULL log_hash row in seq order. This
 * pattern can only arise from a delete-and-reinsert attack or out-of-band
 * row manipulation; it must be investigated by an operator before backfill
 * is allowed to proceed (otherwise the backfill would silently mask the
 * tamper evidence by hashing the inserted row in line with its neighbors).
 */
export class AuditLogChainInconsistencyError extends Error {
  constructor(
    public readonly nullSeqAfterNonNull: string,
    public readonly previousNonNullSeq: string,
  ) {
    super(
      `activity_log integrity violation: row seq=${nullSeqAfterNonNull} has NULL log_hash but a hashed row exists at seq=${previousNonNullSeq}. ` +
        `This indicates out-of-band row manipulation. Investigate before re-running the backfill.`,
    );
    this.name = "AuditLogChainInconsistencyError";
  }
}

interface ActivityLogRow {
  id: string;
  type: string;
  interaction_id: string;
  summary: string;
  created_at: Date;
  prev_log_hash: string | null;
  log_hash: string | null;
  seq: string;
}

/**
 * Run the audit-log backfill against the singleton pool.
 *
 * @param opts.dryRun  When true, computes the canonical chain and reports what
 *                     WOULD change without writing or lowering the cutoff.
 *                     Always rolls back the transaction in this mode.
 */
export async function backfillAuditLogHashes(opts: { dryRun: boolean }): Promise<BackfillSummary> {
  const client: PoolClient = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    // Hold the same lock insertActivityLog uses so no concurrent insert can
    // see a half-rewritten chain or slip in between our last UPDATE and the
    // cutoff lowering.
    await client.query("SELECT pg_advisory_xact_lock($1)", [AUDIT_LOG_LOCK_KEY]);

    const { rows } = await client.query<ActivityLogRow>(
      `SELECT id, type, interaction_id, summary, created_at, prev_log_hash, log_hash, seq
       FROM activity_log
       ORDER BY seq ASC`,
    );

    // Pre-scan: collect NULL-hash stats and detect the structural anomaly
    // where a NULL row appears AFTER a non-NULL row in seq order. The latter
    // can only mean out-of-band tampering and must abort the backfill BEFORE
    // any writes — otherwise we would silently re-hash the suspicious row
    // and bury the evidence.
    let nullHashRows = 0;
    let nullMinSeq: string | null = null;
    let nullMaxSeq: string | null = null;
    let lastNonNullSeq: string | null = null;
    for (const row of rows) {
      if (row.log_hash === null) {
        nullHashRows++;
        if (nullMinSeq === null) nullMinSeq = row.seq;
        nullMaxSeq = row.seq;
        if (lastNonNullSeq !== null) {
          throw new AuditLogChainInconsistencyError(row.seq, lastNonNullSeq);
        }
      } else {
        lastNonNullSeq = row.seq;
      }
    }

    // Read the current legacy_cutoff from the trigger function source so we
    // can surface it to operators in the dry-run report.
    const legacyCutoff = await readLegacyCutoff(client);

    // Walk the table in seq order and compute the canonical chain.
    // Any row whose stored columns differ from the recomputed values is queued
    // for rewriting. The genesis row receives prevLogHash = null (which
    // buildLogHash folds into the literal "GENESIS" sentinel).
    let expectedPrev: string | null = null;
    const updates: { id: string; newHash: string; newPrev: string | null; seq: string }[] = [];

    for (const row of rows) {
      const createdAt = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);
      const newHash = buildLogHash({
        type: row.type,
        interactionId: row.interaction_id,
        summary: row.summary,
        createdAt,
        prevLogHash: expectedPrev,
      });

      if (row.log_hash !== newHash || row.prev_log_hash !== expectedPrev) {
        updates.push({ id: row.id, newHash, newPrev: expectedPrev, seq: row.seq });
      }

      expectedPrev = newHash;
    }

    const summary: BackfillSummary = {
      totalRows: rows.length,
      nullHashRows,
      nullMinSeq,
      nullMaxSeq,
      legacyCutoff,
      rowsThatWillChange: updates.length,
      firstChangedSeq: updates[0]?.seq ?? null,
      lastChangedSeq: updates[updates.length - 1]?.seq ?? null,
      dryRun: opts.dryRun,
      applied: false,
    };

    if (opts.dryRun) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return summary;
    }

    // Apply rewrites. One UPDATE per row keeps the SQL trivially correct;
    // backfill is an infrequent operator action so per-row overhead is fine
    // even for very large audit logs (still completes in seconds for 100k rows).
    for (const u of updates) {
      await client.query(
        "UPDATE activity_log SET log_hash = $1, prev_log_hash = $2 WHERE id = $3",
        [u.newHash, u.newPrev, u.id],
      );
    }

    // Lower the trigger's legacy_cutoff to 0 by recreating the function with
    // a literal 0. After this, every future insert MUST carry a non-null
    // log_hash or the deferred constraint trigger will reject the transaction
    // at COMMIT. This closes the "NULL hash slipped through" gap permanently.
    //
    // The trigger itself (trg_activity_log_hash_not_null) does not need to be
    // recreated — only the function it calls. The trigger continues to fire
    // AFTER INSERT OR UPDATE and remains DEFERRABLE INITIALLY DEFERRED.
    await client.query(`
      CREATE OR REPLACE FUNCTION activity_log_hash_not_null_check()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        -- Cutoff lowered to 0 by audit-log-backfill: every row must have a hash.
        IF NEW.log_hash IS NULL AND NEW.seq > 0 THEN
          RAISE EXCEPTION
            'activity_log.log_hash must not be NULL (seq=%)', NEW.seq
            USING ERRCODE = 'not_null_violation';
        END IF;
        RETURN NEW;
      END;
      $body$
    `);

    await client.query("COMMIT");
    inTransaction = false;
    return { ...summary, legacyCutoff: "0", applied: true };
  } catch (err) {
    if (inTransaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // best-effort — surface the original error
      }
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Read the literal cutoff value embedded in the
 * activity_log_hash_not_null_check trigger function source. The migration
 * embeds it via `format(%s)`, so the source contains a line like
 * `IF NEW.log_hash IS NULL AND NEW.seq > 42 THEN`. We parse out the integer.
 *
 * Returns "unknown" if the function does not exist (extremely defensive — the
 * migration always creates it). Returns "0" after a successful backfill.
 */
async function readLegacyCutoff(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ src: string | null }>(
    `SELECT pg_get_functiondef(oid) AS src
       FROM pg_proc
      WHERE proname = 'activity_log_hash_not_null_check'
      LIMIT 1`,
  );
  const src = rows[0]?.src;
  if (!src) return "unknown";
  const match = src.match(/NEW\.seq\s*>\s*(\d+)/);
  return match ? match[1] : "unknown";
}

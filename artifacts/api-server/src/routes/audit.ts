/**
 * Audit log integrity endpoints — admin-only.
 *
 * GET /audit/chain-status
 *   Walks every activity_log row that has a logHash (post-migration rows) in
 *   strict monotonic order (seq ASC — BIGSERIAL, assigned under the advisory
 *   lock at insert time) and validates each entry in two ways:
 *
 *   1. Link check: row.prevLogHash must equal the expectedPrev accumulated from
 *      the walk (NULL for the genesis entry). Detects out-of-order insertion or
 *      prevLogHash column tampering.
 *
 *   2. Hash check: the logHash is re-derived from the row's own stored fields
 *      (type, interactionId, summary, createdAt) plus expectedPrev from the
 *      walk. Detects field-level tampering or hash substitution.
 *
 *   Either failure increments the tampered counter.
 *
 *   Ordering by seq (not created_at + id) ensures the walk is deterministic
 *   even when two rows share the same microsecond-precision timestamp. seq is a
 *   BIGSERIAL that PG assigns inside the same advisory-locked transaction as the
 *   insert, so seq order == insertion order, always.
 *
 *   Pre-migration rows with NULL logHash are counted in `total` but skipped in
 *   `hashableEntries` and chain verification (backward compatibility).
 *
 *   Protected behind requireAdminAuth — same cookie-based session as policy
 *   management routes.
 */

import { Router, type IRouter } from "express";
import { db, activityLogTable } from "@workspace/db";
import { asc, isNotNull } from "drizzle-orm";
import { requireAdminAuth } from "./admin";
import { buildLogHash } from "../lib/crypto";

const router: IRouter = Router();

router.get("/audit/chain-status", requireAdminAuth, async (_req, res) => {
  const [allRows, hashableRows] = await Promise.all([
    db
      .select({ id: activityLogTable.id })
      .from(activityLogTable),
    db
      .select()
      .from(activityLogTable)
      .where(isNotNull(activityLogTable.logHash))
      // seq ASC: monotonic insertion order, consistent with seq DESC in
      // insertActivityLog's predecessor lookup. Deterministic even under
      // timestamp ties.
      .orderBy(asc(activityLogTable.seq)),
  ]);

  const total = allRows.length;
  const hashableCount = hashableRows.length;

  let tampered = 0;
  let expectedPrev: string | null = null;
  let headHash: string | null = null;

  for (const row of hashableRows) {
    // Check 1: stored prevLogHash must match expected predecessor from walk.
    const prevLinkOk = row.prevLogHash === expectedPrev;

    // Check 2: re-derive logHash from stored fields + expectedPrev (not stored
    // prevLogHash, which may be tampered). Catches any field-level modification.
    const expectedHash = buildLogHash({
      type: row.type,
      interactionId: row.interactionId,
      summary: row.summary,
      createdAt: row.createdAt,
      prevLogHash: expectedPrev,
    });
    const hashOk = row.logHash === expectedHash;

    if (!prevLinkOk || !hashOk) {
      tampered++;
    }

    expectedPrev = row.logHash;
    headHash = row.logHash;
  }

  const intact = tampered === 0;

  res.json({
    total,
    hashableEntries: hashableCount,
    intact,
    tampered,
    headHash,
    verifiedAt: new Date().toISOString(),
  });
});

export default router;

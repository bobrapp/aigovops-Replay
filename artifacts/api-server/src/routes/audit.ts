/**
 * Audit log integrity endpoints — admin-only.
 *
 * GET /audit/chain-status
 *   Walks every activity_log row that has a logHash (post-migration rows) in
 *   strict deterministic order (created_at ASC, id ASC) and validates each
 *   entry in two ways:
 *
 *   1. Link check: row.prevLogHash must equal the expectedPrev accumulated
 *      from the walk (NULL for the genesis entry). A mismatch means a row was
 *      inserted out of order, or its prevLogHash column was tampered.
 *
 *   2. Hash check: the logHash is re-derived from the row's own stored fields
 *      (type, interactionId, summary, createdAt) plus the expected prevLogHash
 *      from the walk. Any field-level tampering or hash substitution is caught.
 *
 *   Either failure increments the tampered counter.
 *
 *   Ordering: ORDER BY created_at ASC, id ASC matches the predecessor lookup
 *   in insertActivityLog (ORDER BY … DESC) making the walk deterministic even
 *   if two rows share the same millisecond-precision timestamp.
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
      // Deterministic ordering: created_at primary, id as tie-breaker.
      // Matches the DESC version used in insertActivityLog's predecessor lookup.
      .orderBy(asc(activityLogTable.createdAt), asc(activityLogTable.id)),
  ]);

  const total = allRows.length;
  const hashableCount = hashableRows.length;

  let tampered = 0;
  let expectedPrev: string | null = null;
  let headHash: string | null = null;

  for (const row of hashableRows) {
    // Check 1: the stored prevLogHash must match the expected predecessor from
    // the chain walk. Detects out-of-order insertion or prevLogHash tampering.
    const prevLinkOk = row.prevLogHash === expectedPrev;

    // Check 2: re-derive the logHash from the row's own stored fields using
    // expectedPrev (the authoritative predecessor from the walk, not the
    // potentially-tampered stored prevLogHash). Detects field-level tampering
    // or hash substitution.
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

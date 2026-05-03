/**
 * Audit log integrity endpoints — admin-only.
 *
 * GET /audit/chain-status
 *   Walks every activity_log row that has a logHash (post-migration rows) in
 *   strict deterministic order (created_at ASC, id ASC) and re-derives each
 *   entry's expected logHash from its stored fields + the expected prevLogHash
 *   accumulated from the chain walk. Any mismatch — tampered data field,
 *   deleted row, reordered entry, or modified hash — increments the tampered
 *   counter.
 *
 *   Ordering: ORDER BY created_at ASC, id ASC matches the predecessor lookup
 *   in insertActivityLog (ORDER BY … DESC), so the "last row" at insert time
 *   is always the "first row not yet seen" at verification time — making the
 *   walk deterministic even when two rows share the same millisecond-precision
 *   timestamp (which cannot happen under the advisory lock, but is safe if
 *   legacy rows have equal timestamps).
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
    const expectedHash = buildLogHash({
      type: row.type,
      interactionId: row.interactionId,
      summary: row.summary,
      createdAt: row.createdAt,
      prevLogHash: expectedPrev,
    });

    if (row.logHash !== expectedHash) {
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

/**
 * Audit log integrity endpoints — admin-only.
 *
 * GET /audit/chain-status
 *   Walks every activity_log row in chronological order and re-derives each
 *   entry's logHash from its stored fields + the expected prevLogHash from the
 *   chain walk. Any mismatch (tampered data, deleted row, reordered entry, or
 *   hash modification) increments the tampered counter.
 *
 *   Rows with NULL logHash are pre-migration legacy entries and are counted in
 *   `total` but excluded from `hashableEntries` and hash verification.
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
      .orderBy(asc(activityLogTable.createdAt)),
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

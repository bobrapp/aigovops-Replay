/**
 * Audit log integrity endpoints — admin-only.
 *
 * GET /audit/chain-status
 *   Walks every activity_log row in strict monotonic order (seq ASC — BIGSERIAL,
 *   assigned by PostgreSQL under the advisory lock at insert time) and validates
 *   each row as follows:
 *
 *   Phase 1 — pre-chain legacy rows: rows before the first hashed entry (those
 *   with NULL logHash that precede any hashed row by seq) are backward-compat
 *   legacy entries. They are counted in `total` but excluded from
 *   `hashableEntries` and the integrity check.
 *
 *   Phase 2 — chain verification: once the first hashed row is encountered,
 *   the chain walk begins. Every subsequent row (by seq) is checked:
 *
 *   a. NULL logHash AFTER chain start → tampered (a row that should have a
 *      hash does not; could indicate a delete-and-reinsert or NULL-out attack).
 *
 *   b. Link check: row.prevLogHash === expectedPrev (accumulated from the walk).
 *      Detects out-of-order insertion or prevLogHash column tampering.
 *
 *   c. Hash check: re-derive logHash from the row's own stored fields using
 *      expectedPrev (authoritative from walk, not stored prevLogHash). Detects
 *      any field-level modification or hash substitution.
 *
 *   Any failure in a/b/c increments the tampered counter.
 *
 *   Ordering by seq guarantees determinism even when two rows share the same
 *   microsecond-precision timestamp. seq is a BIGSERIAL assigned by PostgreSQL
 *   inside the same advisory-locked transaction as the insert, so seq order ==
 *   insertion order, always.
 *
 *   Protected behind requireAdminAuth — same cookie-based session as policy
 *   management routes.
 */

import { Router, type IRouter } from "express";
import { db, activityLogTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { requireAdminAuth } from "./admin";
import { buildLogHash } from "../lib/crypto";

const router: IRouter = Router();

router.get("/audit/chain-status", requireAdminAuth, async (_req, res) => {
  // Fetch ALL rows ordered by the monotonic seq column so we can detect
  // NULL-logHash gaps that appear after the chain has started.
  const allRows = await db
    .select()
    .from(activityLogTable)
    .orderBy(asc(activityLogTable.seq));

  const total = allRows.length;

  let tampered = 0;
  let expectedPrev: string | null = null;
  let headHash: string | null = null;
  let chainStarted = false;
  let hashableCount = 0;
  // Capped list of mismatched seq values for operator drilldown. Capped
  // because a fully-corrupted chain could otherwise produce an unbounded
  // response. The full count remains in `tampered`.
  const MISMATCH_LIMIT = 1000;
  const mismatchedSeqs: string[] = [];
  const recordTamper = (seq: bigint | string) => {
    tampered++;
    if (mismatchedSeqs.length < MISMATCH_LIMIT) {
      mismatchedSeqs.push(String(seq));
    }
  };

  for (const row of allRows) {
    if (!chainStarted) {
      if (row.logHash === null) {
        // Pre-chain legacy row — skip silently.
        continue;
      }
      // First hashed row: genesis entry. Chain starts here.
      chainStarted = true;
    }

    hashableCount++;

    // (a) NULL logHash after chain start → tampered entry.
    if (row.logHash === null) {
      recordTamper(row.seq);
      // Cannot advance expectedPrev — the chain is broken from here.
      continue;
    }

    // (b) Link check: stored prevLogHash must equal the expected predecessor.
    const prevLinkOk = row.prevLogHash === expectedPrev;

    // (c) Hash check: re-derive using expectedPrev (authoritative from walk).
    const expectedHash = buildLogHash({
      type: row.type,
      interactionId: row.interactionId,
      summary: row.summary,
      createdAt: row.createdAt,
      prevLogHash: expectedPrev,
    });
    const hashOk = row.logHash === expectedHash;

    if (!prevLinkOk || !hashOk) {
      recordTamper(row.seq);
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
    mismatchedSeqs,
    headHash,
    verifiedAt: new Date().toISOString(),
  });
});

export default router;

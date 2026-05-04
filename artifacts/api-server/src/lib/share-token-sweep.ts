/**
 * share-token-sweep.ts — periodic sweeper that physically removes expired
 * and revoked share_tokens rows so they cannot accumulate indefinitely.
 *
 * Tasks #42 (auto-expiry) and #44 (owner revocation) together:
 *   • A row whose `expires_at < now() - INTERVAL 'GRACE_HOURS hours'` is
 *     deleted. The grace window keeps recently-expired rows around so that
 *     a clock-skew client briefly seeing 410 (expired) can be diagnosed
 *     before the row disappears entirely (404).
 *   • A row whose `revoked_at IS NOT NULL` AND
 *     `revoked_at < now() - INTERVAL 'GRACE_HOURS hours'` is also deleted.
 *     This means the public /verify endpoint sees revoked tokens as 404
 *     immediately (per #44 contract); the physical row goes away later.
 *
 * Mirrors the in-process worker pattern from webhook-worker.ts:
 *   • startShareTokenSweepWorker() registers a setInterval and returns the
 *     handle so callers (or tests) can clear it.
 *   • runShareTokenSweep() is exported so tests can drive it deterministically
 *     without waiting on the interval.
 *   • Polling cadence is configurable via SHARE_TOKEN_SWEEP_INTERVAL_MS
 *     (default 1 hour).
 *   • Setting the interval to 0 (or any non-positive number) disables the
 *     periodic worker entirely — used by the e2e test harness so the sweeper
 *     never fires unexpectedly during a test run.
 */

import { db, shareTokensTable } from "@workspace/db";
import { sql, or, and, isNotNull, lt } from "drizzle-orm";
import { logger } from "./logger";

const SWEEP_INTERVAL_MS = Number(
  process.env["SHARE_TOKEN_SWEEP_INTERVAL_MS"] ?? 60 * 60 * 1000,
);
const GRACE_HOURS = Number(process.env["SHARE_TOKEN_GRACE_HOURS"] ?? 24);

/**
 * Run a single sweep pass.  Returns the number of rows deleted.
 * Exported so tests can call it directly without going through setInterval.
 */
export async function runShareTokenSweep(): Promise<number> {
  // Cutoff = now() - GRACE_HOURS hours, computed in JS so the test can
  // monkey-patch Date.now without depending on the database clock.
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);

  const result = await db
    .delete(shareTokensTable)
    .where(
      or(
        // Long-expired rows
        lt(shareTokensTable.expiresAt, cutoff),
        // Revoked rows past the grace window
        and(
          isNotNull(shareTokensTable.revokedAt),
          lt(shareTokensTable.revokedAt, cutoff),
        ),
      ),
    )
    .returning({ id: shareTokensTable.id });

  const deleted = result.length;
  if (deleted > 0) {
    logger.info({ deleted, cutoff: cutoff.toISOString() }, "share-token sweep removed rows");
  }
  return deleted;
}

/**
 * Start the periodic share-token sweeper.
 * Call exactly once at server startup. Returns null when the interval is
 * configured to zero (sweeper disabled, used by tests).
 *
 * Uses setInterval rather than a recursive setTimeout because the SQL is
 * a single DELETE — there's no risk of a runaway long-running sweep
 * stacking calls.
 */
export function startShareTokenSweepWorker(): NodeJS.Timeout | null {
  if (!Number.isFinite(SWEEP_INTERVAL_MS) || SWEEP_INTERVAL_MS <= 0) {
    logger.info("share-token sweep worker disabled (SHARE_TOKEN_SWEEP_INTERVAL_MS <= 0)");
    return null;
  }
  // Avoid surfacing sql/logger noise from the very first sweep — fire it
  // off but don't block boot.
  void runShareTokenSweep().catch((err) =>
    logger.error({ err }, "share-token sweep initial run failed"),
  );
  logger.info({ intervalMs: SWEEP_INTERVAL_MS, graceHours: GRACE_HOURS }, "share-token sweep worker started");
  const handle = setInterval(() => {
    void runShareTokenSweep().catch((err) =>
      logger.error({ err }, "share-token sweep poll failed"),
    );
  }, SWEEP_INTERVAL_MS);
  // Don't keep the event loop alive solely for this interval — the http
  // server is the canonical liveness anchor.
  if (typeof handle.unref === "function") handle.unref();
  return handle;
}

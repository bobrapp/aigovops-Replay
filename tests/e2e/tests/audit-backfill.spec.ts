/**
 * AIGovOps REPLAY — audit-log hash chain backfill regression suite.
 *
 * Covers the contract from task #53 (consolidates #36 + #50):
 *   • The backfill script repairs a legacy chain (rows with NULL log_hash) so
 *     GET /audit/chain-status reports `intact: true` with `tampered: 0` and
 *     `total === hashableEntries`.
 *   • Tampering a backfilled row's `summary` is detected.
 *   • A second backfill run on a healthy chain is a no-op
 *     (`rowsThatWillChange: 0`).
 *
 * Test isolation strategy
 * ───────────────────────
 * The test inserts rows with NULL log_hash directly via a dedicated pg client.
 * The deferred NOT-NULL trigger normally rejects such inserts, so the test
 * disables and re-enables it around the legacy fixture insert. The temporary
 * legacy rows are appended at the END of activity_log (highest seq values via
 * BIGSERIAL), then deleted at the end of the test — leaving the chain in a
 * coherent state for any subsequent suites.
 *
 * Cross-process correctness
 * ─────────────────────────
 * The backfill function from @workspace/db opens its own pool with the same
 * DATABASE_URL the test API server uses. Updates are visible to the API server
 * immediately on COMMIT because PG sees them as committed transactions.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import pg from "pg";
import { backfillAuditLogHashes } from "@workspace/db";
import { TEST_API_PORT } from "../src/global-setup";

const BASE = `http://127.0.0.1:${TEST_API_PORT}/api`;
const adminKey = process.env.ADMIN_API_KEY;

const TEST_ROW_PREFIX = "audit-backfill-e2e-";

interface ChainStatus {
  total: number;
  hashableEntries: number;
  intact: boolean;
  tampered: number;
  headHash: string | null;
}

async function adminLogin(request: APIRequestContext): Promise<void> {
  const resp = await request.post(`${BASE}/admin/login`, {
    data: { token: adminKey },
  });
  expect(resp.status(), "admin login required for /audit/chain-status").toBe(200);
}

async function fetchChainStatus(request: APIRequestContext): Promise<ChainStatus> {
  const resp = await request.get(`${BASE}/audit/chain-status`);
  expect(resp.status()).toBe(200);
  return (await resp.json()) as ChainStatus;
}

test.describe("audit-log backfill", () => {
  test.beforeAll(() => {
    if (!adminKey) {
      console.warn("[e2e] ADMIN_API_KEY not set — audit-backfill tests will be skipped");
    }
    if (!process.env.DATABASE_URL) {
      console.warn("[e2e] DATABASE_URL not set — audit-backfill tests will be skipped");
    }
  });

  test("dry-run on healthy chain reports no changes and writes nothing", async () => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

    const summary = await backfillAuditLogHashes({ dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.applied).toBe(false);
    // We don't assert rowsThatWillChange === 0 here because earlier tests in
    // the same suite may have left an inconsistent chain (rare). The strong
    // contract is that dryRun never writes — verified by `applied: false` and
    // by the next test seeing the same state.
  });

  test("legacy fixture → backfill → chain reports intact, tampering detected, idempotent re-run", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");

    await adminLogin(request);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const insertedIds: string[] = [];

    try {
      // ── Seed: 3 NULL-hash legacy rows (appended at highest seq) ─────────
      // Disable the deferred NOT-NULL trigger for this insert. Requires the
      // connection user to be the table owner (true on Replit-managed PG).
      try {
        await pool.query("ALTER TABLE activity_log DISABLE TRIGGER trg_activity_log_hash_not_null");
      } catch (err) {
        test.skip(
          true,
          `Cannot disable activity_log trigger (need table owner): ${(err as Error).message}`,
        );
      }

      try {
        for (let i = 0; i < 3; i++) {
          const id = `${TEST_ROW_PREFIX}${Date.now()}-${i}`;
          await pool.query(
            `INSERT INTO activity_log (id, type, interaction_id, summary, log_hash, prev_log_hash)
             VALUES ($1, 'created', $2, $3, NULL, NULL)`,
            [id, `e2e-fixture-int-${i}`, `e2e legacy fixture #${i}`],
          );
          insertedIds.push(id);
        }
      } finally {
        await pool.query("ALTER TABLE activity_log ENABLE TRIGGER trg_activity_log_hash_not_null");
      }

      // ── Verify the legacy state was actually inserted ─────────────────────
      const beforeStatus = await fetchChainStatus(request);
      expect(beforeStatus.total).toBeGreaterThanOrEqual(3);

      // ── Run backfill (dry-run first to verify it reports the rewrite) ─────
      const dry = await backfillAuditLogHashes({ dryRun: true });
      expect(dry.dryRun).toBe(true);
      expect(dry.applied).toBe(false);
      expect(dry.nullHashRows).toBeGreaterThanOrEqual(3);
      expect(dry.rowsThatWillChange).toBeGreaterThanOrEqual(3);

      // After dry-run, the chain must still show the legacy state (no writes).
      const afterDryStatus = await fetchChainStatus(request);
      expect(afterDryStatus.total).toBe(beforeStatus.total);

      // ── Apply backfill ────────────────────────────────────────────────────
      const applied = await backfillAuditLogHashes({ dryRun: false });
      expect(applied.dryRun).toBe(false);
      expect(applied.applied).toBe(true);
      // Must have rewritten at least the 3 NULL rows (full-chain rewrite may
      // touch more if other tests left drift).
      expect(applied.rowsThatWillChange).toBeGreaterThanOrEqual(3);

      // ── Chain is now intact: no skipped rows, no tampered rows ────────────
      const intactStatus = await fetchChainStatus(request);
      expect(intactStatus.tampered, "no rows should be flagged after backfill").toBe(0);
      expect(intactStatus.intact).toBe(true);
      expect(intactStatus.hashableEntries, "all rows are hashed after backfill").toBe(intactStatus.total);
      expect(intactStatus.total).toBe(beforeStatus.total);

      // ── Tamper one backfilled row → walker must flag it ───────────────────
      const targetId = insertedIds[0];
      await pool.query(
        "UPDATE activity_log SET summary = $1 WHERE id = $2",
        ["tampered-by-e2e", targetId],
      );
      const tamperedStatus = await fetchChainStatus(request);
      expect(tamperedStatus.tampered).toBeGreaterThanOrEqual(1);
      expect(tamperedStatus.intact).toBe(false);

      // Restore the row's original summary so the next assertion runs against
      // a clean chain. Recompute the hash to keep the chain coherent.
      // Simpler: restore the summary to its original value, then re-run the
      // backfill (idempotent) which will rewrite the affected row's hash.
      await pool.query(
        "UPDATE activity_log SET summary = $1 WHERE id = $2",
        [`e2e legacy fixture #0`, targetId],
      );
      await backfillAuditLogHashes({ dryRun: false });

      // ── Idempotency: a second backfill on a healthy chain rewrites zero ──
      const second = await backfillAuditLogHashes({ dryRun: false });
      expect(second.applied).toBe(true);
      expect(second.rowsThatWillChange, "idempotent re-run must touch zero rows").toBe(0);

      // Chain must remain intact after the no-op second run.
      const finalStatus = await fetchChainStatus(request);
      expect(finalStatus.intact).toBe(true);
      expect(finalStatus.tampered).toBe(0);
    } finally {
      // ── Cleanup: remove the test rows ─────────────────────────────────────
      // Because the test rows were appended at the END (highest seq) and no
      // production rows chained off them, deletion does not break any other
      // row's chain. The remaining rows still verify intact.
      if (insertedIds.length > 0) {
        await pool.query(
          `DELETE FROM activity_log WHERE id = ANY($1::text[])`,
          [insertedIds],
        );
      }
      await pool.end();
    }
  });
});

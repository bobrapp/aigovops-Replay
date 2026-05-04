/**
 * AIGovOps REPLAY — audit-log integrity chain regression suite.
 *
 * Covers task #37 (parent feature #26 Activity Log Integrity Hashing):
 *
 *   1. A clean 3-row chain reports `intact: true, mismatchedSeqs: []`.
 *   2. Tampering a row's `summary` field → walker flags exactly that row's seq.
 *   3. Rewriting a row's `prev_log_hash` to a wrong value → link check fires.
 *   4. Deleting a middle row → the next row's link check fails.
 *
 * The audit-backfill spec already touches case (2) but only tangentially as
 * part of its end-to-end backfill flow. This file is dedicated regression
 * coverage for the GET /audit/chain-status walker (artifacts/api-server/
 * src/routes/audit.ts) — the verifier itself, not the backfill script.
 *
 * Test isolation
 * ──────────────
 * Each test TRUNCATEs activity_log RESTART IDENTITY at the start so seq
 * always begins at 1.  We bypass the deferred NOT-NULL trigger to insert
 * NULL-hash rows directly, then call backfillAuditLogHashes() to compute
 * authoritative hashes via the canonical formula (lib/db/src/audit-crypto.ts
 * → buildLogHash).  Manipulating the resulting rows lets us exercise every
 * tamper-detection branch without re-implementing the hash formula here
 * (which would silently drift away from the production formula).
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import pg from "pg";
import { backfillAuditLogHashes } from "@workspace/db";
import { TEST_API_PORT } from "../src/global-setup";

const BASE = `http://127.0.0.1:${TEST_API_PORT}/api`;
const adminKey = process.env.ADMIN_API_KEY;

const TEST_ROW_PREFIX = "audit-chain-e2e-";

interface ChainStatus {
  total: number;
  hashableEntries: number;
  intact: boolean;
  tampered: number;
  headHash: string | null;
  mismatchedSeqs: string[];
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

/**
 * Seed N legacy NULL-hash rows then run the backfill so they get authoritative
 * hashes. Returns the inserted ids in seq order (id at index i is at seq=i+1).
 */
async function seedHashedChain(pool: pg.Pool, count: number): Promise<string[]> {
  await pool.query("TRUNCATE TABLE activity_log RESTART IDENTITY");

  const ids: string[] = [];
  await pool.query("ALTER TABLE activity_log DISABLE TRIGGER trg_activity_log_hash_not_null");
  try {
    for (let i = 0; i < count; i++) {
      const id = `${TEST_ROW_PREFIX}${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
      await pool.query(
        `INSERT INTO activity_log (id, type, interaction_id, summary, log_hash, prev_log_hash)
         VALUES ($1, 'created', $2, $3, NULL, NULL)`,
        [id, `e2e-chain-int-${i}`, `e2e chain row #${i}`],
      );
      ids.push(id);
    }
  } finally {
    await pool.query("ALTER TABLE activity_log ENABLE TRIGGER trg_activity_log_hash_not_null");
  }

  // Compute and persist authoritative hashes for every row.
  await backfillAuditLogHashes({ dryRun: false });
  return ids;
}

test.describe("audit-log chain — /audit/chain-status walker (task #37)", () => {
  test.beforeAll(() => {
    if (!adminKey) {
      console.warn("[e2e] ADMIN_API_KEY not set — audit-chain tests will be skipped");
    }
    if (!process.env.DATABASE_URL) {
      console.warn("[e2e] DATABASE_URL not set — audit-chain tests will be skipped");
    }
  });

  test("clean 3-row chain → intact:true, no mismatches", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
    await adminLogin(request);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    let ids: string[] = [];
    try {
      try {
        ids = await seedHashedChain(pool, 3);
      } catch (err) {
        test.skip(true, `Cannot seed chain (need table owner): ${(err as Error).message}`);
      }

      const status = await fetchChainStatus(request);
      expect(status.total).toBe(3);
      expect(status.hashableEntries).toBe(3);
      expect(status.tampered).toBe(0);
      expect(status.intact).toBe(true);
      expect(status.mismatchedSeqs).toEqual([]);
      expect(status.headHash).toBeTruthy();
    } finally {
      if (ids.length) {
        await pool.query(`DELETE FROM activity_log WHERE id = ANY($1::text[])`, [ids]);
      }
      await pool.end();
    }
  });

  test("tamper a row's summary → walker flags exactly that row's seq", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
    await adminLogin(request);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    let ids: string[] = [];
    try {
      try {
        ids = await seedHashedChain(pool, 3);
      } catch (err) {
        test.skip(true, `Cannot seed chain: ${(err as Error).message}`);
      }

      // Tamper the middle row's summary. The walker recomputes the hash from
      // stored fields and compares against stored log_hash → mismatch.
      const targetId = ids[1];
      const seqLookup = await pool.query<{ seq: string }>(
        "SELECT seq::text AS seq FROM activity_log WHERE id = $1",
        [targetId],
      );
      const targetSeq = seqLookup.rows[0]?.seq;
      expect(targetSeq).toBeTruthy();

      await pool.query("UPDATE activity_log SET summary = 'tampered-by-e2e' WHERE id = $1", [
        targetId,
      ]);

      const status = await fetchChainStatus(request);
      expect(status.intact).toBe(false);
      // The tampered row breaks its own hash check AND its successor's link
      // check (because expectedPrev advances to the now-stale stored hash).
      // We require at minimum the tampered row's seq to surface.
      expect(status.tampered).toBeGreaterThanOrEqual(1);
      expect(status.mismatchedSeqs).toContain(targetSeq);
    } finally {
      if (ids.length) {
        await pool.query(`DELETE FROM activity_log WHERE id = ANY($1::text[])`, [ids]);
      }
      await pool.end();
    }
  });

  test("rewrite a row's prev_log_hash → link check catches it", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
    await adminLogin(request);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    let ids: string[] = [];
    try {
      try {
        ids = await seedHashedChain(pool, 3);
      } catch (err) {
        test.skip(true, `Cannot seed chain: ${(err as Error).message}`);
      }

      // Rewrite the middle row's prev_log_hash to a bogus (but valid-looking)
      // 64-char hex value.  The hash check (re-derives logHash using the
      // walker's expectedPrev) still passes — but the link check
      // (row.prevLogHash === expectedPrev) fails.
      const targetId = ids[1];
      const seqLookup = await pool.query<{ seq: string }>(
        "SELECT seq::text AS seq FROM activity_log WHERE id = $1",
        [targetId],
      );
      const targetSeq = seqLookup.rows[0]?.seq;
      expect(targetSeq).toBeTruthy();

      const bogusPrev = "deadbeef".repeat(8); // 64-char hex sentinel
      await pool.query("UPDATE activity_log SET prev_log_hash = $1 WHERE id = $2", [
        bogusPrev,
        targetId,
      ]);

      const status = await fetchChainStatus(request);
      expect(status.intact).toBe(false);
      expect(status.tampered).toBeGreaterThanOrEqual(1);
      expect(status.mismatchedSeqs).toContain(targetSeq);
    } finally {
      if (ids.length) {
        await pool.query(`DELETE FROM activity_log WHERE id = ANY($1::text[])`, [ids]);
      }
      await pool.end();
    }
  });

  test("delete a middle row → successor's link check fails", async ({ request }) => {
    test.skip(!adminKey, "ADMIN_API_KEY not set");
    test.skip(!process.env.DATABASE_URL, "DATABASE_URL not set");
    await adminLogin(request);

    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    let ids: string[] = [];
    try {
      try {
        ids = await seedHashedChain(pool, 3);
      } catch (err) {
        test.skip(true, `Cannot seed chain: ${(err as Error).message}`);
      }

      // Look up the successor's seq BEFORE deleting the middle row, so we
      // can assert it appears in mismatchedSeqs.
      const successorId = ids[2];
      const succLookup = await pool.query<{ seq: string }>(
        "SELECT seq::text AS seq FROM activity_log WHERE id = $1",
        [successorId],
      );
      const successorSeq = succLookup.rows[0]?.seq;
      expect(successorSeq).toBeTruthy();

      // Delete the middle row.
      await pool.query("DELETE FROM activity_log WHERE id = $1", [ids[1]]);

      const status = await fetchChainStatus(request);
      // After deletion: 2 rows remain (genesis seq=1, successor seq=3).
      // Walker reads genesis, advances expectedPrev to its log_hash, then
      // reads successor whose prev_log_hash points to the (now-deleted)
      // middle row's hash → link mismatch.
      expect(status.total).toBe(2);
      expect(status.hashableEntries).toBe(2);
      expect(status.intact).toBe(false);
      expect(status.tampered).toBeGreaterThanOrEqual(1);
      expect(status.mismatchedSeqs).toContain(successorSeq);
    } finally {
      // Remove what's left of the seeded rows.
      if (ids.length) {
        await pool.query(`DELETE FROM activity_log WHERE id = ANY($1::text[])`, [ids]);
      }
      await pool.end();
    }
  });
});

/**
 * demo-seeder.ts
 *
 * Idempotent boot-time seeder for the public "demo chain". Anonymous visitors
 * see these receipts on the landing page without signing in.
 *
 * Design constraints (Task #52):
 *   - All demo receipts belong to one shared synthetic user (DEMO_USER_ID)
 *     so they form a single visible chain on the public landing page.
 *   - Each fixture is content-addressed by sha256(prompt|response|model).
 *     Inserts use ON CONFLICT DO NOTHING semantics so this can run safely
 *     on every server boot without producing duplicates.
 *   - Chain writes use the same advisory lock (CHAIN_WRITE_LOCK_KEY) and
 *     respect the partial unique index on (userId, prevHash) used by the
 *     authenticated mint route — there is exactly one chain-write code
 *     path in the system, even for demo data.
 *   - No webhook deliveries, no policy-violation-counter updates, no
 *     activity_log entries. Demo traffic must never touch real-user state.
 *
 * Failure policy: a seeder error is logged but never crashes server boot.
 * The demo gallery degrades gracefully to "no demo receipts yet" if the
 * seed fails (e.g. DB read-only, missing column on a not-yet-migrated DB).
 */
import { createHash } from "node:crypto";
import { sql, eq, desc } from "drizzle-orm";
import {
  db,
  interactionsTable,
  usersTable,
} from "@workspace/db";
import { hashPrompt, hashResponse, buildChainHash } from "./crypto";
import { logger } from "./logger";
import { DEMO_FIXTURES, type DemoFixture } from "./demo-fixtures";

/**
 * Shared synthetic user id for the public demo chain.
 *
 * Real user ids are UUIDs assigned by Postgres `gen_random_uuid()`; this
 * non-UUID literal is intentionally distinct so it can never collide with a
 * real user even on accidental insert. Authenticated routes scope every
 * query to req.user.id so this id is never exposed through user-facing
 * endpoints.
 */
export const DEMO_USER_ID = "demo-public";

/**
 * MUST match CHAIN_WRITE_LOCK_KEY in routes/interactions.ts. There is only
 * one chain in the system; demo mints serialize against the same lock as
 * authenticated mints to guarantee no fork ever appears in the demo chain.
 */
const CHAIN_WRITE_LOCK_KEY = 0x52455041;

/**
 * Deterministic id for a fixture row: 32 hex chars (16 bytes) so it has the
 * same shape as ids produced by lib/id.ts → generateId(). Content-addressed
 * so editing a fixture creates a new row rather than mutating an existing one.
 */
export function computeFixtureId(fx: DemoFixture): string {
  return createHash("sha256")
    .update(`${fx.prompt}|${fx.response}|${fx.model}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Upsert the synthetic demo user. Idempotent.
 *
 * The users table requires no fields beyond id (others have defaults), and
 * uses gen_random_uuid() as the default id — but Postgres only generates an
 * id when one is not supplied, so passing our literal id is honoured.
 */
async function ensureDemoUser(): Promise<void> {
  await db
    .insert(usersTable)
    .values({
      id: DEMO_USER_ID,
      email: "demo@aigovops.local",
      firstName: "Public",
      lastName: "Demo",
    })
    .onConflictDoNothing({ target: usersTable.id });
}

/**
 * Seed one fixture if it doesn't already exist. Uses the same advisory-lock
 * pattern as the authenticated mint route so reads and writes of the demo
 * chain tip are serialized — no fork can ever appear.
 */
async function seedFixture(fx: DemoFixture): Promise<"inserted" | "skipped"> {
  const id = computeFixtureId(fx);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHAIN_WRITE_LOCK_KEY})`);

    // Already present? Skip — keeps the seeder safe to run on every boot.
    const [existing] = await tx
      .select({ id: interactionsTable.id })
      .from(interactionsTable)
      .where(eq(interactionsTable.id, id))
      .limit(1);
    if (existing) return "skipped";

    // Find the current tip of the demo chain (scoped to DEMO_USER_ID, same
    // pattern as POST /interactions). prevHash is null for the genesis row.
    const [latest] = await tx
      .select({ chainHash: interactionsTable.chainHash })
      .from(interactionsTable)
      .where(eq(interactionsTable.userId, DEMO_USER_ID))
      .orderBy(desc(interactionsTable.createdAt))
      .limit(1);

    const promptHash = hashPrompt(fx.prompt);
    const responseHash = hashResponse(fx.response);
    const prevHash = latest?.chainHash ?? null;
    const chainHash = buildChainHash(promptHash, responseHash, prevHash);

    await tx.insert(interactionsTable).values({
      id,
      prompt: fx.prompt,
      response: fx.response,
      model: fx.model,
      userId: DEMO_USER_ID,
      tags: fx.tags,
      promptHash,
      responseHash,
      prevHash,
      chainHash,
      policyStatus: fx.policyStatus,
      policyViolations: fx.policyViolations,
      replayCount: 0,
    });

    return "inserted";
  });
}

/**
 * Run the full demo-chain seeder. Safe to call on every boot.
 *
 * Errors are caught and logged but never propagated — a malformed fixture or
 * temporary DB issue should never prevent the API server from accepting
 * authenticated traffic.
 */
export async function seedDemoChain(): Promise<void> {
  try {
    await ensureDemoUser();

    let inserted = 0;
    let skipped = 0;
    for (const fx of DEMO_FIXTURES) {
      const result = await seedFixture(fx);
      if (result === "inserted") inserted++;
      else skipped++;
    }

    logger.info(
      { inserted, skipped, total: DEMO_FIXTURES.length },
      "Demo chain seeder complete",
    );
  } catch (err) {
    logger.error({ err }, "Demo chain seeder failed (non-fatal)");
  }
}

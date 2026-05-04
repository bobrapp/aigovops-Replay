/**
 * audit-log-backfill — operator CLI wrapper around backfillAuditLogHashes.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run backfill:audit-log -- --dry-run
 *   pnpm --filter @workspace/scripts run backfill:audit-log
 *
 * --dry-run reports what WOULD change without writing or lowering the trigger
 *           cutoff. Always run dry-run first on production.
 *
 * No flag: runs the backfill, rewriting any drifted rows and lowering the
 *           legacy_cutoff to 0 so all future inserts must carry a non-null
 *           log_hash. Idempotent — re-running on a healthy chain is a no-op.
 *
 * The actual backfill logic lives in @workspace/db/src/audit-log-backfill.ts
 * so the same function is callable from regression tests.
 */
import { backfillAuditLogHashes } from "@workspace/db";

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  console.log(`[audit-backfill] Starting (dryRun=${dryRun})…`);
  const t0 = Date.now();
  const summary = await backfillAuditLogHashes({ dryRun });
  const ms = Date.now() - t0;

  console.log(`[audit-backfill] Done in ${ms}ms`);
  console.log(`  totalRows         : ${summary.totalRows}`);
  console.log(`  nullHashRows      : ${summary.nullHashRows}`);
  console.log(`  nullMinSeq        : ${summary.nullMinSeq ?? "—"}`);
  console.log(`  nullMaxSeq        : ${summary.nullMaxSeq ?? "—"}`);
  console.log(`  legacyCutoff      : ${summary.legacyCutoff}`);
  console.log(`  rowsThatWillChange: ${summary.rowsThatWillChange}`);
  console.log(`  firstChangedSeq   : ${summary.firstChangedSeq ?? "—"}`);
  console.log(`  lastChangedSeq    : ${summary.lastChangedSeq ?? "—"}`);
  console.log(`  dryRun            : ${summary.dryRun}`);
  console.log(`  applied           : ${summary.applied}`);

  if (summary.dryRun) {
    console.log(`\n[audit-backfill] Dry run only — no changes written.`);
    if (summary.rowsThatWillChange > 0) {
      console.log(`[audit-backfill] Re-run without --dry-run to apply.`);
    } else {
      console.log(`[audit-backfill] Chain is already healthy; nothing to do.`);
    }
  } else {
    if (summary.rowsThatWillChange > 0) {
      console.log(
        `\n[audit-backfill] Backfill complete: rewrote ${summary.rowsThatWillChange} row(s).`,
      );
    } else {
      console.log(
        `\n[audit-backfill] Backfill complete: chain was already healthy. ` +
          `Trigger cutoff has been (re-)pinned to 0.`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("[audit-backfill] Failed:", err);
    process.exit(1);
  });

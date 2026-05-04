/**
 * audit-crypto — canonical hash helpers shared by every code path that touches
 * the activity_log integrity chain.
 *
 * This module is the single source of truth for the activity_log hash formula.
 * Both the runtime insert path (artifacts/api-server/src/lib/activity-log.ts)
 * and the offline backfill script (scripts/src/audit-log-backfill.ts) MUST
 * import buildLogHash from here. Re-implementing the formula in either place
 * would silently corrupt verification the moment one definition drifts.
 *
 * Lives in @workspace/db (rather than the api-server) because both consumers
 * import @workspace/db already, and per repo policy artifacts/* may not import
 * from each other — so a shared lib is the only place a script can reach.
 */
import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Derive the integrity hash for an activity_log entry.
 *
 * Formula: sha256("log:" + type + ":" + interactionId + ":" + summary
 *                  + ":" + createdAt.toISOString() + ":" + (prevLogHash || "GENESIS"))
 *
 * Including createdAt binds the entry to its recorded timestamp; including
 * prevLogHash chains it to its predecessor so deletion or reordering of any
 * entry invalidates every subsequent hash.
 *
 * The genesis row (lowest seq in the table) MUST receive prevLogHash = null
 * here so the literal "GENESIS" sentinel is folded in. Never pass an empty
 * string or the literal "null".
 */
export function buildLogHash(params: {
  type: string;
  interactionId: string;
  summary: string;
  createdAt: Date;
  prevLogHash: string | null;
}): string {
  const prev = params.prevLogHash ?? "GENESIS";
  return sha256(
    `log:${params.type}:${params.interactionId}:${params.summary}:${params.createdAt.toISOString()}:${prev}`,
  );
}

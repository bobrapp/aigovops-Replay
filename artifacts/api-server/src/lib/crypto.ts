import { createHash } from "crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashPrompt(prompt: string): string {
  return sha256(`prompt:${prompt}`);
}

export function hashResponse(response: string): string {
  return sha256(`response:${response}`);
}

export function buildChainHash(promptHash: string, responseHash: string, prevHash: string | null): string {
  const prev = prevHash ?? "GENESIS";
  return sha256(`chain:${promptHash}:${responseHash}:${prev}`);
}

/**
 * Derive the integrity hash for an activity_log entry.
 *
 * Formula: sha256("log:" + type + ":" + interactionId + ":" + summary
 *                  + ":" + createdAt.toISOString() + ":" + prevLogHash|"GENESIS")
 *
 * Including createdAt in the hash binds each entry to its recorded timestamp,
 * making it impossible to silently alter the time of an audit event without
 * breaking the hash. Including prevLogHash chains each entry to its predecessor,
 * so deletion or reordering of any entry invalidates all subsequent hashes.
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

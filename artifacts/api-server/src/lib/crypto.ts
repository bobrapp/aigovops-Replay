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

/**
 * Compute the chain hash that links one receipt to the next.
 *
 * userId is included so that two different users who mint a receipt with
 * identical prompt and response content (including identical prevHash, e.g.
 * both at genesis) always produce distinct chain hashes. Without userId the
 * hash was purely content-addressed: a global unique index on chainHash would
 * cause the second user's insert to fail with a constraint violation, allowing
 * an attacker to pre-mint common first-receipts and block other users.
 *
 * Each user's chain is structurally independent; their hashes cannot collide
 * with another user's hashes regardless of content overlap.
 */
export function buildChainHash(
  promptHash: string,
  responseHash: string,
  prevHash: string | null,
  userId: string,
): string {
  const prev = prevHash ?? "GENESIS";
  return sha256(`chain:${promptHash}:${responseHash}:${prev}:user:${userId}`);
}

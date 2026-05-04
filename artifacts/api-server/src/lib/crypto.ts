// sha256 + buildLogHash are defined in @workspace/db so the same canonical
// hash formula is reachable from both the runtime insert path (this server)
// and the offline backfill script in @workspace/scripts (which cannot import
// from artifacts/*). Re-export them here so existing import sites keep working.
import { sha256, buildLogHash } from "@workspace/db";

export { sha256, buildLogHash };

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

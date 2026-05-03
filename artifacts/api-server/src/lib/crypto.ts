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

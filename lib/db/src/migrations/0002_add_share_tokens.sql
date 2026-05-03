-- share_tokens: short-lived HMAC tokens for public receipt verification links
CREATE TABLE IF NOT EXISTS "share_tokens" (
  "id" text PRIMARY KEY,
  "interaction_id" text NOT NULL,
  "user_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Index for fast lookup by interaction + token_hash during public verify
CREATE INDEX IF NOT EXISTS "share_tokens_interaction_id_idx" ON "share_tokens" ("interaction_id");

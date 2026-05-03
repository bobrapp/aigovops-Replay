-- Base schema snapshot for fresh installs.
-- All statements use CREATE … IF NOT EXISTS / DO $$ … IF NOT EXISTS so this
-- file is safe to replay on a database where some objects already exist.
--
-- activity_log includes the hash-chain columns (seq, prev_log_hash, log_hash)
-- so that fresh installs start with the full schema. The additive ALTER migration
-- 0001_add_activity_log_hash_chain.sql uses ADD COLUMN IF NOT EXISTS, making it
-- a no-op on fresh installs and an idempotent upgrade for existing databases.
-- Both paths end with an identical final schema.
DO $$ BEGIN
  CREATE TYPE "public"."activity_type" AS ENUM('created', 'replayed', 'verified', 'policy_check');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."policy_status" AS ENUM('pass', 'fail', 'pending', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_log" (
        "id" text PRIMARY KEY NOT NULL,
        "type" "activity_type" NOT NULL,
        "interaction_id" text NOT NULL,
        "summary" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "seq" bigserial,
        "prev_log_hash" text,
        "log_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interactions" (
        "id" text PRIMARY KEY NOT NULL,
        "prompt" text NOT NULL,
        "response" text NOT NULL,
        "model" text NOT NULL,
        "user_id" text NOT NULL,
        "tags" text[] DEFAULT '{}' NOT NULL,
        "prompt_hash" text NOT NULL,
        "response_hash" text NOT NULL,
        "prev_hash" text,
        "chain_hash" text NOT NULL,
        "policy_status" "policy_status" DEFAULT 'pending' NOT NULL,
        "policy_violations" text[] DEFAULT '{}' NOT NULL,
        "replay_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "policies" (
        "id" text PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "rule" text NOT NULL,
        "severity" "severity" DEFAULT 'medium' NOT NULL,
        "enabled" integer DEFAULT 1 NOT NULL,
        "violation_count" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
        "sid" varchar PRIMARY KEY NOT NULL,
        "sess" jsonb NOT NULL,
        "expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" varchar,
        "first_name" varchar,
        "last_name" varchar,
        "profile_image_url" varchar,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_user_chain_hash_unique" ON "interactions" USING btree ("user_id","chain_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "interactions_user_prev_hash_unique" ON "interactions" USING btree ("user_id","prev_hash") WHERE prev_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");

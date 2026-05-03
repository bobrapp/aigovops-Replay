CREATE TYPE "public"."activity_type" AS ENUM('created', 'replayed', 'verified', 'policy_check');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('pass', 'fail', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "activity_log" (
        "id" text PRIMARY KEY NOT NULL,
        "type" "activity_type" NOT NULL,
        "interaction_id" text NOT NULL,
        "summary" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "prev_log_hash" text,
        "log_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
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
CREATE TABLE "policies" (
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
CREATE TABLE "sessions" (
        "sid" varchar PRIMARY KEY NOT NULL,
        "sess" jsonb NOT NULL,
        "expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
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
CREATE UNIQUE INDEX "interactions_user_chain_hash_unique" ON "interactions" USING btree ("user_id","chain_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "interactions_user_prev_hash_unique" ON "interactions" USING btree ("user_id","prev_hash") WHERE prev_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");
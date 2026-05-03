-- webhook_endpoints: user-configured delivery targets for policy violation alerts
-- webhook_deliveries: per-delivery tracking with status, attempts, and retry schedule
--
-- Design notes:
--   - secret is stored plaintext (it is an HMAC key, not a password).
--   - enabled/email_alerts use integer (0/1) for SQLite test compatibility.
--   - payload TEXT stores the JSON payload so retries never re-derive it.
--   - The pending index covers the worker's polling query for due deliveries.

CREATE TYPE "webhook_event_filter" AS ENUM ('all', 'critical', 'high_and_critical');
CREATE TYPE "webhook_delivery_status" AS ENUM ('pending', 'delivered', 'failed');

CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL,
  "url" text NOT NULL,
  "secret" text,
  "enabled" integer NOT NULL DEFAULT 1,
  "event_filter" "webhook_event_filter" NOT NULL DEFAULT 'all',
  "email_alerts" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "webhook_endpoints_user_idx"
  ON "webhook_endpoints" ("user_id");

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" text PRIMARY KEY,
  "webhook_endpoint_id" text NOT NULL,
  "receipt_id" text NOT NULL,
  "status" "webhook_delivery_status" NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp,
  "next_retry_at" timestamp,
  "response_code" integer,
  "payload" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Partial index used by the delivery worker to quickly find due pending rows
CREATE INDEX IF NOT EXISTS "webhook_deliveries_pending_idx"
  ON "webhook_deliveries" ("next_retry_at")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_idx"
  ON "webhook_deliveries" ("webhook_endpoint_id");

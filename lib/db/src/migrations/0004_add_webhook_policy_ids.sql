-- Add policy_ids column to webhook_endpoints for policy-ID-based event filtering.
-- Stored as a JSON text array (e.g. '["policyId1","policyId2"]').
-- NULL means "use eventFilter severity-based matching" (existing behaviour).
-- Non-null overrides eventFilter and matches only violations against listed policies.
ALTER TABLE "webhook_endpoints"
  ADD COLUMN IF NOT EXISTS "policy_ids" text;

# 08 — Configurable email recipients for violation alerts

- **Priority:** URGENT
- **Source task:** #45
- **Parent feature:** #29 Policy Violation Webhooks & Alerts

## Why this matters

The webhook endpoint table already has an `email_alerts` boolean, but there is no UI to set per-endpoint email recipients and no actual email delivery. Customers expect "policy violated → email me" to work — webhooks alone are an integration story, not a baseline alert story.

## Done looks like

- Each webhook endpoint can be configured with one or more email addresses (validated, deduplicated, max 5 per endpoint).
- When a violating receipt fires, every enabled endpoint with a non-empty email list sends one email per recipient.
- Email delivery uses the same retry/backoff pattern as webhook delivery and writes to `webhook_deliveries` with a `kind: 'email'` discriminator (or a parallel `email_deliveries` table — pick one and document it).
- E2E test covers: configure recipient, mint violating receipt, assert email-send was attempted.

## Out of scope

- Email templating / branding (use a minimal plain-text template for v1).
- Daily digest emails.

## Approach

Use Replit's email integration (or SendGrid via integrations) — check `.local/skills/integrations` for the supported provider before picking a transport. Schema migration adds `email_recipients text[]` to `webhook_endpoints`.

## Files of interest

- `lib/db/src/schema/interactions.ts:176-189` (`webhook_endpoints`)
- `artifacts/api-server/src/lib/webhook-worker.ts`
- `lib/api-spec/openapi.yaml`

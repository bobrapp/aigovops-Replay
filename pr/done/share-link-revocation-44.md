# 03 — Owner-revocable share links

- **Priority:** CRITICAL
- **Source task:** #44
- **Parent feature:** #28 Public Verification Links & Chain Health

## Why this matters

Once an owner generates a public verification link, they have no way to invalidate it before its TTL expires. Real usage is going to include "I shared the wrong receipt" and "the recipient leaked the link" — both of which need a kill switch.

## Done looks like

- A new owner-only endpoint `DELETE /interactions/:id/share-tokens/:tokenId` removes a token row.
- The Share dialog on the receipt detail page lists the receipt's currently-active tokens and offers a Revoke action per token.
- Revoked tokens immediately return 404 from the public verify endpoint.
- E2E test covers: create token → public verify works → revoke → public verify returns 404.

## Out of scope

- Auto-expiry (covered by proposal 09).
- Revoking all of a user's tokens at once (future, if asked).

## Approach

The `share_tokens` table already keys on `interactionId` + `userId`; deletion is a single `DELETE WHERE id = $1 AND user_id = $session_user`. The list endpoint returns `id`, `createdAt`, `expiresAt` only — never the raw or hashed token.

## Files of interest

- `lib/db/src/schema/interactions.ts:133-150` (`share_tokens`)
- `artifacts/api-server/src/routes/` — share-token route handler
- `artifacts/aigovops/src/components/` — Share dialog
- `lib/api-spec/openapi.yaml`

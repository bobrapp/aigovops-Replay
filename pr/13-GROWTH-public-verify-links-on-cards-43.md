# 13 — Public verification links on receipt cards

- **Priority:** GROWTH (nice-to-have)
- **Source task:** #43
- **Parent feature:** #28 Public Verification Links & Chain Health

## Why this matters

Today, generating and copying a public verification link requires opening the receipt detail page and using the Share dialog. Surfacing a one-click "Copy public link" on the card itself removes friction for the most common share flow.

## Done looks like

- Each receipt card shows a small share icon. Clicking it opens an inline popover that either creates a token (if none exists) or copies the existing URL.
- The popover indicates the link's expiry and a count of active tokens.
- Keyboard-accessible (popover focusable, Escape closes, copy action has aria-label).

## Out of scope

- Bulk-share for selected receipts.

## Approach

Reuse the existing share-token API. The popover is a small Radix popover or shadcn `Popover` component depending on what the receipts list already uses.

## Files of interest

- `artifacts/aigovops/src/components/` — receipt card
- `artifacts/aigovops/src/components/` — Share dialog (existing logic to reuse)

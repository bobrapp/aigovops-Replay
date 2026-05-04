# 18 — Mobile chain-screen export button

- **Priority:** GOOD TO HAVE
- **Source task:** #40
- **Parent feature:** #27 Portable Chain Export

## Why this matters

The web app has chain export, but mobile users have to switch to a browser to download. An in-app export button closes the parity gap.

## Done looks like

- Mobile chain screen has a download icon in the top-right.
- Tapping it triggers the existing export endpoint and saves the JSON bundle to the device's documents directory using Expo's file-system API.
- A native share sheet appears on save so the user can immediately email / AirDrop the file.
- Honors the new export rate limit and row cap (proposal 03) — surfaces the truncated banner if the cap was hit.

## Out of scope

- Background incremental exports.

## Approach

Use `expo-file-system` for save and `expo-sharing` for the share sheet. Both are already-permitted Expo APIs (see `expo` skill).

## Files of interest

- `artifacts/aigovops-mobile/src/screens/` — chain screen
- `artifacts/api-server/src/routes/` — export endpoint (must align with proposal 03)

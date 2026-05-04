# 12 — Open Graph / Twitter share preview cards

- **Priority:** GOOD TO HAVE
- **Source task:** #33
- **Parent feature:** #24 Hero & Landing Page Redesign

## Why this matters

The new BYOAI mint and demo chain are inherently shareable. Right now, posting any AIGovOps URL to Slack / X / LinkedIn produces a bare grey card — losing every conversion opportunity.

## Done looks like

- The landing page has rich `og:` and `twitter:` meta tags (title, description, image, url).
- The public verification page (`/verify/:id`) generates per-receipt OG metadata: title includes the model, description includes the policy status, and the image either links to a static branded card or a dynamically generated PNG with the chain-hash short-id.
- Validating the page with Twitter / Meta debuggers shows the rendered card preview.

## Out of scope

- Dynamic per-receipt OG image generation (start static; promote later if engagement justifies it).

## Approach

Static OG fields go in `index.html`. Per-receipt fields are injected server-side on the verify route using a small SSR shim or a meta-tags helper.

## Files of interest

- `artifacts/aigovops/index.html`
- `artifacts/aigovops/src/pages/` — verify page
- `artifacts/api-server/src/routes/` — public verify

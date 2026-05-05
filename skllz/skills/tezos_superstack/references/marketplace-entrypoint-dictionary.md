# Marketplace Entrypoint Dictionary

Use as a starting dictionary; keep editable by marketplace/version.

- Listing flows: `ask`, `create_ask`, `list`, `swap`
- Buy/collect flows: `collect`, `fulfill_ask`, `buy`
- In-app/internal purchase flows: `purchase`
- Offer flows: `fulfill_offer`, `accept_offer`
- Cancellation flows: `cancel`, `cancel_swap`

## Workflow Note
For stream visualizers, query per-entrypoint with bounded windows, then merge and sort by stable id before rendering lanes.

## Naming Note
Do not automatically rewrite `purchase` to `buy`. Use `purchase` when a contract intentionally separates an in-app/internal purchase flow from broader marketplace buy flows. The deployed entrypoint name is canonical for tooling, validation, and UI calls.

# Marketplace Entrypoint Dictionary

Use as a starting dictionary; keep editable by marketplace/version.

- Listing flows: `ask`, `create_ask`, `list`, `swap`
- Buy/collect flows: `collect`, `fulfill_ask`, `buy`
- Offer flows: `fulfill_offer`, `accept_offer`
- Cancellation flows: `cancel`, `cancel_swap`

## Workflow Note
For stream visualizers, query per-entrypoint with bounded windows, then merge and sort by stable id before rendering lanes.

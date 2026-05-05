# Marketplace Entrypoint Reference (Working Set)

Use as a starter dictionary; adapt per marketplace contract version.

## Common entrypoints
- `collect`
- `ask`
- `fulfill_ask`
- `accept_offer`
- `fulfill_offer`
- `cancel`
- `swap`
- `purchase` for in-app/internal purchase flows that should remain distinct from broader marketplace `buy` semantics

## Query templates
- By target + entrypoint
- By timestamp window (`timestamp.ge`, `timestamp.lt`)
- By level window (`level.ge`, `level.le`)

## Operational note
Keep entrypoint dictionary versioned by marketplace contract address and release epoch.
Do not auto-normalize `purchase` to `buy`; preserve it when the contract uses the name to separate app-native interactions from external marketplace activity.

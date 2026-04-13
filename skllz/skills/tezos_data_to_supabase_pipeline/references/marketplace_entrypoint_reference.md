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

## Query templates
- By target + entrypoint
- By timestamp window (`timestamp.ge`, `timestamp.lt`)
- By level window (`level.ge`, `level.le`)

## Operational note
Keep entrypoint dictionary versioned by marketplace contract address and release epoch.

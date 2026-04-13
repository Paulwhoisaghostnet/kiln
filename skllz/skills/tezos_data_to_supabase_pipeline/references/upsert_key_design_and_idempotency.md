# Upsert Key Design And Idempotency

## Recommended primary keys
- transactions: `(network, hash, id)`
- token_transfers: `(network, id)`
- accounts: `(network, address)`
- raw_events: `(network, stream_name, source_id)`

## Idempotent replay rule
Re-running the same source window must produce identical table cardinality.

## Prototype simulation
- Use in-memory key map: `key -> latest row`.
- Ignore duplicate keys on replay.
- Advance checkpoint only after dedupe merge succeeds.

## Anti-patterns
- Advancing checkpoint before successful merge/upsert.
- Using non-deterministic keys from presentation fields.

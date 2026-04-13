# Frontend Pipeline Recipes

These patterns came from round-2 Tezos/Objkt visualization labs and are useful for browser-first prototypes.

## Recipe A: Bounded Transaction Stream (3js/p5js)
1. Query `operations/transactions` with `limit` + `sort.desc=id`.
2. Use `select` fields to keep payload small (`id,level,timestamp,amount,status,...`).
3. Normalize to a compact render row shape.
4. Keep a ring buffer and trim old records.

## Recipe B: Wallet Pulse Pipeline
1. Fetch account summary + recent operations separately.
2. Normalize numeric fields with log scaling (`log10(amount + 1)`).
3. Map status/level to visual channels.
4. Preserve last successful snapshot for degraded mode.

## Recipe C: Batch/Checkpoint Simulator
1. Fetch `N` rows and split into synthetic batches.
2. Track `lastId`/`batchSize` in local state.
3. Advance local checkpoint only after successful merge.
4. Render batch health metrics (count, lag, last id).

## Query Discipline
- Start with 100-300 rows for browser-safe first render.
- Increase row count only after frame-rate checks.
- Keep endpoint-specific field maps versioned.

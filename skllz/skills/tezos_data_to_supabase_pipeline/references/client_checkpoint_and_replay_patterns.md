# Client Checkpoint And Replay Patterns

These patterns are for browser/local prototypes without a backend DB.

## Checkpoint keys (localStorage)
- `stream_name`
- `network`
- `last_id`
- `last_level`
- `last_ts`
- `checkpoint_version`

## Incremental pull loop
1. Read checkpoint.
2. Fetch bounded page (`offset.cr` when supported).
3. Normalize and dedupe in-memory.
4. Commit checkpoint only if normalization/write-to-state succeeds.

## Replay workflow
- On partial merge failure: rollback to prior checkpoint and replay bounded range.
- Keep last 1-2 batches as replay window for debugging.

## Schema/version reset
If checkpoint schema changes, force controlled full refresh and rewrite checkpoint with new version.

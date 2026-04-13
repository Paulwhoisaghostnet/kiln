# Checkpoint State Machine and Replay

## State Machine
`idle -> fetching -> normalizing -> writing -> verifying -> commit_checkpoint -> idle`

## Failure Branches
- `fetching -> backoff`
- `writing -> retry_or_abort_without_checkpoint_advance`
- `verifying -> partial_success_with_replay_window`

## Monotonic Checkpoint Pattern
1. Read `last_id`.
2. Fetch rows where id is newer than checkpoint.
3. Upsert rows idempotently.
4. Commit new checkpoint only after write + verify pass.

## Replay and Recovery
- Partial write failure: replay from previous committed checkpoint.
- Schema drift: migrate mapping and replay bounded window.
- Duplicate spike: fix key design, replay range, run duplicate query checks.

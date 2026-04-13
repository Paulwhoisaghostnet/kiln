# Client Checkpoint Prototype Patterns

## Local State Keys
- `stream_name`, `network`, `last_id`, `last_level`, `last_ts`, `version`.

## Incremental Loop
1. Read local checkpoint.
2. Fetch bounded page.
3. Normalize + dedupe into key map.
4. Commit checkpoint only on successful merge.

## Replay Rule
On merge failure, rollback to previous committed checkpoint and replay last window.

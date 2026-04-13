# Incremental Sync Runbook

## 1) Define Stream
- Choose `stream_name`, network, endpoint, filter set, and cursor field.
- Keep initial scope small (for example: one marketplace, one date window).

## 2) Fetch Strategy
- Use cursor pagination (`offset.cr`) when available.
- Use `select` fields to reduce payload.
- Sort by monotonic key for deterministic replay.

## 3) Write Strategy
- Normalize source records into stable keys.
- Upsert with explicit conflict targets per table.
- Store `source_ts` and `ingested_at` timestamps.

## 4) Checkpoint Strategy
- Persist checkpoint by stream + network.
- Advance checkpoint only after successful write transaction.
- On failure, retry from last committed checkpoint.

## 5) Verification
- Run duplicate checks and row growth checks after each run.
- Spot-check recent rows against source records.
- Emit lag metrics (latest source level/timestamp vs destination).

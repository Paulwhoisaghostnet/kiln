---
name: "tezos_data_to_supabase_pipeline"
description: "Use when extracting Tezos blockchain/indexer data and persisting it into Supabase with idempotent upserts, incremental checkpoints, and verification queries."
---

# tezos_data_to_supabase_pipeline

## Quick Start
1. Define bounded data scope (entities, network, lookback window, filters).
2. Create/verify Supabase schema and unique keys.
3. Resume from `sync_state` checkpoint.
4. Ingest with cursor pagination (`offset.cr`) and bounded retries.
5. Upsert idempotently and advance checkpoint only after successful writes.
6. Run verification queries and publish sync report.

## When To Use
- Building Tezos analytics or app features that require persisted chain/indexer data.
- Syncing TzKT/Objkt-derived data into Supabase/Postgres.
- Operating resumable, replay-safe ingestion jobs.
- Prototyping browser-first Tezos pipelines with local checkpoint simulation.

## Inputs Required
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- `TZKT_BASE_URL` (network-specific) and optional secondary sources.
- Stream definition (`stream_name`, entity type, filters, window policy).
- Cursor strategy (`id`, `level`, or `timestamp`) and batch size.

## Workflow
1. Select source endpoints and shape normalized row models.
2. Load current stream checkpoint from `sync_state`.
3. Fetch pages with cursor-first pagination and backoff handling.
4. Normalize records into stable keys and typed columns.
5. Upsert to destination tables with conflict targets.
6. Commit checkpoint only after full batch write success.
7. Run verification pack and emit health counters.

## Evidence-Backed Guardrails
- Do not attempt full-chain mirror by default; start with bounded product-focused scope.
- Prefer cursor pagination and field selection for stability and payload reduction.
- Keep sync and analysis decoupled: sync once, analyze many times.
- Use queue/backfill workers with stale thresholds for long-running coverage.
- Treat rate limits and partial failures as first-class states, not edge cases.
- Do not advance checkpoint before write and verification success.

## Reference Map
- `references/incremental-sync-runbook.md` -> ingestion and checkpoint operations.
- `references/supabase-schema-template.sql` -> table/index starter schema.
- `references/verification-queries.sql` -> data integrity checks.
- `references/frontend-pipeline-recipes.md` -> browser-first Tezos/Objkt visualization pipeline patterns.
- `references/frontend_api_query_cookbook.md` -> copy-ready endpoint/query templates.
- `references/checkpoint-state-machine-and-replay.md` -> checkpoint commit/replay state-machine guidance.
- `references/client_checkpoint_and_replay_patterns.md` -> backend-free prototype checkpoint patterns.
- `references/upsert_key_design_and_idempotency.md` -> idempotent key design patterns.
- `references/rate_limit_and_failure_recovery.md` -> resilient recovery playbook.
- `references/objkt-tzkt-fallback-map.md` -> Objkt GraphQL to TzKT fallback field mapping.
- `references/quality-checklist.md` -> release gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox pipeline docs.

## Output Contract
Return:
- stream/network scope summary,
- fetch/normalize/upsert counts,
- checkpoint before/after state,
- verification query outcomes,
- error and retry buckets,
- next-run recommendation.

## Validation Checklist
- Replays do not duplicate rows.
- Checkpoint is monotonic and write-coupled.
- Source sample counts align with destination windows.
- Conflict targets prevent duplicates for each table.
- Verification queries pass or produce actionable anomalies.

## Failure Modes + Recovery
- Rate limiting: reduce request rate, apply backoff, resume from checkpoint.
- Schema drift: migrate mapping/table shape and replay bounded range.
- Duplicate spikes: fix unique keys/conflict targets and re-run replay window.
- Partial crash: restart worker from last committed checkpoint.

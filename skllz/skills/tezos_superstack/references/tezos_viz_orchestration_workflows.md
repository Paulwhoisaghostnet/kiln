# Tezos Visualization Orchestration Workflows

Use these workflows when request scope includes data extraction + visualization.

## Workflow A: TzKT-only visualization prototype
1. Route to `tezos_data_to_supabase_pipeline` logic for bounded query design.
2. Build normalization schema first.
3. Add visualization layer (3js/p5js).
4. Add deterministic debug/export hook.

## Workflow B: Objkt-primary with TzKT fallback
1. Attempt Objkt source fetch/query.
2. On failure, map to TzKT fallback fields.
3. Preserve canonical normalized output contract.
4. Surface source provenance in UI and status report.

## Workflow C: Incremental/checkpoint visual monitor
1. Define cursor/checkpoint strategy.
2. Simulate incremental batches.
3. Verify monotonic cursor progression.
4. Render aggregated batch outcomes.

## Blocker-first rules
- Stop downstream render claims if source fetch invariants fail.
- Report whether results are primary-source or fallback-source.
- Flag non-deterministic visual state as a blocker for regression workflows.

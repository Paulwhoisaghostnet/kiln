# Subagent Round 2 Documentation Harvest

Date: 2026-04-07

## Objective
Run a second multi-project Tezos/Objkt visualization pass and harvest examples, evidence, workflows, and pipeline patterns into skill documentation before deleting temp projects.

## Project Set
1. `agent1_tzkt_tx_3js` - bounded TzKT transaction flow visualization (Three.js)
2. `agent2_wallet_pulse_p5` - wallet pulse and outlier-mapped signals (p5.js)
3. `agent3_objkt_galaxy_3js` - Objkt GraphQL-first with TzKT fallback (Three.js)
4. `agent4_market_stream_p5` - marketplace entrypoint stream lanes (p5.js)
5. `agent5_checkpoint_3js` - client-side checkpoint/batch monitor (Three.js)

## Documentation Nuggets Harvested
- Browser-safe bounded query defaults (`limit`, `sort.desc=id`, narrow `select` fields).
- Local checkpoint simulation patterns for frontend prototypes (`lastId`, stale refresh rules).
- Objkt-to-TzKT field fallback mapping and switchover triggers.
- Marketplace entrypoint dictionaries and stream merge workflows.
- Deterministic data-viz QA tiers and snapshot metadata hooks (`render_game_to_text`).

## Skill Docs Updated
### `tezos_data_to_supabase_pipeline`
- Added `references/frontend-pipeline-recipes.md`
- Added `references/checkpoint-state-machine-and-replay.md`
- Added `references/objkt-tzkt-fallback-map.md`
- Updated `SKILL.md` reference map to include these documents.

### `tezos_superstack`
- Added `references/objkt-fallback-playbook.md`
- Added `references/marketplace-entrypoint-dictionary.md`
- Added `references/visualization-workflow-examples.md`
- Updated `SKILL.md` reference map to include these documents.

### `visual_sim_debug_3js_p5js`
- Added `references/data-viz-deterministic-qa.md`
- Added `references/tezos-viz-debug-hooks.md`
- Updated `SKILL.md` reference map to include these documents.

## Top Improvement Requests from Round 2
1. Add a frontend Tezos visualization starter kit (3js + p5 fetch/normalize/render snippets).
2. Add canonical Objkt GraphQL query recipes plus TzKT fallback maps.
3. Add marketplace entrypoint dictionary by platform/version.
4. Add deterministic QA standards for data-heavy visuals.
5. Add client-side checkpoint simulation examples in skill references.

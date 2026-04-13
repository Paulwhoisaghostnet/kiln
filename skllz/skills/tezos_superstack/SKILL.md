---
name: "tezos_superstack"
description: "Use as a top-level Tezos orchestrator that routes to contract lifecycle, wallet ops, data pipeline, visualization, and non-custodial game-influence skills based on request scope."
---

# tezos_superstack

## Quick Start
1. Classify request scope: `contract`, `wallet_ops`, `data_pipeline`, `visualization`, `game_influence`, or `mixed`.
2. Select required Tezos sub-skills.
3. Build dependency-ordered execution plan.
4. Run sub-skills and normalize output format.
5. Publish one consolidated Tezos readiness report.

## When To Use
- User asks for a broad Tezos outcome spanning multiple layers.
- Contract, wallet, indexing, visualization, and game-influence work must stay aligned.
- You need one orchestrated report instead of fragmented outputs.

## Inputs Required
- User objective and delivery scope.
- Network targets and wallet constraints.
- Contract change scope and deployment readiness needs.
- Data persistence/reporting requirements.
- Visualization/game-signal objectives and runtime constraints.

## Routing Rules
- `contract` -> `tezos_contract_lifecycle`
- `wallet_ops` -> `tezos_dapp_wallet_ops`
- `data_pipeline` -> `tezos_data_to_supabase_pipeline`
- `visualization` -> `tezos_objkt_visualization_workbench`
- `game_influence` -> `tezos_objkt_visualization_workbench` + `game_systems_and_liveops`
- `mixed` -> run all required skills in dependency order

## Recommended Mixed-Flow Order
1. `tezos_contract_lifecycle`
2. `tezos_dapp_wallet_ops`
3. `tezos_data_to_supabase_pipeline`
4. `tezos_objkt_visualization_workbench`
5. `game_systems_and_liveops` (if gameplay layer required)

## Evidence-Backed Guardrails
- Do not advance downstream tasks when upstream blockers are unresolved.
- Enforce network/chain consistency across all sub-skill outputs.
- Treat artifact parity and wallet reliability as prerequisites for data-layer and visualization trust.
- Enforce non-custodial constraints for game-influence flows.
- Use normalized status blocks so multi-skill outcomes are auditable.

## Reference Map
- `references/routing-matrix.md` -> routing and dependency matrix.
- `references/execution-handoff-template.md` -> normalized per-skill status format.
- `references/objkt-fallback-playbook.md` -> Objkt primary path and TzKT fallback orchestration.
- `references/marketplace-entrypoint-dictionary.md` -> entrypoint dictionary for stream-oriented workloads.
- `references/visualization-workflow-examples.md` -> concrete data->visual orchestration examples.
- `references/tezos_viz_orchestration_workflows.md` -> mixed-flow orchestration for Tezos/Objkt visual systems.
- `references/quality-checklist.md` -> orchestration quality gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox Tezos projects.

## Output Contract
Return:
- selected sub-skill set,
- execution order and dependency notes,
- per-skill status blocks,
- consolidated readiness verdict,
- blockers and explicit next actions.

## Validation Checklist
- Routing decision matches request scope.
- Sub-skill outputs are complete and non-conflicting.
- Mixed flow order respects dependencies.
- Final report has one unified status model.

## Failure Modes + Recovery
- Misrouting: reclassify and rerun the correct sub-skill set.
- Upstream blocker: halt dependent steps and publish blocker-first report.
- Output mismatch: normalize to handoff template and regenerate summary.

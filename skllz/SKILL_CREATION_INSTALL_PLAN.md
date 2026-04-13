# Skill Creation + Global Install Plan

## Objective
Create a collapsed, practical skill set from the sandbox review, including **4 Tezos skills** (3 core Tezos skills + 1 super Tezos skill that includes/orchestrates the other 3), plus the other collapsed skills we discussed (`video`, `game`, `3js+p5js`, `ui/ux`), and install all of them globally on this machine.

## Final Skill Set (8 Total)

## A) Tezos (4 skills)
1. `tezos_contract_lifecycle`
- Scope: style matrix, SmartPy compile/artifact sync, contract security coverage, contract test matrix.

2. `tezos_dapp_wallet_ops`
- Scope: wallet connect/origination reliability, network switching, chain-id guardrails, user-facing failure handling.

3. `tezos_data_to_supabase_pipeline`
- Scope: extract Tezos data from TzKT (or Objkt/TzKT combos), normalize, and persist into Supabase via idempotent upserts.
- Required outcomes:
  - supports cursor pagination and backoff/rate-limit handling
  - supports network selection (`mainnet`, `ghostnet`, `shadownet/custom`)
  - writes to Supabase tables with dedupe keys and incremental sync checkpoints
  - includes schema/migration guidance + verification queries

4. `tezos_superstack`
- Scope: top-level Tezos orchestrator skill that routes and composes all Tezos workflows.
- Must include:
  - delegation/routing rules for when to invoke each core Tezos skill:
    - `tezos_contract_lifecycle`
    - `tezos_dapp_wallet_ops`
    - `tezos_data_to_supabase_pipeline`
  - multi-step orchestration patterns (e.g., contract work -> wallet ops -> data indexing/reporting)
  - a unified Tezos delivery checklist (contract, wallet/network, data pipeline, verification)

## B) Other collapsed skills (4 skills)
5. `video_local_pipeline_and_mintable_export`
- Scope: ffmpeg/media workflows, local-first processing, self-contained mintable output packaging.

6. `game_systems_and_liveops`
- Scope: simulation/game loops, modular mechanics, secure community game ops (including moderation patterns).

7. `visual_sim_debug_3js_p5js`
- Scope: deterministic debug hooks, fixed-step sim, artifacted regression validation for 3js/p5js-style projects.

8. `uiux_delivery_handoff`
- Scope: docs-first UX delivery, architecture remediation docs, onboarding/handoff runbooks, iteration checkpoints.

## File/Folder Structure
Source workspace (editable):
- `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/skllz/skills/<skill-name>/SKILL.md`

Global install target:
- `/Users/joshuafarnworth/.codex/skills/<skill-name>/SKILL.md`

Optional per-skill support files:
- `references/*.md`
- `templates/*.md`
- `scripts/*` (only where useful)

## Skill Authoring Standard (for each SKILL.md)
Each skill should include:
1. `# <skill-name>`
2. `## Purpose`
3. `## When To Use`
4. `## Inputs Required`
5. `## Workflow` (step-by-step)
6. `## Guardrails`
7. `## Output Contract` (what it must return/create)
8. `## Validation Checklist`
9. `## Failure Modes + Recovery`

## Tezos Skill #3 Detailed Plan (`tezos_data_to_supabase_pipeline`)

## Purpose
Reliable ingestion of Tezos chain/indexer data into Supabase for analytics and app features.

## Data Flow
1. Choose network + time/window + entities (wallets/contracts/entrypoints).
2. Pull data from TzKT with pagination + filters.
3. Normalize records into stable shapes.
4. Upsert into Supabase using deterministic unique keys.
5. Store sync cursor/checkpoint per stream.
6. Run verification SQL queries and row-count checks.

## Supabase Table Pattern
- `sync_state` (stream_name, network, cursor, last_level, last_ts, updated_at)
- `tezos_accounts`
- `tezos_transactions`
- `tezos_token_transfers`
- `tezos_contracts`
- `tezos_events_raw` (optional archival stream)

## Idempotency + Integrity Rules
- Upsert keys: operation hash + counter/nonce + network + type-specific identifiers.
- Never use blind inserts for chain event tables.
- Use `insert ... on conflict ... do update` behavior (or Supabase upsert equivalent).
- Keep source timestamp + ingest timestamp.

## Required Environment
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TZKT_BASE_URL` (network-aware)
- `TZKT_RATE_LIMIT_PER_SEC` (default safe throttle)

## Verification Checklist
- record counts increased as expected
- no duplicate-key explosions
- checkpoints advanced
- sample rows match TzKT source payloads
- rerunning same window does not duplicate rows

## Tezos Super Skill Detailed Plan (`tezos_superstack`)

## Purpose
Provide one Tezos entrypoint skill that decides which Tezos sub-skill(s) to run and in what sequence.

## Routing Rules
1. Contract build/deploy/test hardening -> route to `tezos_contract_lifecycle`.
2. Wallet/origination/network/runtime reliability -> route to `tezos_dapp_wallet_ops`.
3. Chain/indexer extraction + Supabase persistence/analytics -> route to `tezos_data_to_supabase_pipeline`.
4. Mixed requests spanning multiple areas -> orchestrate all relevant skills in sequence.

## Orchestration Pattern
1. Classify request into Contract / WalletOps / DataPipeline / Mixed.
2. Generate execution plan with ordered sub-skill invocations.
3. Execute each sub-skill workflow and collect artifacts.
4. Return a single consolidated Tezos outcome report.

## Output Contract
- Must always return:
  - selected sub-skill(s),
  - execution order,
  - outputs produced,
  - verification status and remaining risks.

## Execution Plan (Phased)

## Phase 1: Scaffold skills locally in `skllz`
- Create 8 directories under:
  - `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/skllz/skills/`
- Add `SKILL.md` for each, using the standard format above.

## Phase 2: Author and tighten workflows
- Fill each skill with concrete command/query examples and decision rules.
- Ensure Tezos skill #3 includes Supabase schema, sync-state strategy, and verification SQL.

## Phase 3: Local QA
- Lint by structure (all required sections present).
- Cross-check naming consistency with skill folder names.
- Run a dry-run read-through for each skill to ensure no missing prerequisites.

## Phase 4: Global installation
Install to global skills path:
- `/Users/joshuafarnworth/.codex/skills`

Recommended install command pattern:
```bash
mkdir -p /Users/joshuafarnworth/.codex/skills
rsync -a --delete /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/skllz/skills/ /Users/joshuafarnworth/.codex/skills/
```

Alternative (symlink-based for active development):
```bash
for d in /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/skllz/skills/*; do
  name="$(basename "$d")"
  ln -sfn "$d" "/Users/joshuafarnworth/.codex/skills/$name"
done
```

## Phase 5: Install validation
- Confirm directories exist in global path.
- Confirm each has `SKILL.md`.
- Confirm first heading matches skill name.

Validation commands:
```bash
ls -la /Users/joshuafarnworth/.codex/skills
find /Users/joshuafarnworth/.codex/skills -maxdepth 2 -name SKILL.md
```

## Acceptance Criteria
- 8 collapsed skills created.
- Tezos category has exactly 4 skills.
- Third Tezos skill explicitly handles Tezos extraction -> Supabase storage.
- Fourth Tezos skill (`tezos_superstack`) includes/orchestrates the other three Tezos skills.
- All 8 skills installed globally under `/Users/joshuafarnworth/.codex/skills`.

## Implementation Order Recommendation
1. `tezos_data_to_supabase_pipeline`
2. `tezos_contract_lifecycle`
3. `tezos_dapp_wallet_ops`
4. `tezos_superstack`
5. `visual_sim_debug_3js_p5js`
6. `video_local_pipeline_and_mintable_export`
7. `game_systems_and_liveops`
8. `uiux_delivery_handoff`

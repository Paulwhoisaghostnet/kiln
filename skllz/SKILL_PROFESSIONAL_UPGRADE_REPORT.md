# Skill Professional Upgrade Report

Date: 2026-04-07
Scope: `skllz/skills/*` and matching installs in `~/.codex/skills/*`

## Upgrade Standard Applied

- `SKILL.md` upgraded from generic guidance to operational runbooks.
- `agents/openai.yaml` normalized with compliant short descriptions and explicit default prompts.
- Companion `references/` expanded with topic-specific checklists and playbooks.
- Each skill now includes `references/sandbox-evidence.md` citing project evidence from Sandbox.

## Skill-by-Skill Improvements

### `tezos_contract_lifecycle`
- Added deterministic style resolution rules and release gate depth.
- Added explicit compile/artifact parity requirements.
- Added Tezos protocol/deploy risk framing in guardrails.

Evidence: `Bowers/scripts/compile-contracts.sh`, `Bowers/BOWERS_MEMORY.md`, `Bowers/.cursor/rules/tezos-contract-deployment.md`.

### `tezos_dapp_wallet_ops`
- Added singleton adapter and chain verification requirements.
- Added wallet operation API guardrails and origination error playbook.
- Added provider-specific failure triage workflow.

Evidence: `Bowers/.cursor/rules/tezos-contract-deployment.md`, `Bowers/BOWERS_MEMORY.md`.

### `tezos_data_to_supabase_pipeline`
- Added bounded-scope ingestion posture and incremental runbook.
- Expanded schema/index template and verification query pack.
- Added queue/backoff/checkpoint reliability guidance.

Evidence: `tezpulse/TZKT_API_CHEATSHEET.md`, `web3 simulator/nft-pipeline/README.md`, `Tezos-Intel/replit.md`, `r00t/docs/data-strategy.md`.

### `tezos_superstack`
- Added strict routing rules and dependency-ordered orchestration.
- Added normalized execution handoff template.
- Added blocker-first escalation guidance for mixed flows.

Evidence: `Bowers/BOWERS_MEMORY.md`, `Bowers/.cursor/rules/tezos-contract-deployment.md`, `Tezos-Intel/replit.md`, `web3 simulator/nft-pipeline/README.md`.

### `video_local_pipeline_and_mintable_export`
- Added local toolchain gating and offline validation requirements.
- Added mintable package checklist and hosted WASM runtime checks.
- Added compiled-artifact-first QA posture.

Evidence: `local-video-review-lab/README.md`, `videozine-editor/README.md`, `videozine-editor/install/README.md`, `Particle Painting/particle-studio/NETLIFY_DEPLOYMENT.md`, `album packager/progress.md`, `vlm-video-archivist/README.md`.

### `game_systems_and_liveops`
- Added modular architecture and audit-log requirements.
- Added secrecy-safe moderation/error guardrails.
- Added anti-abuse progression controls and test expectations.

Evidence: `Discord Bots/PROJECT_STRUCTURE.md`, `Discord Bots/README.md`, `projects/Sandbox/mafiabot/README.md`.

### `visual_sim_debug_3js_p5js`
- Added deterministic debug loop standard and artifact matrix.
- Added fixed-step/bounded-time stabilization guardrails.
- Added regression discipline for single-hypothesis passes.

Evidence: `3js projects/adrift/progress.md`, `p5js/progress.md`.

### `uiux_delivery_handoff`
- Added architecture-audit-first delivery workflow.
- Added handoff package and phased remediation templates.
- Added onboarding and runtime-doc fidelity requirements.

Evidence: `projects/Sandbox/Visualize Anything/ARCHITECTURE_AUDIT.md`, `projects/Sandbox/Visualize Anything/WORKFLOW_REDESIGN.md`, `SANDBOX_PROJECTS_APPENDIX.md`.

## Metadata Quality Upgrades (`agents/openai.yaml`)

- All `short_description` values now fit the 25-64 char guideline.
- All default prompts explicitly reference the `$skill_name`.
- Added `policy.allow_implicit_invocation: true` for consistency.
- YAML parse validation passed for all eight skills.

## Structure Parity

Current structure per skill now includes:
- `SKILL.md`
- `agents/openai.yaml`
- `LICENSE.txt`
- `references/` with domain-specific playbooks/checklists/evidence

This is comparable to established high-quality skills under `~/.codex/skills` and improves companion depth over minimal-only skill packages.

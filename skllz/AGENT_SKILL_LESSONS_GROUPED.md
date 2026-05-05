# Agent Skill Lessons Grouped By Skill Type

## 1) Tezos Contract Engineering Skills

### `skill_tezos_contract_style_matrix`
- Concern: choosing/maintaining multiple contract styles without UI/runtime drift.
- Helpful items:
  - Build an explicit style registry + capability map.
  - Validate feature combinations and unsupported module combinations early.
  - Keep compile artifacts synchronized with frontend style IDs.
- Sources: `Bowers`, `projects/Sandbox/lil guy app`, `WTF`, `smartpy-test-platform`.

### `skill_smartpy_compile_and_artifact_sync`
- Concern: SmartPy compile reliability and artifact handoff.
- Helpful items:
  - Standardize compile scripts per contract style.
  - Copy canonical compiled JSON into app/runtime modules.
  - Add smoke checks to confirm artifact availability and naming.
- Sources: `Bowers/scripts/compile-contracts.sh`, `WTF/scripts/test-marketplace-contract.sh`.

### `skill_contract_security_entrypoint_coverage`
- Concern: security controls not consistently enforced across entrypoints.
- Helpful items:
  - Enforce policy checks in transfer, mint, buy, offer, and acceptance paths.
  - Maintain contract-level test scenarios for each protected entrypoint.
  - Track residual risk and remediation in dedicated audit docs.
- Sources: `Bowers`, `WTF`, `color wars` (audit discipline pattern).

### `skill_marketplace_entrypoint_semantics`
- Concern: marketplace-like entrypoint names can blur product boundaries.
- Helpful items:
  - Keep `purchase` available for in-app/internal purchase flows when those interactions should not be confused with broader Tezos marketplace `buy` flows.
  - Treat deployed entrypoint names as canonical and immutable; adapt tooling/validation to the ABI rather than silently renaming contract APIs.
  - Version marketplace entrypoint dictionaries by contract role/address so `buy`, `purchase`, `collect`, and `fulfill_ask` do not get collapsed into one semantic bucket.
- Sources: `WTF`, `Kiln Shadowbox compatibility work`.

## 2) Tezos Wallet and Origination Reliability Skills

### `skill_tezos_wallet_origination_reliability`
- Concern: browser wallet origination failures and network mismatches.
- Helpful items:
  - Use wallet API origination path for browser dApps.
  - Verify chain ID before sending operations.
  - Keep wallet adapter singleton to avoid duplicate-client race failures.
  - Surface wallet-specific failure guidance in UI.
- Sources: `Bowers/.cursor/rules/tezos-contract-deployment.md`, `Bowers/DEPLOY.md`.

### `skill_network_switch_and_context_propagation`
- Concern: broken state when switching testnet/mainnet.
- Helpful items:
  - Persist selected network in shared context.
  - Reinitialize wallet/toolkit singletons on network change.
  - Keep explorer/API/CSP/network labels in sync.
- Sources: `Bowers`, `r00t/docs/tezos-bible.md`, `projects/Sandbox/lil guy app`.

## 3) Tezos Data Indexing and Analytics Skills

### `skill_tzkt_indexer_pipeline`
- Concern: efficient, reliable blockchain ingestion without API abuse.
- Helpful items:
  - Use cursor pagination and selective fields.
  - Use retry/backoff and stale-window logic.
  - Separate sync phase from analysis phase.
  - Keep known-contract lists explicit and editable.
- Sources: `tezpulse`, `web3 simulator/nft-pipeline`, `Tezos-Intel`, `Guidance`.

### `skill_local_first_wallet_analytics`
- Concern: user analytics without heavy centralized storage.
- Helpful items:
  - Cache wallet-scoped bundles locally.
  - Derive secondary analytics from local cache.
  - Avoid full-chain mirrors unless usage proves necessity.
- Sources: `wallet-constellations`, `r00t/docs/data-strategy.md`, `taxmaster`.

### `skill_marketplace_entity_tagging`
- Concern: poor analytics quality from unlabeled addresses/entities.
- Helpful items:
  - Maintain address tag tables (marketplace/cex/burn/etc).
  - Auto-discover and enqueue related addresses with depth limits.
  - Keep provenance and verification rules explicit.
- Sources: `Tezos-Intel/replit.md`, `Objkt-Advisor`, `Guidance`.

## 4) Agentic Orchestration Skills

### `skill_subagent_registry_and_dispatch`
- Concern: unclear delegation in multi-agent projects.
- Helpful items:
  - Define role-specific agent prompts and invocation triggers.
  - Keep a registry doc mapping subagent -> purpose -> files.
  - Separate implementation, review, verification, and docs agents.
- Sources: `r00t/docs/subagents.md`, `r00t/.cursor/agents/*`.

### `skill_agent_governance_and_journaling`
- Concern: autonomous projects losing alignment over time.
- Helpful items:
  - Maintain rules, goals, decisions, internal/external action logs.
  - Require written justification before capability expansion.
  - Track obligations and compliance constraints explicitly.
- Sources: `r00t/RULE.md`, `r00t/GOALS.md`, `r00t/nimrod/*`.

### `skill_agent_handoff_readiness`
- Concern: future agents cannot continue work quickly.
- Helpful items:
  - Keep concise AI-agent README files.
  - Add progress logs with what changed, validation artifacts, and known gaps.
  - Keep runbooks, setup docs, and source maps current.
- Sources: `Guidance/README_AI_AGENTS.md`, `Bowers/BOWERS_MEMORY.md`, `p5js/progress.md`, `album packager/progress.md`.

## 5) Testing, QA, and Verification Skills

### `skill_e2e_artifacted_validation`
- Concern: fixes regress visually/functionally without evidence.
- Helpful items:
  - Capture screenshot + state JSON artifacts for each validation pass.
  - Expose deterministic debug hooks for automated browser checks.
  - Track console error status as a quality gate.
- Sources: `3js projects/adrift/progress.md`, `ledger-village/progress.md`, `p5js/progress.md`, `album packager/progress.md`.

### `skill_contract_test_matrix`
- Concern: smart contract feature drift and broken user journeys.
- Helpful items:
  - Build per-module tests plus full workflow integration tests.
  - Include gas reporting and coverage reporting.
  - Add pre-deploy checklist tied to test outcomes.
- Sources: `projects/Sandbox/lil guy app/TEST_*`, `WTF/scripts/test-marketplace-contract.sh`, `Bowers docs`.

### `skill_architecture_audit_to_remediation`
- Concern: complex systems fail with unclear root cause.
- Helpful items:
  - Write explicit issue ranking (critical/high/medium).
  - Propose phased remediation sequence with success criteria.
  - Include fallback strategies if primary fix path fails.
- Sources: `projects/Sandbox/Visualize Anything/ARCHITECTURE_AUDIT.md`, `color wars/AUDIT_REPORT.md`, `Bowers/docs/REPORT_REMEDIATION_PLAN.md`.

## 6) Security and Compliance Skills

### `skill_security_gate_baseline`
- Concern: inconsistent secure defaults across projects.
- Helpful items:
  - Require static analysis + dependency audits in CI.
  - Enforce local secret hygiene and least-privilege file perms.
  - Keep explicit vulnerability exception records with follow-up IDs.
- Sources: `tui_tools-main/SECURITY.md`, `Bowers docs`, `WTF/security_best_practices_report.md`.

### `skill_discord_game_security_model`
- Concern: role/state leakage in multiplayer moderation bots.
- Helpful items:
  - Keep sensitive game roles in DB, not platform roles.
  - Use quarantine-mode channel boundaries.
  - Return generic failure messages to avoid state leaks.
- Sources: `projects/Sandbox/mafiabot/README.md`, `Discord Bots/PROJECT_STRUCTURE.md`.

### `skill_paid_feature_onchain_verification`
- Concern: paywall unlocks without trustworthy payment proof.
- Helpful items:
  - Verify operation hash + target wallet + amount on-chain.
  - Unlock exports/features only after validated payment event.
  - Keep revenue register + payout scripts auditable.
- Sources: `r00t/nimrod/internal-actions.md`, `r00t/signer/README.md`.

## 7) Local-First and Data Ownership Skills

### `skill_local_first_data_products`
- Concern: privacy and portability for user-sensitive analytics apps.
- Helpful items:
  - Keep wallets/events/reports in local IndexedDB or local files.
  - Provide export/backup/import paths.
  - Label limitations clearly (browser/device scoped state).
- Sources: `taxmaster`, `wallet-constellations`, `porcupin-slideshow`.

### `skill_readonly_source_separation`
- Concern: corrupting external source stores during processing.
- Helpful items:
  - Keep source DB read-only and store app state separately.
  - Build isolated cache layers for transformed assets.
- Sources: `porcupin-slideshow`, `ledger-village`.

## 8) Media, Creative, and Simulation Pipeline Skills

### `skill_ffmpeg_wasm_and_deploy`
- Concern: media tools breaking on deploy due to headers/build shape.
- Helpful items:
  - Treat deploy config, headers, and asset routing as first-class.
  - Document first-load WASM size/caching behavior.
  - Provide troubleshooting for MIME/CORS/build failures.
- Sources: `Particle Painting/particle-studio/NETLIFY_DEPLOYMENT.md`, `videozine-editor/install/README.md`.

### `skill_self_contained_mintable_export`
- Concern: mint-target packages failing due to external dependencies.
- Helpful items:
  - Embed all required assets locally.
  - Verify runtime with zero external calls.
  - Validate output package behavior in browser automation.
- Sources: `album packager`, `videozine-editor`, `vlm-video-archivist/token_demo/README.md`.

### `skill_visual_sim_debug_hooks`
- Concern: hard-to-debug emergent simulations.
- Helpful items:
  - Expose text-state diagnostics and deterministic time stepping.
  - Keep baseline deterministic mode to isolate randomization.
  - Use structured artifact logs per debug pass.
- Sources: `3js projects`, `p5js`, `ledger-village`, `Visualize Anything`.

## 9) Product Planning and Ops Documentation Skills

### `skill_docs_first_project_bootstrap`
- Concern: projects stalling due to unclear scope and handoff gaps.
- Helpful items:
  - Keep README + quickstart + setup + troubleshooting + architecture docs.
  - Add explicit "next steps" and phase gates.
  - Maintain project summary docs for fast onboarding.
- Sources: `projects/Sandbox/*`, `fafo tax/SETUP_COMPLETE.md`, `Discord Bots`.

### `skill_long_horizon_program_planning`
- Concern: complex initiatives lacking execution structure.
- Helpful items:
  - Break plans into legal, technical, finance, and operations tracks.
  - Keep milestone checklists with risk mitigation.
  - Separate "created docs" vs "still-needed docs" to guide continuation.
- Sources: `Artcessible Studios`, `Breadfond 501c`.

## 10) Candidate `skill.sh` Backlog (Prioritized)
1. `tezos-origination-reliability`
2. `tezos-contract-style-matrix`
3. `tzkt-pipeline-patterns`
4. `subagent-registry-and-dispatch`
5. `e2e-artifacted-validation`
6. `smart-contract-test-matrix`
7. `security-gate-baseline`
8. `local-first-wallet-analytics`
9. `self-contained-mintable-export`
10. `visual-sim-debug-hooks`
11. `docs-first-bootstrap`
12. `program-planning-multi-track`

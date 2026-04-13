# Agent Skill Lessons List (Raw)

## Scope
- Reviewed all top-level directories in `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox`.
- Focused on project readmes, notes, agent files, contract references, workflow docs, and structure patterns.
- Added root-level sandbox docs because they contain cross-project operating guidance.

## Coverage: No-Action or Infra-Only Directories
- `.cursor`: no project docs in this workspace root.
- `.git`: repository metadata only.
- `.playwright-cli`: tooling cache only.
- `Crow`: no docs/manifests found.
- `__pycache__`: compiled artifacts only.
- `archivist-workspace`: no docs/manifests found.
- `objkt-advisor-db-2026-02-26`: DB snapshot directory, no reusable docs.
- `output`: artifact/output holding area.
- `pi-recovery-logs`: log folder, no reusable skill docs.

## Root-Level Sandbox Lessons
- `README-agent.md`, `agent.py`, `requirements-agent.txt`: minimal local Ollama agent pattern is useful for a lightweight "tool-call loop" skill.
- `SANDBOX_PROJECTS_APPENDIX.md`: useful governance checklist for repo hygiene (README, `.env.example`, test command, artifact policy, commit hygiene).
- `progress.md`: useful product-design pattern for mapping on-chain signals to gameplay systems with deterministic fallback and test hooks.

## Raw Lessons By Directory (Unsorted)

### 3js projects
- Keep deterministic debug hooks in interactive sims (`window.render_game_to_text`, `window.advanceTime`).
- Favor fixed-step simulation loops over raw elapsed-time coupling.
- Log visual verification artifacts (screenshots + state JSON) per fix pass.

### Bowers
- Browser Tezos origination reliability pattern: always use `Tezos.wallet.originate(...).send()` for wallet-connected dApps.
- Enforce network safety with chain-id verification before origination.
- Maintain a singleton wallet adapter (React StrictMode can cause duplicate wallet client creation).
- Wallet compatibility insight: Temple works for origination where Kukai can fail on protocol-level estimation behavior.
- SmartPy pipeline pattern: compile contracts to Michelson JSON, sync artifacts into TS modules, and verify style/artifact parity.
- Style matrix pattern: explicit mapping from selected feature modules to deployable contract style IDs.
- Security pattern: enforce contract blocklist in all transfer/mint/marketplace entrypoints, not only one path.
- Deployment/runbook quality pattern: include multi-target deploy docs, post-deploy checklist, and network-switch guidance.
- QA pattern: style-support verification script + E2E expansion + CI pre-deploy quality gate.

### Conflict-Atlas
- Good fallback architecture: headline-first classifier, then selective full-text enrichment only for low-confidence/high-impact items.
- Keep data model and API surfaces explicit for iterative ingestion pipelines.

### Discord Bots
- Modular cog/agent architecture scales well (core + feature cogs + admin controls).
- Maintain XP transaction audit logging for explainability and moderation trust.
- Define extension points for new cogs, DB tables, and config keys.
- Operational docs matter: setup, intents, role hierarchy, and troubleshooting should be explicit.
- Security pattern: role-gated commands, cooldowns/rate limiting, and safe DB access patterns.

### Guidance
- AI-agent-facing README + data-gap mapping docs are high-leverage for future agent onboarding.
- Explicit preference for chain/API-verified data and rate-limit respect is a reusable skill rule.

### Image-Battle-Arena
- Strong client-side pattern: convert uploaded images to battle-unit JSON locally; run sim loop in canvas.
- Preserve visual style constraints as explicit requirements (font/aesthetic/hue mapping notes).

### Lil Guys
- Trait compositing pattern: strict layering order + optional/weighted traits + export fallback.
- Explicit combinatorics analysis prevents unrealistic completion assumptions and informs sampling strategy.

### Objkt-Advisor
- Useful scoring framework for creator evaluation and repeatable ranking logic.
- API schema notes reduce GraphQL endpoint/query guesswork.

### Particle Painting
- WASM deploy lesson: Netlify issues were config/header/deploy-shape issues, not necessarily WASM incompatibility.
- FFmpeg WASM operational pattern: optimize caching and document first-load behavior.
- Wallet integration pattern: lazy-load wallet services and keep mint flow explicit (connect -> sign -> prepare metadata -> mint).
- Add troubleshooting matrix for wallet, export, and IPFS failures.

### Tezos-Intel
- Useful architecture pattern for Objkt/TzKT indexing with staged worker priorities, stale thresholds, and queue depth limits.
- Good insistence on verified data and rate-limit handling.

### Tezos-Scout
- Frontend requirements doc + explicit ingest/stats API endpoints are useful for quick implementation skills.

### WTF
- Security-audit-first discipline for marketplace contracts is reusable.
- Simple scripted SmartPy test+compile workflow is a good baseline for contract CI automation.

### album packager
- Export fidelity pattern: preview should render the same standalone payload used for final export.
- Product constraint pattern: single self-contained HTML package for token minting (no external calls).
- Validation pattern: Playwright capture + runtime-state logs + console-error checks for both builder and export.

### bootloader-project
- Deterministic generative art rules must be explicit (`BTLDR.rnd()` only, avoid non-deterministic random sources).
- Keep preview harness + deployment handoff steps documented.

### color wars
- Keep audit and debug reports close to project for large simulation systems.
- Complex simulation rules should be formalized in docs before implementation to avoid drift.

### dweet-bootloader
- Minimal-size generative runtimes benefit from strict deterministic PRNG and compact animation math patterns.

### fafo tax
- Full-stack scaffold pattern: start with working skeleton (backend+frontend+docs), then phase in blockchain integrations.
- Setup-complete docs reduce onboarding friction and help agents continue work safely.

### ledger-village
- On-chain-to-game derivation pattern: treat wallet state as civic simulation inputs, not direct power.
- Keep wallet snapshot data separate from local player layout state.
- Always ship demo/baseline fallback for dormant wallets or API unavailability.
- Keep read-only mode first; avoid requiring private-key signing for MVP.

### local-video-review-lab
- Strong local pipeline pattern: ffmpeg scene segmentation + transcript + vision review + text scoring + clip export.
- Model auto-discovery and project structure docs make agent continuation easier.

### model-match-lab
- Hardware-first deterministic benchmarking is a reusable lab pattern.
- Benchmark contracts/types enforce consistent telemetry, scoring, and runtime compatibility checks.
- Prioritized KV-cache sweeps and local-only benchmarks are useful reliability defaults.

### objkt-owned-editions-sorter
- Browser extension pattern: preserve stable original ordering and layer sorting heuristics non-destructively.

### p5js
- Recovery/iteration pattern: replace failing concept, keep smoke tests, then expand features with artifacted validation.
- Keep render/export parity and expose debug state for automated browser testing.

### porcupin-slideshow
- Data-separation pattern: source DB remains read-only, app state stored separately.
- Local export cache strategy for asset reconstruction from local API/IPFS bytes is reusable.

### projects
- `Artcessible Studios`: strong long-form operations/business documentation pattern with phased roadmap, checklists, and risk mitigation.
- `Breadfond 501c`: planning pattern for legal + technical + governance tracks with explicit next-step queues.
- `Lil Guys Platformer`: excellent multi-doc decomposition (design/tech/rigging/roadmap) for complex game builds.
- `Visualize Anything`: architecture audit + phased remediation plan is a great pattern for rescuing unstable rendering systems.
- `lil guy app`: comprehensive testing-first smart contract project pattern (full workflow tests, coverage, gas reporting, deploy checklists).
- `mafiabot`: secure game-state pattern where sensitive roles remain DB-side, not Discord role assignments.

### r00t
- Mission-rules + goals + decision logs pattern is strong for autonomous agent governance.
- Subagent registry pattern (who does what, when to invoke) is directly reusable for multi-agent systems.
- Tezos bible pattern: single-source reference, update-after-task discipline.
- Data strategy pattern: client-side first, bounded cache, avoid full indexer mirrors unless justified.
- Payment verification pattern: verify on-chain payment hashes before unlocking paid features.

### receipt finder
- Useful OAuth/API onboarding pattern with explicit output schema and optional enrichment (Brex matching).

### smartpy-test-platform
- Confirms need for dedicated SmartPy/Michelson local test harness tooling.

### taxmaster
- Privacy-first browser architecture (IndexedDB local storage + export/backup) is highly reusable.
- Tax logic docs should include legal disclaimers and jurisdiction-specific rule mapping.

### tezpulse
- Good baseline for Tezos art activity scanning from TzKT with explicit contract lists and endpoint usage.
- Cheat sheet highlights high-value indexer practices: cursor pagination, field selection, caching, and rate-limit backoff.

### tui_tools-main
- Security policy quality bar: file permission hardening, redaction rules, HTTPS endpoint normalization, CI audit gates.
- Useful CLI quality-gate command set (lint + bandit + dep audit).

### videozine-editor
- End-to-end packaging pattern for interactive mintable media (thumbnail generation, compile, local-contained export).
- Installation runbooks with ffmpeg verification and troubleshooting are strong agent handoff assets.

### vlm-video-archivist
- Model-first tool-calling pipeline design is reusable: ingest -> context compression -> search -> composition.
- API versioning/path aliasing and dashboard+API dual mode are strong architecture patterns.
- Structured model cheatsheet improves autonomous tool usage quality.

### wallet-constellations
- Local-first wallet analytics pattern: sync raw bundle once, derive multiple datasets/modules, cache locally.
- Module spine (typed module contract + registry) is a strong extensibility model.

### web3 simulator
- "Sync once, analyze many" pipeline pattern with resumable ingestion and offline re-analysis is high-value.
- Keep raw vs derived tables explicit to support simulation reproducibility.

### skllz
- Created to hold this skills-synthesis project and future skill design artifacts.

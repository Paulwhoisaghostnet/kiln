---
name: "tezos_objkt_visualization_workbench"
description: "Use when building Tezos or Objkt data visualizations and non-custodial game signal systems in Three.js or p5.js, including bounded query design, Objkt->TzKT fallbacks, deterministic QA, and browser-safe checkpoint workflows."
---

# tezos_objkt_visualization_workbench

## Quick Start
1. Pick a visualization or game-signal objective and row budget (50/200/500+ tiers).
2. Choose source path: Objkt GraphQL primary or TzKT-only.
3. Use bounded query templates with explicit `limit`, sort, and `select` fields.
4. Normalize into one canonical row model before rendering/mechanic mapping.
5. Add deterministic debug hooks and QA gates.

## When To Use
- Building Tezos/Objkt data visualizations in Three.js or p5.js.
- Building non-custodial games where chain data influences environment/abilities only.
- Prototyping browser-only data pipelines before backend ingestion is complete.
- Implementing fallback-safe, rate-limit-resilient visual experiences.

## Inputs Required
- Target source(s): `objkt`, `tzkt`, or mixed.
- Mode: visualization-only or game-signal mapping.
- Dataset size target and refresh cadence.
- UX requirements for empty/error/stale states.

## Workflow
1. Define source contract and fallback policy.
2. Fetch bounded windows with monotonic ordering.
3. Normalize and annotate provenance (`objkt`, `tzkt`, `fallback`).
4. Render with row-tier-aware decimation defaults or map signals to bounded mechanics.
5. Add deterministic hooks and snapshot metadata.
6. Validate with QA checklist and rate-limit drills.

## Guardrails
- Do not render directly from raw API shape; normalize first.
- Do not hide fallback switches; expose provenance clearly.
- Do not run unbounded pulls in browser prototypes.
- Do not ship without empty/error/stale state UX.
- Do not skip deterministic debug metadata on data-heavy visuals.
- For games: no wallet, no signing, no token operations.

## Reference Map
- `references/frontend-tezos-viz-starter-kit.md` -> end-to-end Three.js/p5.js starter patterns.
- `references/objkt-graphql-query-recipes.md` -> Objkt query templates + caveats.
- `references/objkt-to-tzkt-fallback-map.md` -> field mapping and switchover triggers.
- `references/marketplace-entrypoint-dictionary.md` -> entrypoint sets by workflow/version.
- `references/wallet-signal-mapping-and-smoothing.md` -> pulse/signal mapping + outlier handling.
- `references/client-checkpoint-prototype-patterns.md` -> local checkpoint state patterns.
- `references/render-thresholds-and-decimation.md` -> readability/perf thresholds.
- `references/blockchain-signal-to-game-mechanics-cookbook.md` -> data-signal to game-loop mapping recipes.
- `references/game-balancing-volatility-guardrails.md` -> anti-spike balancing defaults.
- `references/non-custodial-game-compliance-checklist.md` -> strict non-custodial game constraints.
- `references/game-fallback-and-stale-state-ux.md` -> degraded-mode game UX patterns.
- `references/deterministic-qa-checklist.md` -> deterministic QA and debug hooks.
- `references/quality-checklist.md` -> release gate.
- `references/sandbox-evidence.md` -> multi-round evidence synthesis.

## Output Contract
Return:
- source/fallback design,
- query + normalization plan,
- visualization/mechanics mapping rules,
- deterministic QA plan,
- residual risks and fallback behavior.

## Validation Checklist
- Bounded queries and monotonic order enforced.
- Canonical row model used across primary/fallback sources.
- Empty/error/stale/rate-limit UX verified.
- Deterministic debug hooks available.
- Readability or playability maintained at target row tiers.

## Failure Modes + Recovery
- Objkt schema drift: switch to mapped TzKT fallback and log provenance.
- 429 burst: apply bounded backoff and stale-state retention.
- Visual overload: switch to aggregated encoding and show decimation counters.
- Gameplay spike: apply clamp + smoothing and preserve minimum agency floor.
- Non-deterministic debug state: disable random jitter and lock query windows.

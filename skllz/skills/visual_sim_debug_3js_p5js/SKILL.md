---
name: "visual_sim_debug_3js_p5js"
description: "Use for debugging 3js/p5js visual simulations with deterministic hooks, fixed-step controls, and artifacted visual regression validation."
---

# visual_sim_debug_3js_p5js

## Quick Start
1. Add deterministic hooks (`render_game_to_text`, fixed-step advance helpers).
2. Reproduce issue with controlled seed/time path.
3. Patch one hypothesis at a time.
4. Capture screenshot + state JSON artifacts for each pass.
5. Accept only fixes that pass deterministic regression checks.

## When To Use
- 3js/p5js simulations with unstable or non-reproducible behavior.
- Visual regressions requiring artifact-backed validation.
- Data-heavy Tezos/Objkt visualizations that need deterministic QA.
- Time-driven systems that drift or diverge over long runs.

## Inputs Required
- Reproduction scenario and expected visual behavior.
- Simulation code paths and render-loop ownership.
- Seed/time control availability.
- Artifact output paths.

## Workflow
1. Establish deterministic runtime controls and baseline capture.
2. Replace raw elapsed-time coupling with fixed-step simulation updates.
3. Isolate and patch one subsystem (physics, weather, camera, shading, data mapping) per iteration.
4. Capture artifacts for start/after/long-run checkpoints.
5. Compare state deltas and visual output against baseline.
6. Promote only if no new regressions are introduced.

## Evidence-Backed Guardrails
- Never accept visual fixes without artifact evidence.
- Keep deterministic debug hooks available after fix.
- Avoid hidden runtime fetch/log side effects in simulation hot paths.
- Bound long-run phases to avoid unbounded time drift.
- Prefer small targeted passes over multi-system speculative rewrites.

## Reference Map
- `references/deterministic-debug-loop.md` -> debug loop and pass discipline.
- `references/artifact-matrix-template.md` -> required artifact outputs.
- `references/data-viz-deterministic-qa.md` -> deterministic QA tiers, latency targets, and decimation defaults for data-driven visuals.
- `references/tezos-viz-debug-hooks.md` -> snapshot metadata hooks for Tezos/Objkt visualization debugging.
- `references/quality-checklist.md` -> release gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox simulation projects.

## Output Contract
Return:
- root-cause summary,
- precise code changes,
- artifact links/paths and state samples,
- regression verdict,
- residual risk and next experiment.

## Validation Checklist
- Reproduction is deterministic.
- Console/runtime errors are clean or categorized.
- Visual output is improved without adjacent regressions.
- State metrics support observed visual outcome.
- Debug hooks remain available for future regressions.

## Failure Modes + Recovery
- Non-repro bug: tighten seed/time control and narrow subsystem scope.
- Partial fix: split into smaller hypotheses and re-run artifact matrix.
- New regressions: revert/adjust failing subsystem and revalidate baseline.

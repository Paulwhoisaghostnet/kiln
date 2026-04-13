# Sandbox Evidence

## Sources
- `3js projects/adrift/progress.md`
- `p5js/progress.md`

## Lessons Applied
1. Fixed-step simulation and bounded phase accumulation reduce long-run instability.
2. Deterministic hooks (`render_game_to_text`, time advance helpers) are essential for reproducible debugging.
3. Artifact-driven passes (screenshots + state JSON) make regressions visible and auditable.
4. Wrap/edge artifacts and camera regressions are best solved through targeted, single-hypothesis passes.
5. Maintaining debug instrumentation after fixes accelerates future stabilization work.

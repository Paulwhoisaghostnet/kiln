# Deterministic Debug Loop

1. Reproduce with fixed seed/time controls.
2. Capture baseline artifact pack (`shot`, `state`, `console`).
3. Patch one hypothesis only.
4. Re-run same deterministic path.
5. Compare metrics and visuals.
6. Repeat until stable; avoid multi-variable edits per pass.

## Required Hooks
- `window.render_game_to_text()` for compact state capture.
- Fixed-step advance helper (for example `window.advanceTime(...)`).
- Seed or baseline mode to remove random variance.

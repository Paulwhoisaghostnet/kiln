# Game Balancing Volatility Guardrails

## Mandatory Controls
- Clamp every mapped mechanic output.
- Use rolling windows rather than single-sample reactions.
- Interpolate mechanic changes (lerp/smoothing) over time.
- Recompute at fixed intervals, not every frame.

## Recommended Bounds
- Hazard bias: clamp to approximately `[0.18, 0.78]`.
- Boost bias: clamp to approximately `[0.09, 0.55]`.
- Cooldown floor: maintain reaction-safe minimum (>=250ms equivalent).
- Maintain minimum player mobility and recovery chance in all modes.

## Anti-Frustration Patterns
- Grace windows after consecutive failures.
- Temporary cooldown softening in spike regimes.
- Keep score penalties smaller than full resets in volatile windows.

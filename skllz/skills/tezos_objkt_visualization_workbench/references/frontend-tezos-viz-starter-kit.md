# Frontend Tezos Viz Starter Kit

## Three.js Starter Flow
1. Fetch bounded rows (`limit`, `sort.desc=id`, `select`).
2. Normalize to `{id, ts, value, source, tags}`.
3. Build geometry from normalized rows.
4. Expose `window.render_game_to_text()` for deterministic snapshots.

## p5.js Starter Flow
1. Fetch bounded rows and precompute scaled signals.
2. Use tier-based rendering (full glyphs <=500 rows, aggregated lanes beyond).
3. Keep a stale-state snapshot for failure fallback.

## Browser Safety Defaults
- Initial `limit`: 100-300.
- Use explicit retry cap (3-4) with exponential backoff.
- Keep filter/query params visible in status panel.

# Data Visualization QA Standard (3js/p5js)

## Functional checks
- Handles 50, 200, and 500-row datasets without breaking UI.
- Empty-state and error-state messaging are explicit and non-blocking.
- Source/fallback mode is visible when multiple upstreams exist.

## Determinism checks
- `window.render_game_to_text()` reports core state (counts, filters, source mode).
- Query params fixed in regression mode.
- Random effects disabled or seeded in debug mode.

## Performance checks
- First paint under 2s for baseline row count.
- No geometry/material leak during repeated refresh cycles.
- Decimation/aggregation enabled for large datasets.

## UX checks
- Filter controls preserve last successful state on error.
- Rate-limit cooldown is visible to user.
- Readability preserved for low and high activity windows.

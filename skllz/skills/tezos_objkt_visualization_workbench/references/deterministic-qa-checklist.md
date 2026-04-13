# Deterministic QA Checklist

- `window.render_game_to_text()` returns provenance + counters.
- Query params fixed for repro mode.
- Random jitter disabled or seeded.
- Empty/error/stale/rate-limit states verified.
- Refresh and retry timings are visible to user.

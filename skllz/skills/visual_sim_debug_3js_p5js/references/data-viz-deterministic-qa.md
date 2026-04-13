# Data Viz Deterministic QA

## Required Hook
Expose a deterministic snapshot helper, for example:
- `window.render_game_to_text()` returning row count, source mode, filters, and core metrics.

## QA Tiers
- Small: 50 rows
- Medium: 200-500 rows
- Large: >500 rows with decimation

## Latency + Render Targets
- Initial paint target: <2s for baseline tier.
- Refresh target: <1s for <=200 row updates.
- Degraded mode: keep last-good state visible on failure.

## Decimation Defaults
- >500 rows: aggregate or sample by time bucket.
- >2000 rows: force lane/heatmap mode over per-item glyph mode.
- Always preserve an inspectable summary counter for dropped/aggregated rows.

## UX Pass Criteria
- Status line always reflects `loading/success/error`.
- Empty-state and stale-state UX are visible.
- Rate-limit cooldown state is visible to user.
- Source provenance (`objkt`, `tzkt`, `fallback`) is explicit.

## Rate-Limit Resilience Checks
- Verify 429 backoff behavior.
- Verify stale snapshot fallback behavior.
- Verify retry timing is visible to user.

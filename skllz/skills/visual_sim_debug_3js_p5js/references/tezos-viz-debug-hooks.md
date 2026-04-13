# Tezos Viz Debug Hooks

## Minimal Metadata Export
Return at least:
- `rows`
- `source` (`objkt`, `tzkt`, `fallback`)
- `filters`
- `last_id` or `last_level`
- domain-specific counts (lanes, batches, latest timestamp)

## Debug Discipline
1. Keep query params fixed during bug repro.
2. Disable unseeded/random visual jitter in debug mode.
3. Test fallback path explicitly and include provenance in snapshot metadata.
4. Include decimation counters when large-window aggregation is active.

## Example Hook
```js
window.render_game_to_text = () => ({
  rows: state.rows.length,
  source: state.sourceMode,
  filters: state.activeFilters,
  last_id: state.lastId,
  decimated: state.decimatedCount,
});
```

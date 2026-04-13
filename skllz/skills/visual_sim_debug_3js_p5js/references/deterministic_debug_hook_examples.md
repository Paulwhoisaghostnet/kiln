# Deterministic Debug Hook Examples

## Minimal state export
```js
window.render_game_to_text = () => ({
  project: "my-tezos-viz",
  rowCount,
  filters,
  sourceMode,
  lastCursor,
});
```

## Regression mode toggle
```js
const DEBUG_MODE = true;
if (DEBUG_MODE) {
  disableRandomJitter();
  lockQueryWindow();
}
```

## Checkpoint debug data
Include at least:
- `last_id` or `last_level`
- row counts per batch
- source provenance (`objkt` vs `tzkt`)

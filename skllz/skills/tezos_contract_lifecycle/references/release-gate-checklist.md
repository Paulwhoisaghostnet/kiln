# Release Gate Checklist

- All selected style variants compile with zero errors.
- Expected `step_*_cont_0_contract.json` outputs exist for each style.
- Michelson JSON/TS artifacts are regenerated and synced to consumer paths.
- Client style IDs resolve to real artifacts and valid entrypoints.
- Security entrypoints (admin/allowlist/blocklist/withdraw paths) are tested.
- Contract operation size and protocol limits are checked before deploy.
- Network target and chain assumptions are explicit in deployment notes.

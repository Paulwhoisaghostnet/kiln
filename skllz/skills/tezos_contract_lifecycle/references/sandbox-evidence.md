# Sandbox Evidence

## Sources
- `Bowers/scripts/compile-contracts.sh`
- `Bowers/BOWERS_MEMORY.md`
- `Bowers/.cursor/rules/tezos-contract-deployment.md`

## Lessons Applied
1. Multi-style Tezos projects need deterministic style resolution to avoid deployment mismatches.
2. Compile pipelines should hard-fail on missing output directories or missing contract JSON artifacts.
3. Artifact sync is part of correctness, not a post-step; runtime/client breakage comes from stale Michelson assets.
4. Protocol limits and entrypoint coverage checks must be part of deploy readiness.
5. Security-critical entrypoints (blocklist, admin, mint, marketplace) require style-wide test coverage.

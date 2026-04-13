# Sandbox Evidence

## Sources
- `tezpulse/TZKT_API_CHEATSHEET.md`
- `web3 simulator/nft-pipeline/README.md`
- `Tezos-Intel/replit.md`
- `r00t/docs/data-strategy.md`

## Lessons Applied
1. Cursor pagination (`offset.cr`) and selective fields improve large-sync reliability.
2. Rate-limit-aware retries are mandatory for TzKT-heavy ingestion.
3. The best pattern is sync once, analyze many times; keep analysis decoupled from API calls.
4. Long-running indexers benefit from priority worker queues, stale thresholds, and batch upserts.
5. Full-chain mirroring is often unnecessary; bounded, product-specific scopes reduce cost and complexity.

# Sandbox Evidence

## Sources
- `Bowers/.cursor/rules/tezos-contract-deployment.md`
- `Bowers/BOWERS_MEMORY.md`

## Lessons Applied
1. Wallet-connected browser dApps are most reliable through wallet API operation flow.
2. Chain verification before origination prevents wrong-network deployment.
3. Duplicate Beacon/DApp client creation can trigger opaque `UNKNOWN_ERROR` failures.
4. Provider-specific origination behavior (for example, simulation bugs) needs explicit user remediation.
5. Contract address extraction must use operation confirmation data, not op-hash string tricks.

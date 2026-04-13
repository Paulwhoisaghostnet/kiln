# Non-Custodial Game Compliance Checklist

- Read-only blockchain/indexer endpoints only.
- No wallet SDK connection, permission requests, or signer paths.
- No token operations (transfer/mint/swap/list/collect).
- Data used only as environment/mechanics influence.
- UI copy explicitly states non-custodial behavior.
- Debug state includes source provenance and fallback flags.

## Red-Flag Scan
Search for and remove flows containing: `wallet`, `beacon`, `sign`, `inject`, `originate`, token write endpoints.

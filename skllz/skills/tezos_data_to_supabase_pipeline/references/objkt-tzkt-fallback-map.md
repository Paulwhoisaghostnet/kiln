# Objkt to TzKT Fallback Map

Use this map when Objkt GraphQL is unavailable or partially degraded.

| Objkt Field | TzKT Substitute | Notes |
|---|---|---|
| `token.token_id` | `tokens.tokenId` | stable token key |
| `token.holders` | `tokens.holdersCount` | holder count approximation |
| `token.supply` | `tokens.totalSupply` | supply metric substitute |
| `token.name` | `tokens.metadata.name` | may be missing |

## Switchover Triggers
- Objkt HTTP/network failure.
- Objkt schema/null mismatch for required fields.
- Objkt response empty for known active collection.

# Objkt to TzKT Fallback Map

| Objkt Field | TzKT Substitute | Notes |
|---|---|---|
| `token_id` | `tokens.tokenId` | stable token key |
| `supply` | `tokens.totalSupply` | supply substitute |
| `holders` | `tokens.holdersCount` | holder substitute |
| `name` | `tokens.metadata.name` | nullable |

## Switchover Triggers
- GraphQL transport error.
- Required fields missing/null-heavy.
- Empty response for known active contract.

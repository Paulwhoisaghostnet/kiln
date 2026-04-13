# Objkt -> TzKT Fallback Mapping

Use this when Objkt GraphQL is unavailable or partially missing fields.

## Field map
- Objkt `token.token_id` -> TzKT `tokens.tokenId`
- Objkt `token.supply` -> TzKT `tokens.totalSupply`
- Objkt `token.holders` -> TzKT `tokens.holdersCount`
- Objkt `token.name` -> TzKT `tokens.metadata.name` (nullable)

## Fallback triggers
- GraphQL HTTP error
- Empty GraphQL dataset for known active contract
- Unexpected null-heavy schema response

## Fallback workflow
1. Attempt Objkt GraphQL query.
2. On failure, fetch bounded TzKT token list.
3. Normalize both sources into one canonical shape.
4. Mark row/source provenance for debugging and QA.

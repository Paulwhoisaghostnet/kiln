# Objkt GraphQL Query Recipes

## Collection Tokens (template)
```graphql
query CollectionTokens($fa2: String!, $limit: Int!) {
  token(where: {fa_contract: {_eq: $fa2}}, limit: $limit) {
    token_id
    name
    supply
    holders
  }
}
```

## Guardrails
- Keep queries field-minimal for browser prototypes.
- Treat null-heavy responses as schema drift risk.
- Record query version and source mode in debug state.

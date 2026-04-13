# Frontend API Query Cookbook (Tezos Data Prototypes)

Use these patterns when prototyping browser-side Tezos data flows before backend ingestion is finalized.

## Transactions (bounded window)
`GET /v1/operations/transactions?status=applied&limit=200&sort.desc=id&select=id,level,timestamp,amount,status,sender,target,entrypoint`

## Transactions by marketplace target
`GET /v1/operations/transactions?target=KT1...&status=applied&limit=200&sort.desc=id&select=id,level,timestamp,amount,entrypoint`

## Transactions by entrypoint
`GET /v1/operations/transactions?entrypoint=collect&status=applied&limit=200&sort.desc=id&select=id,level,timestamp,amount,target`

## Wallet account summary
`GET /v1/accounts/{address}`

## Wallet balance history
`GET /v1/accounts/{address}/balance_history?limit=120&sort.desc=level`

## Token set by contract
`GET /v1/tokens?contract=KT1...&limit=120&sort.desc=id`

## Query safety defaults
- Always set explicit `limit`.
- Prefer `sort.desc=id` for latest-window pulls.
- Use `select` to minimize payload when only visualization fields are needed.
- Start with 100-300 rows for browser-safe first paint.

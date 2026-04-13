# Tezos Superstack Routing Matrix

## Scope -> Sub-skill
- Contract implementation, compile, release gating -> `tezos_contract_lifecycle`
- Wallet connect/network/origination reliability -> `tezos_dapp_wallet_ops`
- Chain/indexer extraction into Supabase -> `tezos_data_to_supabase_pipeline`
- Tezos/Objkt browser visualization systems -> `tezos_objkt_visualization_workbench`
- Non-custodial chain-influenced game systems -> `tezos_objkt_visualization_workbench` + `game_systems_and_liveops`

## Mixed Dependencies
1. Contract changes first (defines callable surface and artifacts).
2. Wallet flow validation second (verifies operation paths against deployed shape).
3. Data pipeline third (indexes and verifies resulting chain behavior/state).
4. Visualization fourth (renders from verified/normalized data contracts).
5. Game-influence fifth (maps bounded signals into gameplay loops).

## Escalation Rules
- If contract artifacts are stale, stop and return blocker.
- If chain/network mismatch exists, stop wallet/data operations.
- If pipeline verification fails, return partial success with explicit replay plan.
- If visualization/gameplay is using fallback data source, mark provenance in final report.

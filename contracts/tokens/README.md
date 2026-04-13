# Token Contract Set (FA2 Fungible)

This folder contains five fixed-supply FA2 fungible test token contracts for shadownet.

All five contracts compile to the same 12-entrypoint profile:

- `admin`
- `assets`
- `balance_of`
- `burn_tokens`
- `confirm_admin`
- `create_token`
- `mint_tokens`
- `pause`
- `set_admin`
- `tokens`
- `transfer`
- `update_operators`

## Source Of Truth

- `fa2_test_tokens.py` is the SmartPy source.
- `scripts/compile-token-contracts.sh` compiles and syncs all artifacts.
- `npm run compile:tokens` runs the same flow from `package.json`.

## Token Scale

The value/supply ladder follows the requested 10x tiering:

| Token | Supply | Decimals | Value Tier |
| --- | ---: | ---: | --- |
| Test Bronze | 100,000,000 | 8 | `bronze = 0.1 silver` |
| Test Silver | 10,000,000 | 7 | `silver = 0.1 gold` |
| Test Gold | 1,000,000 | 6 | `gold = 0.1 platinum` |
| Test Platinum | 100,000 | 5 | `platinum = 0.1 diamond` |
| Test Diamond | 10,000 | 4 | top tier |

## Generated Artifacts Per Token

Each token has:

- `test-<token>.tz` (Michelson contract)
- `test-<token>.storage.tz` (Michelson initial storage expression)
- `test-<token>.storage.json` (Micheline JSON storage)
- `test-<token>.contract.json` (Micheline JSON contract)
- `test-<token>.types.py` (SmartPy-generated type hints)

## Deployment Note

Generated storage files use placeholder address:

- `tz1burnburnburnburnburnburnburjAYjjX`

Before origination, replace that address with the wallet address that should be both:

- `administrator`
- initial supply holder (ledger owner for token `0`)

# Tezos Kiln (Shadownet)

Tezos Kiln is a typed React + Express test rig for:
- Michelson token-address injection
- Contract origination on Tezos shadownet
- Dynamic entrypoint execution
- Wallet balance visibility for test accounts

## Prerequisites

- Node.js 22+
- `WALLET_A_SECRET_KEY` / `WALLET_B_SECRET_KEY` funded on shadownet

## Setup

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
3. Fill in required values in `.env`.

## Local Development

```bash
npm run dev
```

## Production Start

```bash
npm run build
npm run start
```

`npm run start` launches with `NODE_ENV=production`.

## Quality Gates

- Typecheck:
  ```bash
  npm run lint
  ```
- Unit + integration tests with coverage:
  ```bash
  npm test
  ```
- Full local gate:
  ```bash
  npm run check
  ```

## Shadownet Smoke Test

The smoke suite is opt-in to avoid accidental chain calls.

```bash
RUN_SHADOWNET_TESTS=true npm run test:shadownet
```

## Security Controls Included

- Request body validation with `zod`
- Optional API token auth via `API_AUTH_TOKEN`
- Mutation route rate limiting
- Optional chain-id mismatch blocking via `TEZOS_CHAIN_ID`
- CORS allowlist support via `CORS_ORIGINS`

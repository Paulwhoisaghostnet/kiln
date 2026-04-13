# Tezos Kiln (Shadownet)

Tezos Kiln is a typed React + Express test rig for:
- Michelson token-address injection
- Pre-deployment contract validation (structure + RPC origination estimate)
- Contract origination on Tezos shadownet
- Connected-wallet deployment via Beacon (Temple + Kukai shadownet)
- Dynamic entrypoint execution
- Post-deploy Bert/Ernie puppet-wallet E2E execution
- Wallet balance visibility for test accounts
- Netlify production hosting (SPA + serverless API)

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

### Testing phases

- `Run Pre-Deploy Tests`: validates Michelson shape (`parameter`/`storage`/`code`), parses entrypoints, verifies token injection, and requests a safe origination estimate.
- `Deploy with Connected Wallet`: deploys from the user’s connected shadownet wallet (with optional burn-placeholder admin replacement).
- `Run Bert + Ernie E2E`: executes post-deploy calls from puppet wallets controlled by the suite.

## Production Start

```bash
npm run build
npm run start
```

`npm run start` launches with `NODE_ENV=production`.

## Netlify Production Deployment

This repo is now pre-configured for Netlify:
- `netlify.toml` sets:
  - build command: `npm run build`
  - publish dir: `dist`
  - functions dir: `netlify/functions`
  - `/api/*` rewrites to `/.netlify/functions/api/:splat`
  - SPA fallback `/* -> /index.html`
- `netlify/functions/api.ts` runs the existing Express API in a Netlify Function.

### Local Netlify emulation

```bash
npm run netlify:dev
```

### Deploy commands

Preview deploy:
```bash
npm run netlify:deploy:preview
```

Production deploy:
```bash
npm run netlify:deploy:prod
```

### Required Netlify environment variables

Set these in Netlify Site Settings -> Environment Variables:

- `TEZOS_RPC_URL`
- `TEZOS_CHAIN_ID` (recommended to pin for safety)
- `WALLET_A_SECRET_KEY`
- `WALLET_B_SECRET_KEY`
- `KILN_TOKEN_BRONZE`
- `KILN_TOKEN_SILVER`
- `KILN_TOKEN_GOLD`
- `KILN_TOKEN_PLATINUM`
- `KILN_TOKEN_DIAMOND`

Optional:
- `KILN_DUMMY_TOKENS` (legacy fallback list)
- `API_AUTH_TOKEN`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX`
- `API_JSON_LIMIT`
- `CORS_ORIGINS`

### Same-origin/CORS configuration (important)

Ideal Netlify setup is same-origin:
- Frontend and API live under the same Netlify domain.
- Frontend calls relative `/api/...` routes (already implemented).
- Leave `CORS_ORIGINS` empty in production for strict same-origin behavior.

If you must allow external origins:
- Set `CORS_ORIGINS` as a comma-separated allowlist.
- Wildcard preview domains are supported, e.g.:
  - `https://*.netlify.app`
  - `https://your-prod-domain.com`

### Netlify-specific operational notes

- Contract origination + confirmation can be slow on shadownet.
- Netlify Functions have execution limits; long confirmation waits may time out.
- If this happens in production, ideal architecture is:
  - keep frontend on Netlify
  - move long-running chain operations to a dedicated backend worker/API.

## Quality Gates

- Typecheck:
  ```bash
  npm run lint
  ```
- Unit + integration tests with coverage:
  ```bash
  npm test
  ```
  `npm test` runs a preflight check that ensures compiled token artifacts
  (`test-*.tz`/storage json) are up-to-date with `contracts/tokens/fa2_test_tokens.py`.
- Full local gate:
  ```bash
  npm run check
  ```

## Shadownet Smoke Test

The smoke suite is opt-in to avoid accidental chain calls.

```bash
RUN_SHADOWNET_TESTS=true npm run test:shadownet
```

## Compile FA2 Test Token Contracts

Compiles the five fixed-supply FA2 fungible test tokens (bronze, silver, gold,
platinum, diamond) and syncs artifacts into `contracts/tokens/`.

```bash
npm run compile:tokens
```

## Deploy FA2 Test Token Contracts

Deploys the compiled FA2 token contracts on shadownet and prints a ready-to-paste
`KILN_DUMMY_TOKENS=...` value in bronze->diamond order.

```bash
npm run deploy:dummy-tokens
```

Optional: choose deployer wallet (`A` by default):

```bash
DUMMY_TOKEN_DEPLOYER=B npm run deploy:dummy-tokens
```

After deployment, copy the printed KT1 list into `.env`:

```bash
KILN_DUMMY_TOKENS=KT1...,KT1...,KT1...,KT1...,KT1...
KILN_TOKEN_BRONZE=KT1...
KILN_TOKEN_SILVER=KT1...
KILN_TOKEN_GOLD=KT1...
KILN_TOKEN_PLATINUM=KT1...
KILN_TOKEN_DIAMOND=KT1...
```

## Security Controls Included

- Request body validation with `zod`
- Optional API token auth via `API_AUTH_TOKEN`
- Mutation route rate limiting
- Optional chain-id mismatch blocking via `TEZOS_CHAIN_ID`
- Production same-origin default (no open CORS by default)
- CORS allowlist support via `CORS_ORIGINS` (with `https://*.domain` wildcard support)

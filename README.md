# Tezos Kiln — Multi-Network Contract Rig

Tezos Kiln is a typed React + Express test rig that covers the contract
lifecycle across the Tezos family of networks in one environment:

- Tezos Shadownet (sandbox — pre-funded puppets, free-spend testing)
- Etherlink Shadownet (Solidity via faucet funds)
- Tezos Mainnet (connected-wallet only, puppets disabled)
- Etherlink Mainnet (connected MetaMask only, real XTZ)

The UI is a six-tab stepper — **Setup → Build → Validate → Deploy → Test →
Handoff** — with progressive unlock, shared session state, URL-hash routing,
a persistent terminal dock, and a mainnet consent modal that blocks real-fund
flows until the user acknowledges risk.

## Capabilities

### Tezos rails (Michelson + SmartPy)

- Michelson token-address injection
- Pre-deployment contract validation (structure + RPC origination estimate)
- Staged workflow gate: compile -> validate -> audit -> simulate -> shadowbox runtime -> clearance
- Contract origination on Shadownet or Tezos Mainnet
- Connected-wallet deployment via Beacon (Temple + Kukai)
- Dynamic entrypoint execution
- Post-deploy Bert/Ernie puppet-wallet E2E (Shadownet only)
- Guided contract creation wizard (FA2 fungible, NFT collection, marketplace)
- Reference-informed guided element slicing from `reference/` examples
- SmartPy scaffold + Michelson test-stub generation for layman workflows

### Etherlink rails (Solidity via viem + solc-js)

- Server-side Solidity compile with configurable evm-version and optimizer runs
- Static audit of the compiled bytecode (selector collisions, empty deployed
  code, deprecated opcodes) folded into the same clearance object as Tezos
- Gas + fee estimation with `eth_estimateGas` / `eth_feeHistory` headroom
- `eth_call` dry-run against the pending nonce
- Connected-wallet deploy from MetaMask (EIP-1193) with auto chain-switch /
  chain-add for Etherlink Shadownet (`0x1f34f`) and Mainnet (`0xa729`)
- Stale Etherlink Ghostnet testnet metadata is kept as a hidden legacy profile,
  not an active network card.

### Shared

- Ecosystem-aware capability matrix surfaced in `/api/networks` and enforced on
  every server route (returns HTTP 412 with `capability: "<flag>"` on misuse).
- Per-request Tezos + Etherlink service pools keyed by `networkId`, so a single
  running server can serve all four networks without restarts.
- Activity logging for HTTP + workflow/audit events (troubleshooting/audit trail)
- Mainnet-readiness bundle export as a zipped release package
- Browser-scoped `kiln.project.json` workspace model with a file tree and
  contract graph. This is intentionally not arbitrary host filesystem browsing.
- No-stub status reporting: unsupported runtime behavior is marked blocked or
  unavailable instead of returning a fake success state.
- Wallet balance visibility for test accounts (puppets only; reports
  `puppetsAvailable: false` on every non-Shadownet network)
- Native Hetzner hosting (systemd) as the primary runtime; Netlify remains as
  rollback until the native deploy is signed off.

## Network tier matrix

Capability flags come straight from `src/lib/networks.ts` and are what the
server uses to decide which routes to accept for a given `networkId`. The UI
mirrors the same flags to grey out buttons before the request is even made.

| Network             | Ecosystem | Tier    | Puppet wallets (Bert/Ernie) | Connected wallet | Source languages       | Post-deploy E2E |
|---------------------|-----------|---------|-----------------------------|------------------|------------------------|-----------------|
| `tezos-shadownet`   | tezos     | sandbox | yes                         | Beacon           | michelson, smartpy     | yes             |
| `tezos-ghostnet`    | tezos     | testnet | no                          | Beacon           | michelson, smartpy     | no (planned)    |
| `tezos-mainnet`     | tezos     | mainnet | **no — blocked**            | Beacon           | michelson, smartpy     | yes             |
| `etherlink-shadownet` | etherlink | testnet | no                        | MetaMask         | solidity               | yes             |
| `etherlink-mainnet` | etherlink | mainnet | **no — blocked**            | MetaMask         | solidity               | yes             |

Planned/legacy profiles are returned separately from active cards:
`tezos-ghostnet`, `etherlink-testnet` (legacy Ghostnet-era Etherlink), and
`jstz-local`. jstz stays planned until a real local/configurable adapter is
implemented and tested.

Server-side guards:

- Attempting `/api/kiln/upload`, `/api/kiln/execute`, or `/api/kiln/e2e/run`
  against any mainnet returns HTTP 412 with
  `{"capability":"puppetWallets"}`.
- Attempting `/api/kiln/evm/*` against a Tezos network returns HTTP 412 with
  an ecosystem-mismatch message, and vice-versa.
- `GET /api/kiln/balances` short-circuits to
  `{"puppetsAvailable": false, "walletA": null, "walletB": null}` on every
  non-Shadownet network rather than erroring out — that way the UI renders
  a clean "puppets n/a" state on mainnet without a red banner.

## Six-tab flow

The app is organised as a stepper with URL-hash routing (`#setup`, `#build`,
`#validate`, etc.) and progressive unlock. Tabs that aren't ready yet are
visible but disabled, which makes the dependency chain legible at a glance.

1. **Setup** — pick a network via `NetworkSwitcher`, confirm the
   `MainnetConsentModal` if moving to a mainnet tier, and (for Tezos)
   connect a Beacon wallet or inspect Bert/Ernie balances. EVM networks
   show a MetaMask prompt.
2. **Build** — write or upload source. The panel swaps between a Michelson
   + SmartPy editor (Tezos) and a Solidity editor backed by the
   `SolidityPanel` (Etherlink) depending on the active ecosystem.
3. **Validate** — compile → validate → audit → simulate → shadowbox runtime → clearance.
   Results render in `WorkflowResultsPanel` with uniform stats regardless of
   ecosystem. No clearance, no deploy.
4. **Deploy** — connected-wallet or Bert deploy on Tezos, connected-MetaMask
   deploy on Etherlink. Clearance record id is carried forward so the
   deploy transaction can be tied back to a specific validate run.
5. **Test** — post-deploy entrypoint execution with Bert/Ernie on
   Shadownet, or live `eth_call` / dry-run on Etherlink.
6. **Handoff** — mainnet-readiness bundle export (zip of artifacts,
   workflow trace, clearance, deployed address, and network metadata).

A persistent terminal dock follows you across every tab, and the session
summary pill shows the active source, clearance id, and deployed contract
so the "where am I" question never needs a scroll.

## Prerequisites

- Node.js 22+
- `WALLET_A_SECRET_KEY` / `WALLET_B_SECRET_KEY` funded on shadownet (only used
  when the active network is `tezos-shadownet`)

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

- `Run Full Workflow`: compiles SmartPy (when needed), validates Michelson shape (`parameter`/`storage`/`code`), parses entrypoints, runs static audit, runs simulated entrypoint activity, runs optional shadowbox runtime checks, and issues deployment clearance when all required gates pass.
- `Deploy with Connected Wallet`: deploys from the user’s connected shadownet wallet (with optional burn-placeholder admin replacement).
- `Deploy with Bert`: deploys via server signer (`wallet A`) and enforces workflow clearance by default.
- `Run Bert + Ernie E2E`: executes post-deploy calls from puppet wallets controlled by the suite.
- Tezos execute/E2E payloads support `amountMutez` for payable entrypoints.
- E2E payloads can target per-step contract addresses. Storage, balance, and
  big-map assertions are accepted by schema but fail closed until the runtime
  reader layer is implemented.
- `Guided Contract Creator`: optional wizard that generates either SmartPy scaffolds (for real build pipelines) or deployable Michelson stubs (for fast predeploy/deploy/E2E flow checks).
- `Guided Contract Creator` can now load reference-derived contract elements (admin controls, pause, operators, allowlists, royalties, fee controls) sliced from contracts in `reference/`.
- `Contract Injector` supports SmartPy source loading from `.py`, `.smartpy`, `.sp`, or `.txt` files (same compile path as the workflow).
- When SmartPy source is loaded, Kiln compiles it server-side before predeploy tests and deployment.

## Production Start

```bash
npm run build
npm run start
```

`npm run start` launches with `NODE_ENV=production`.

## Netlify Production Deployment

This repo is now pre-configured for Netlify:
- `netlify.toml` sets:
  - build command: `bash scripts/netlify-build.sh` (Vite build plus a **Linux standalone Python** with `smartpy-tezos` under `vendor/kiln-python`, zipped into the API function so SmartPy workflow/compile works—Netlify’s Node runtime does not include system Python)
  - publish dir: `dist`
  - functions dir: `netlify/functions`
  - `/api/*` rewrites to `/.netlify/functions/api/:splat`
  - SPA fallback `/* -> /index.html`
- `netlify/functions/api.ts` runs the existing Express API in a Netlify Function.
- Optional: set **`KILN_PYTHON`** to an absolute Python path if you self-host and want a specific interpreter (otherwise the bundled `vendor/kiln-python` is used on Netlify, then `python3` on PATH elsewhere).

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

Set these in Netlify Site Settings → Environment variables (use the same names for **Production** and **Deploy previews** unless you intentionally split them):

- `TEZOS_RPC_URL`
- `TEZOS_CHAIN_ID` (recommended to pin for safety)
- `KILN_NETWORK` (`tezos-shadownet` today; architecture supports future network expansion)
- `WALLET_A_SECRET_KEY`
- `WALLET_B_SECRET_KEY`
- `KILN_TOKEN_BRONZE`
- `KILN_TOKEN_SILVER`
- `KILN_TOKEN_GOLD`
- `KILN_TOKEN_PLATINUM`
- `KILN_TOKEN_DIAMOND`

If you protect the API with a token, you **must** also set the client-visible build variable (same value as the server secret):

- **`API_AUTH_TOKEN`** — checked in the Netlify function on protected routes (including **`GET /api/kiln/balances`** for Bert/Ernie).
- **`VITE_API_TOKEN`** — same string as `API_AUTH_TOKEN`, but this name is chosen so **Vite inlines it at build time** into the browser bundle. The UI sends it as the `x-kiln-token` header on `/api/...` requests. The legacy `x-api-token` header is still accepted as an alias so old curl/CLI scripts keep working; the `x-` prefix is just the historical convention for custom HTTP headers (RFC 6648) and has nothing to do with X/Twitter.
- **`KILN_API_AUTH_REQUIRED`** — optional fast switch. Leave blank for legacy behavior (`API_AUTH_TOKEN` present means required). Set `false` to run Kiln as an open public builder while keeping `API_AUTH_TOKEN` configured for quick rollback. Set `true` to force token auth and fail closed if `API_AUTH_TOKEN` is missing.

Without `VITE_API_TOKEN` on the **build**, production will show **Shadownet online** (health is unauthenticated) while Bert/Ernie balances stay in **error** or **401**: the balance route rejects the request.

Optional:
- `KILN_DUMMY_TOKENS` (legacy fallback list)
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX`
- `API_JSON_LIMIT`
- `CORS_ORIGINS`
- `KILN_REQUIRE_SIM_CLEARANCE` (default `true`; blocks deploys that skip workflow gate)
- `KILN_ACTIVITY_LOG_PATH` (default `./logs/kiln-activity.log`)

### Bert/Ernie balances on Netlify

- **`/api/health`** does not use `API_AUTH_TOKEN`. **`/api/kiln/balances`** does when the token is configured.
- If balances fail with **401**, add **`VITE_API_TOKEN`** in Netlify and trigger a **new deploy** (clear cache if needed) so the static bundle picks it up.
- If balances fail with **500**, check function logs: missing `WALLET_*` keys, chain mismatch (`TEZOS_CHAIN_ID`), or RPC errors are common causes.

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

- `vite-plugin-node-polyfills` is listed under **dependencies** (not only devDependencies) so Netlify installs it even when the install step runs with production-style omission of dev-only packages; the Vite config imports it for Beacon/Taquito browser shims (`Buffer`, `global`, `process`).
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

## Full-Engagement API

Primary machine endpoints:
- `GET /api/kiln/capabilities` (runtime/stage/export metadata)
- `GET /api/kiln/openapi.json` (OpenAPI-style endpoint map)
- `GET /api/networks` (network catalog + capability matrix; `{ active, networks }`)
- `POST /api/kiln/workflow/run` (compile/validate/audit/simulate/shadowbox/clearance — ecosystem-aware)
- `POST /api/kiln/audit/run`
- `POST /api/kiln/simulate/run` (simulation stage only; standalone clearance withheld when shadowbox gate is required)
- `POST /api/kiln/shadowbox/run` (ephemeral runtime stage only; `success=true` only when runtime executes and passes)
- `POST /api/kiln/upload` (Tezos deploy; clearance + `puppetWallets` enforced)
- `GET /api/kiln/activity/recent?limit=100` (ops/audit tail)
- `GET /api/kiln/reference/contracts` (reference corpus introspection)
- `POST /api/kiln/contracts/guided/elements` (reference-derived composition elements)
- `POST /api/kiln/export/bundle` (mainnet-readiness zipped artifact)
- `GET /api/kiln/export/download/:fileName` (bundle download)

EVM-only endpoints (Etherlink testnet + mainnet):

- `POST /api/kiln/evm/compile` (solc-js → bytecode + ABI + static audit)
- `POST /api/kiln/evm/estimate` (gas + fee estimate against the live RPC)
- `POST /api/kiln/evm/dry-run` (`eth_call` simulation)
- `POST /api/kiln/evm/deploy` (server-side deploy path; real deploys go
  through the user's connected MetaMask from the client)

Every route accepts `networkId` in the body (POST) or query string (GET) and
falls back to `KILN_NETWORK` from the env if omitted.

### Shadowbox command provider contract

When `KILN_SHADOWBOX_PROVIDER=command`, Kiln executes:

```bash
$KILN_SHADOWBOX_COMMAND <input.json> <output.json>
```

Recommended Hetzner setting (real ephemeral runtime):

```bash
KILN_SHADOWBOX_ENABLED=true
KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE=true
KILN_SHADOWBOX_PROVIDER=command
KILN_SHADOWBOX_COMMAND=bash /opt/platform/repos/shadownet-kiln/scripts/shadowbox/run-flextesa.sh
```

The command must write `output.json` with:
- `passed` (boolean)
- `contractAddress` (optional string)
- `warnings` (optional string[])
- `steps` (optional array of `{ label, wallet, entrypoint, status, note, operationHash?, level? }`)

This allows a Hetzner-hosted Flextesa/Octez runner to plug in without changing
the API surface.

Clearance gate behavior:
- When `KILN_SHADOWBOX_REQUIRED_FOR_CLEARANCE=true`, workflow clearance is fail-safe.
- Shadowbox must both execute and pass (`executed=true` and `passed=true`), or clearance is withheld.
- If shadowbox is disabled/misconfigured in required mode, clearance is withheld (not bypassed).

Built-in command runner:
- `scripts/shadowbox/run-flextesa.sh`
- Uses Docker image `oxheadalpha/flextesa:latest` by default
- One disposable container per job, auto-cleaned after completion
- Tunables: `KILN_SHADOWBOX_FLEXTESA_IMAGE`, `KILN_SHADOWBOX_FLEXTESA_BOX_SCRIPT`,
  `KILN_SHADOWBOX_FLEXTESA_RPC_WAIT_SECONDS`, `KILN_SHADOWBOX_FLEXTESA_START_TIMEOUT_SECONDS`

## CLI (Human + Agent Friendly)

Run JSON-first CLI commands against local or remote Kiln:

```bash
npm run kiln:cli -- help
npm run kiln:cli -- capabilities
npm run kiln:cli -- workflow --file contracts/tokens/test-bronze.tz --source-type michelson --storage 'Unit'
npm run kiln:cli -- bundle --file contracts/tokens/test-bronze.tz --source-type michelson --storage 'Unit' --project 'Bronze Family'
```

CLI environment:
- `KILN_API_URL` (default `http://localhost:3000`)
- `KILN_API_TOKEN` (optional auth token for protected routes)

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

## Architecture Slices

To avoid monolithic drift, concerns are now split:
- `src/lib/networks.ts`: network registry + runtime resolution (active + planned networks)
- `src/lib/guided-contracts.ts`: guided contract-template generation logic
- `src/components/GuidedContractBuilder.tsx`: layman-first contract creation UI
- `src/lib/workflow-runner.ts`: compile/validate/audit/simulate/shadowbox orchestration + clearance
- `src/lib/reference-guided-elements.ts`: reference corpus -> guided element catalog
- `src/lib/contract-audit.ts`: static Michelson quality and risk findings
- `src/lib/contract-simulation.ts`: deterministic predeploy simulation and clearance records
- `src/lib/shadowbox-runtime.ts`: ephemeral runtime runner + provider limits
- `src/lib/activity-logger.ts`: request/workflow/audit activity logging and log-tail support
- `src/lib/reference-contracts.ts`: reference corpus indexing + entrypoint extraction
- `src/lib/bundle-export.ts`: mainnet-readiness artifact packaging + zip export
- `src/lib/tezos-service.ts` + `src/lib/shadownet-wallet.ts`: deployment/runtime wallet operations
- `src/server-app.ts`: API composition and routing

## Agent Bootstrap Directory

Use the [`agents/`](./agents) directory when connecting external AI agents to Kiln:
- shared skill: [`agents/KILN_AGENT_SKILL.md`](./agents/KILN_AGENT_SKILL.md)
- 10 common agent profile files (`.codex`, `.claude`, `.gemini`, `.chatgpt`, `.copilot`, `.cursor`, `.cline`, `.aider`, `.continue`, `.windsurf`)

These files tell agents to use Kiln’s staged workflow, keep humans in control, and produce shadownet-tested + bundled deliverables for mainnet readiness.

## E2E Browser/Live Testing

Use the Playwright + Lighthouse harness for mode-aware production smoke testing:

- `npm run e2e:live` for passive live smoke.
- `npm run e2e:auth` for protected-route and token-path checks.
- `npm run e2e:all` for automated run, report generation, and report audit.
- `npm run e2e:lighthouse` for a single web performance/accessibility capture.
- `npm run e2e:report` for markdown/json artifact creation.
- `npm run e2e:report:audit` for report integrity enforcement.

All long-lived artifacts are written under `artifacts/kiln-e2e/<run-id>/...` and ignored by git.

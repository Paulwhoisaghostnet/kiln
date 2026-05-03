# Kiln 2026 No-Stub Workspace Notes

Date: 2026-05-02

## Implemented In This Pass

- Active Etherlink testing metadata now points at Etherlink Shadownet:
  - RPC: `https://node.shadownet.etherlink.com`
  - Chain ID: `127823` / `0x1f34f`
  - Explorer: `https://shadownet.explorer.etherlink.com`
- Legacy Etherlink Ghostnet testnet remains defined only as a planned/hidden migration profile.
- `/api/kiln/capabilities?networkId=...` now resolves the requested network instead of always reporting the process default.
- Tezos `/api/kiln/execute` and `/api/kiln/e2e/run` accept `amountMutez` and pass Taquito send options `{ amount, mutez: true }`.
- `/api/kiln/e2e/run` supports per-step `targetContractAddress` so multi-contract live scenarios can target different KT1 contracts after deployment.
- A browser-scoped `kiln.project.json` workspace model and UI panel now expose files, a scenario file, contract metadata, and graph edges without browsing arbitrary host filesystem paths.
- Shadowbox mock mode now fails closed. It can no longer produce a passing Shadowbox result.
- Same-origin browser asset requests now bypass the external CORS allowlist by matching `Origin` host to the request `Host` header. This fixed local/prod-like blank-page failures when Vite emits `crossorigin` assets.
- Activity-log write failures now warn once per distinct path/error code instead of spamming every request.

## Still Blocked

- Shadowbox is still a single-contract Flextesa runner. It does not yet originate a manifest of contracts, substitute addresses between contracts, emulate Objkt/Tezos Domains/Kukai/TzKT services, or validate multi-contract FA2 marketplace flows.
- Storage, balance, and big-map assertions are schema-recognized but fail closed in live E2E until runtime readers are implemented.
- jstz appears only as a planned/local profile. There is no executable Kiln jstz adapter yet.
- This pass did not deploy to production `kiln.wtfgameshow.app`; public routes may still show old metadata until the app is built and deployed.
- Authenticated live E2E was not run because this environment does not have a Kiln API token or permission to use live Bert/Ernie signing secrets.
- Public probe on 2026-05-02 confirmed production still advertises legacy `etherlink-testnet` metadata and still returns Tezos Shadownet capabilities when `networkId=etherlink-shadownet` is requested.

## Verification Run Locally

```bash
npm run lint
npx vitest run tests/networks.test.ts tests/tezos-service.test.ts tests/kiln-project.test.ts tests/shadowbox-runtime.test.ts tests/server-app.test.ts tests/evm-wallet.test.ts tests/etherlink-service.test.ts
npm run check
```

Result: TypeScript passed; targeted Vitest suite passed with 83 tests. Full `npm run check` passed with 160 tests, 2 skipped Shadownet smoke tests, and a successful production build.

Browser verification:

- `http://localhost:3001/#build` hydrated after the CORS fix.
- The Build page showed `Project workspace`, `kiln.project.json`, and `Contract graph`.
- Browser console had one Beacon SDK warning about an active account subscription; no asset MIME/CORS failures remained.

Known build warnings still present:

- Vite warns that `NODE_ENV=production` in `.env` is unsupported for the client build.
- Rollup reports circular manual chunks for `vendor-polyfills`/`vendor-react` and `vendor-tezos`/`vendor-evm`.
- `vm-browserify` emits an eval warning.
- `vendor-tezos` remains over 500 kB after minification.

## Next Runtime Work

1. Replace `scripts/shadowbox/flextesa_runner.py` with a fixed worker that consumes `kiln.project.json`, originates every contract, substitutes originated addresses into dependent storage/args, and executes scenario steps.
2. Add RPC/TzKT-backed readers for live storage, balance, and big-map assertions.
3. Add functional local service emulators with state:
   - faucet,
   - FA2/FA2 NFT token fixtures,
   - Objkt-like marketplace/API facade,
   - Tezos Domains resolver,
   - Kukai/Beacon-style signer facade,
   - TzKT-style read facade.
4. Only after those pass local tests, run authenticated Shadownet E2E with real operation hashes and update this log.

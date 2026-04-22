# Shadownet Kiln Native Hetzner Migration Plan

## Summary

This plan migrates Shadownet Kiln from its current Netlify deployment model to a native host-level runtime on the same Hetzner server already running the WTF Gameshow app. The goal is to preserve the existing Gameshow production stack, add Kiln alongside it for burn-in testing, and unlock runtime capabilities that are awkward or impossible on serverless platforms, especially native Python and longer-running Node/Python-backed contract workflows.

For the initial testing phase, Kiln will:

- Run as a native `systemd` service on the host, not in Docker.
- Be reachable on the Hetzner server IP at `http://<server-ip>:3001`.
- Avoid using `wtfgameshow.app` routing, Caddy, or Cloudflare until the runtime is validated.
- Keep the current API shape and client behavior unless a change is required for native hosting.

This is a parallel burn-in migration, not a public cutover.

## Current State

Shadownet Kiln already has a native Express runtime:

- `server.ts` starts an Express app and serves the built SPA from `dist/`.
- `src/server-app.ts` contains the real API and app behavior.
- Netlify currently wraps that Express app with `netlify/functions/api.ts` via `serverless-http`.
- `netlify.toml` rewrites `/api/*` into the Netlify function and falls back all other routes to `index.html`.
- `scripts/netlify-build.sh` exists primarily to bundle a Linux Python runtime under `vendor/kiln-python` because Netlify does not provide system Python.

Important repo/runtime facts that directly affect migration:

- Production start currently uses `tsx server.ts`, but `tsx` is only a `devDependency`. That is acceptable in local dev but fragile for a real host production install that prunes dev packages.
- SmartPy compilation relies on either:
  - a `smartpy` CLI on `PATH`,
  - Python that can `import smartpy`,
  - or the bundled Netlify-specific `vendor/kiln-python`.
- Bundle export requires the host `zip` executable.
- Guided reference features read from `reference/`, but `reference/` is gitignored and is not guaranteed to exist on a fresh server.
- Kiln writes operational artifacts locally:
  - logs to `logs/kiln-activity.log` by default,
  - bundle exports to `exports/`,
  - SmartPy temp work to the system temp directory.
- The frontend calls root-relative `/api/...` endpoints throughout the app.

## Shared-Server Constraint

The sibling WTF repo shows that `wtfgameshow.app` is already served by:

- Docker Compose
- a Caddy container
- the WTF app container on `127.0.0.1:3000`

Because Kiln uses root-relative `/api/...` routes and WTF already owns the root domain and its `/api` namespace, mounting Kiln under a shared root path would force app-level base-path refactors. For the burn-in phase, the cleanest path is to avoid shared domain routing entirely and expose Kiln on a separate host port.

That keeps the Gameshow stack stable and avoids coupling this migration to Caddy, Cloudflare, or a subpath rewrite design.

## Target Topology

### Burn-In Topology

- WTF Gameshow remains unchanged in Docker.
- Kiln runs directly on the host as a `systemd` service.
- Kiln binds to `0.0.0.0:3001`.
- Access is direct via the Hetzner server IP and port `3001`.
- No Caddy proxy changes are required in phase 1.
- No Cloudflare changes are required in phase 1.

### Future Public Topology After Burn-In

If native runtime validation succeeds, the preferred public exposure path is a dedicated subdomain such as `kiln.wtfgameshow.app`, not a subpath under `wtfgameshow.app`. That future phase would route a dedicated hostname to Kiln without forcing `/api` namespace collisions with the Gameshow app.

## Dependency Changes

### New Host Dependencies

The Hetzner host will need these packages installed outside Docker:

- `git`
- `curl`
- `zip`
- Node.js `22.x`
- `npm`
- `python3`
- `python3-venv`
- `python3-pip`

Optional but useful:

- `build-essential` if any native Node modules later require compilation
- `jq` for deployment/debug scripting

### New Project-Level Dependencies and Runtime Alignment

1. Add a real production server build path.
   - Add `esbuild` as a build dependency if it is not already present.
   - Produce a bundled server artifact such as `dist/server.cjs`.
   - Stop relying on `tsx` for production startup.

2. Formalize Python dependencies.
   - Add a checked-in `requirements.txt` or `requirements-kiln.txt`.
   - Include `smartpy-tezos`.
   - Treat Python as a first-class native dependency instead of a Netlify workaround.

3. Lock Node runtime expectations.
   - Add `engines.node` to `package.json` with `>=22`.
   - Add `.nvmrc` or `.node-version` with `22`.
   - Keep CI and Hetzner on the same Node major.

### Dependencies to Remove After Burn-In Success

These remain temporarily for rollback, but should be removed once native hosting is accepted:

- `serverless-http`
- `@netlify/functions`
- Netlify deploy scripts in `package.json`
- `netlify.toml`
- `netlify/functions/api.ts`
- `src/lib/netlify-api-path.ts`
- `scripts/netlify-build.sh`

## App Code Changes Required

### 1. Build and Startup

Add a proper production server build and startup model.

Required changes:

- Split build responsibilities into:
  - `build:client`
  - `build:server`
  - `build` as a wrapper
- Change `start` to run built Node output, not `tsx`.
- Ensure production can start after `npm prune --omit=dev`.

Suggested target:

- `vite build` for the frontend
- `esbuild server.ts --bundle --platform=node --format=cjs --outfile=dist/server.cjs`
- `node dist/server.cjs` for production startup

### 2. Development-Only Vite Loading

`server.ts` currently imports Vite at the top level. If the production install prunes dev dependencies, top-level Vite imports can break startup even when production never uses Vite middleware.

Required change:

- Move the Vite import to a development-only dynamic import so production does not require Vite at runtime.

### 3. Runtime Paths

Native hosting should stop writing important artifacts into repo-relative directories by default on the server.

Add explicit environment variables for native runtime paths:

- `KILN_ACTIVITY_LOG_PATH=/var/log/kiln/activity.log`
- `KILN_EXPORT_ROOT=/var/lib/kiln/exports`
- `KILN_REFERENCE_ROOT=/var/lib/kiln/reference`
- `KILN_PYTHON=/opt/platform/venvs/kiln/bin/python`

Then update code paths accordingly:

- `src/lib/activity-logger.ts` should honor `KILN_ACTIVITY_LOG_PATH`.
- `src/lib/bundle-export.ts` should read `KILN_EXPORT_ROOT` before falling back to `exports/`.
- `src/lib/reference-contracts.ts` should read `KILN_REFERENCE_ROOT` before falling back to `reference/`.

### 4. SmartPy Runtime Resolution

`src/lib/smartpy-compiler.ts` already supports:

- `KILN_PYTHON`
- `PYTHON`
- bundled Netlify Python
- `python3`

For Hetzner native hosting, production should explicitly use:

- a dedicated virtualenv
- a known Python binary path

Required change:

- keep `KILN_PYTHON` as the primary production source of truth
- update docs and deployment scripts to always populate it in the server `.env`

### 5. Reference Corpus Bootstrapping

Kiln exposes reference-driven features but `reference/` is gitignored. A fresh deploy without that corpus will silently degrade guided contract functionality.

Required change:

- add a documented bootstrap step that runs `python3 scripts/fetch-reference-mainnet-contracts.py`
- in production, write the fetched corpus into `/var/lib/kiln/reference`
- ensure the app points at that location through `KILN_REFERENCE_ROOT`

Optional hardening:

- add a health/capabilities flag indicating whether the reference corpus is populated

### 6. API/Auth Build Coupling

If `API_AUTH_TOKEN` is set, the frontend also needs `VITE_API_TOKEN` at build time. Native hosting keeps that requirement.

Required change:

- document clearly that production builds must have both values available
- use the same token string for both variables
- treat missing `VITE_API_TOKEN` as a broken protected production build

## Infrastructure and Server Plumbing

### Server User and Paths

Create a dedicated host user for Kiln:

- user: `kiln`

Recommended directory layout:

- repo: `/opt/platform/repos/shadownet-kiln`
- virtualenv: `/opt/platform/venvs/kiln`
- logs: `/var/log/kiln`
- runtime data: `/var/lib/kiln`
- exports: `/var/lib/kiln/exports`
- reference corpus: `/var/lib/kiln/reference`

### Firewall and Networking

Open TCP port `3001` on the Hetzner firewall and host firewall.

Recommended security posture for burn-in:

- allowlist trusted source IPs if feasible
- otherwise accept that this is a temporary direct-access test surface
- do not proxy this through the Gameshow Caddy stack in phase 1

### systemd Service

Create a native `systemd` unit for Kiln.

Service requirements:

- `WorkingDirectory=/opt/platform/repos/shadownet-kiln`
- `EnvironmentFile=/opt/platform/repos/shadownet-kiln/.env`
- `ExecStart=/usr/bin/node dist/server.cjs`
- `Restart=always`
- `RestartSec=5`
- run as user `kiln`
- `PORT=3001`

The service should start only after the repo has been built and the Python virtualenv has been provisioned.

## Environment Variables for Native Production

Required production variables:

- `NODE_ENV=production`
- `PORT=3001`
- `KILN_NETWORK`
- `TEZOS_RPC_URL`
- `TEZOS_CHAIN_ID`
- `WALLET_A_SECRET_KEY`
- `WALLET_B_SECRET_KEY`
- `KILN_TOKEN_BRONZE`
- `KILN_TOKEN_SILVER`
- `KILN_TOKEN_GOLD`
- `KILN_TOKEN_PLATINUM`
- `KILN_TOKEN_DIAMOND`
- `API_AUTH_TOKEN`
- `VITE_API_TOKEN`
- `KILN_PYTHON`
- `KILN_ACTIVITY_LOG_PATH`
- `KILN_EXPORT_ROOT`
- `KILN_REFERENCE_ROOT`

Optional but recommended:

- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX`
- `API_JSON_LIMIT`
- `CORS_ORIGINS`
- `KILN_REQUIRE_SIM_CLEARANCE`

For direct-IP burn-in, `CORS_ORIGINS` can usually remain empty if frontend and API are same-origin on the same port.

## Deployment Pipeline Changes

### Manual Deploy Path

Create one canonical server-side deploy script that both humans and CI can use.

Target flow:

1. SSH to Hetzner.
2. `cd /opt/platform/repos/shadownet-kiln`
3. Ensure `.env` exists.
4. `git fetch origin`
5. `git reset --hard origin/<deploy-branch>`
6. Ensure Python virtualenv exists at `/opt/platform/venvs/kiln`
7. `pip install -r requirements.txt`
8. `npm ci`
9. `npm run build`
10. `npm prune --omit=dev`
11. Bootstrap reference corpus if missing or stale
12. `systemctl restart kiln`
13. Run healthcheck against `http://127.0.0.1:3001/api/health`

Important note:

- `npm prune --omit=dev` only works safely after the Vite import issue is fixed and the server is built into a standalone production artifact.

### GitHub Actions Deploy Path

Add a new GitHub Actions workflow for Hetzner deployment.

This first version should:

- trigger on `workflow_dispatch`
- SSH into the Hetzner server
- run the same canonical deploy script used manually
- fail on healthcheck failure

Do not auto-deploy on every push until burn-in proves stable.

### CI Pipeline Updates

Keep the existing quality gates, but expand them to reflect the new native deployment model.

CI should run:

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`

Additional CI checks to add:

- production server build succeeds
- production startup smoke test can run without dev dependencies

## Routing and Access Implications

### What Does Not Change in Burn-In

- Kiln routes remain rooted at `/api/...`
- SPA fallback remains app-local
- Gameshow routing remains untouched

### What Would Change If We Later Move Behind a Shared Domain

If Kiln later moves behind Caddy on a public hostname:

- best path is a dedicated subdomain like `kiln.wtfgameshow.app`
- avoid `wtfgameshow.app/kiln`

Reasons:

- the frontend uses root-relative API paths
- the server publishes root-relative API links such as bundle download URLs
- the openapi/capabilities surfaces assume root-level `/api/...`
- a subpath migration would require app-wide base-path awareness in:
  - frontend fetch calls
  - server-generated URLs
  - Vite base config
  - download endpoints
  - docs and CLI defaults

## Testing and Validation Plan

### Local Validation Before Server Work

1. Build frontend and server separately.
2. Start the production server from built artifacts only.
3. Verify it still works after pruning dev dependencies.
4. Validate these endpoints:
   - `/api/health`
   - `/api/networks`
   - `/api/kiln/capabilities`
   - `/api/kiln/balances`
5. Run one SmartPy compile flow.
6. Run one workflow execution path.
7. Run one export bundle path.

### Hetzner Burn-In Validation

After deployment to the shared server:

1. Confirm `systemctl status kiln` is healthy.
2. Confirm `curl http://127.0.0.1:3001/api/health` returns `status=ok`.
3. Load the app via `http://<server-ip>:3001`.
4. Verify:
   - frontend loads
   - balances endpoint works
   - workflow run works
   - one deploy path works
   - one bundle export works
   - activity logs are written to `/var/log/kiln/activity.log`
   - exports are written to `/var/lib/kiln/exports`
   - reference features are populated from `/var/lib/kiln/reference`

### Wallet/Origin Validation

Because initial access is via direct IP over plain HTTP, explicitly verify wallet behavior in the browser.

Risk:

- some wallet extension flows may be restricted by origin/TLS expectations

If wallet integration fails under direct IP:

- keep the native runtime plan unchanged
- switch access to SSH tunnel or temporary TLS as a follow-up
- do not collapse the runtime migration back into Netlify because of an access-layer issue alone

## Rollback Plan

Rollback must remain simple during burn-in.

- Keep the Netlify deploy path intact until native runtime proves stable.
- Do not remove Netlify-specific files in the first native deployment PR.
- If native Hetzner burn-in fails, disable `systemd` service and continue using Netlify.
- Because Gameshow infrastructure is not modified in phase 1, rollback should not impact `wtfgameshow.app`.

## Recommended Implementation Order

1. Add production server build and native startup changes.
2. Add Python manifest and native runtime docs.
3. Add configurable export/log/reference roots.
4. Add reference corpus bootstrap flow.
5. Add deploy script for Hetzner host.
6. Add `systemd` unit and host setup docs.
7. Add manual health validation steps.
8. Add GitHub Actions manual deploy workflow.
9. Run Hetzner burn-in.
10. Remove Netlify plumbing only after burn-in is accepted.

## Deliverables

The migration should be considered fully planned when the repo contains:

- updated README and deployment docs for native Hetzner hosting
- a checked-in Python requirements file
- a production-safe Node server build path
- env support for native log/export/reference roots
- a canonical deploy script
- a `systemd` service definition or install template
- a GitHub Actions manual deploy workflow
- a documented rollback path

## Final Recommendation

Treat this as a runtime migration first, not a public routing migration.

The winning shape for the first phase is:

- keep Gameshow untouched
- keep Netlify alive as rollback
- run Kiln natively on the Hetzner host with Node 22 plus Python virtualenv
- access it on direct IP `:3001`
- validate SmartPy, filesystem writes, long-running flows, and signer behavior

Only after those runtime concerns are proven should Kiln be moved behind a shared public hostname.

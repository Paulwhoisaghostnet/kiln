# Kiln E2E Testing System

This plan-driven setup is used to smoke-check the live production target at `https://kiln.wtfgameshow.app` from four angles:

- Playwright browser flow checks
- API contract checks
- Accessibility checks
- Lighthouse captures and report synthesis

## Run Modes

- `passive-live` (default): read-only checks only.
- `auth-live`: same as passive with auth headers attached.
- `tezos-shadownet-mutating`: requires explicit mutation flag.
- `etherlink-shadownet-mutating`: requires explicit mutation flag.
- `mainnet-guardrail`: non-mutating mainnet safety checks.
- `manual-mainnet-live`: manual supervision only.

## Commands

- `npm install` (or `npm install -D ...`) for dependencies.
- `npm run e2e:live` — runs all browser/API specs in `tests/e2e` in passive mode.
- `npm run e2e:auth` — auth-focused run.
- `npm run e2e:lighthouse` — run Lighthouse against live production.
- `npm run e2e:all` — execute full sequence and generate report artifacts.
- `npm run e2e:report` — synthesize markdown + JSON report from artifacts.
- `npm run e2e:report:audit` — validate report output completeness.

## Artifact Layout

- `artifacts/kiln-e2e/<run-id>/playwright-report`
- `artifacts/kiln-e2e/<run-id>/report`
- `artifacts/kiln-e2e/<run-id>/lighthouse`
- `artifacts/kiln-e2e/<run-id>/console`
- `artifacts/kiln-e2e/<run-id>/screenshots`

## Interpreting failures

- **Auth failures on protected routes** are expected by design and confirm route locking.
- **Method mismatch or HTML fallback on API paths** is a routing contract issue and should be triaged.
- **Lighthouse score regression** should be recorded under findings and approved with a remediation plan.

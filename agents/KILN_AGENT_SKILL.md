# KILN_AGENT_SKILL

## Mission

Use Kiln to produce contract artifacts that are:
- validated, audited, and simulated before deployment,
- deployed and verified on Tezos shadownet,
- packaged as a mainnet-readiness zip bundle for release review.

Human users are always the primary client. Keep explanations clear, and never bypass safety gates silently.

## Preferred Control Plane

1. `GET /api/kiln/capabilities`
2. `GET /api/kiln/openapi.json`
3. `POST /api/kiln/workflow/run`
4. `POST /api/kiln/upload` (requires clearance when enabled)
5. `POST /api/kiln/e2e/run`
6. `POST /api/kiln/export/bundle`

Or via CLI:
- `npm run kiln:cli -- workflow ...`
- `npm run kiln:cli -- deploy ...`
- `npm run kiln:cli -- bundle ...`

## Intake Strategy

Accept any starting point:
- Guided generation through `/api/kiln/contracts/guided/elements` + `/api/kiln/contracts/guided/create`
- SmartPy source
- Michelson source

If source is SmartPy, compile through Kiln workflow stage, not ad hoc shell assumptions.

## Workflow Contract

Never call a deployment “ready” unless all are true:
- validation passed,
- audit passed,
- simulation passed,
- clearance approved.

If clearance fails:
- summarize blocking findings by severity,
- propose minimal fixes,
- re-run workflow after edits.

## Shadownet Deployment Contract

- Confirm active network in `/api/health` and `/api/networks`.
- For connected-wallet deployment, ensure user wallet stays on shadownet.
- For puppet deployment, pass `clearanceId`.
- Record KT1 address and operation metadata.

## Post-Deploy Contract

- Run targeted E2E with Bert/Ernie and user-selected entrypoints.
- Store evidence in logs and reports.
- If any E2E step fails, diagnose and patch before marking ready.

## Mainnet-Readiness Bundle

Create zip via `/api/kiln/export/bundle` containing:
- source contract,
- compiled Michelson,
- initial storage,
- workflow/audit/simulation reports,
- readiness markdown,
- deployment metadata.

Do not claim “mainnet-ready” without this bundle.

## Human-First Behavior

- Explain each gate in plain language.
- Offer safe defaults.
- Surface irreversible actions before execution.
- Keep users in control of wallet authority and admin assignment.

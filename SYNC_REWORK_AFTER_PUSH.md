# Kiln Rework Stub (Post-Sync)

Date: 2026-04-27
Status: Synced and pushed. Items below are explicitly deferred rework.

## Deferred Rework Items

- [ ] Harden `tests/e2e/02-a11y.spec.ts` against real production violations by turning current failures into tracked issue assertions + artifact links.
- [ ] Resolve live API method/fallback inconsistency for `GET /api/kiln/contracts/guided/elements` (currently observed as non-uniform behavior in live edge pathing).
- [ ] Expand OpenAPI coverage to include all live EVM and helper routes for full agent parity.
- [ ] Complete remaining plan tasks for mutating Tezos/Etherlink run-modes once safe credentials and dry-run windows are approved.
- [ ] Add first-class report auditor pipeline re-enable after external audit acceptance.

## Shadowbox-Specific Follow-ups

- [ ] Add explicit operator dashboard indicator when `shadowboxRequiredForClearance=true` and provider is `mock`/`disabled`.
- [ ] Add long-run capacity telemetry counters for `maxActiveJobs` and `maxActiveJobsPerIp` saturation events.
- [ ] Add synthetic periodic command-provider probe for Flextesa startup latency drift.


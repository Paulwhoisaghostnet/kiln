---
name: "tezos_contract_lifecycle"
description: "Use when implementing or changing Tezos smart contracts with style-matrix mapping, compile/artifact sync, security coverage, and test/deploy readiness checks."
---

# tezos_contract_lifecycle

## Quick Start
1. Classify requested behavior into a contract style (or explicit mixed-style need).
2. Compile every affected style variant.
3. Sync compiled Michelson artifacts to runtime/frontend paths.
4. Run entrypoint, policy, and pre-deploy size/limit checks.
5. Ship only with a complete release-gate report.

## When To Use
- Adding or changing Tezos contract logic.
- Maintaining multi-style contract families (marketplace, open-edition, allowlist, unified, mint-only).
- Enforcing repeatable compile -> artifact sync -> test -> release flow.

## Inputs Required
- Network target and RPC assumptions.
- Contract source and compile script paths.
- Style/module requirements and incompatibility constraints.
- Artifact destination paths used by client/runtime.
- Required entrypoints and security policies.

## Workflow
1. Map requested behavior to style rules in `references/style-resolution-rules.md`.
2. Apply contract changes with explicit entrypoint ownership.
3. Run compile scripts for all impacted styles.
4. Verify generated JSON/TS artifact parity across runtime paths.
5. Validate entrypoint map against client invocation code.
6. Run contract tests plus style-specific workflow tests.
7. Apply release gate in `references/release-gate-checklist.md`.

## Evidence-Backed Guardrails
- Never rely on one-style compilation when style matrix paths are coupled.
- Fail fast if compile output folders or expected contract JSON files are missing.
- Keep style IDs and artifact names aligned with client style resolver logic.
- Validate security-sensitive entrypoints across every enabled style.
- Enforce protocol-size and operation-limit checks before deploy approval.

## Reference Map
- `references/style-resolution-rules.md` -> deterministic style mapping and incompatibility rules.
- `references/release-gate-checklist.md` -> deploy readiness checks.
- `references/quality-checklist.md` -> fast quality gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox Tezos projects.

## Output Contract
Return:
- style decision table,
- changed contract and compile pipeline files,
- compile/artifact sync summary,
- entrypoint/security test summary,
- release gate result with blocking vs non-blocking items.

## Validation Checklist
- All impacted styles compile cleanly.
- Artifact outputs exist at expected runtime/frontend paths.
- Client invocation map matches deployed entrypoints.
- Security tests cover role/permission sensitive paths.
- Release gate passes size/limit checks and metadata checks.

## Failure Modes + Recovery
- Compile break: isolate affected style, fix typed errors, re-run full style set.
- Artifact drift: regenerate and compare expected output names/paths.
- Entrypoint mismatch: patch client invoke map and add regression tests.
- Policy gap: add missing checks and prove coverage in tests before merge.

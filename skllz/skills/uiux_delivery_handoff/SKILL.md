---
name: "uiux_delivery_handoff"
description: "Use for UI/UX delivery that requires architecture docs, remediation planning, onboarding, and high-quality handoff artifacts."
---

# uiux_delivery_handoff

## Quick Start
1. Audit current UX and architecture risks.
2. Deliver UI changes with explicit workflow/state boundaries.
3. Produce handoff package: architecture, runbook, troubleshooting, next phases.
4. Validate docs against actual run commands and behavior.
5. Publish residual risks and remediation timeline.

## When To Use
- Shipping major UI/UX changes that must be maintainable by future agents/teams.
- Recovering from brittle architecture or unclear workflow design.
- Preparing an onboarding-safe handoff with minimal tribal knowledge.

## Inputs Required
- User journeys and acceptance criteria.
- Current architecture map and known defects.
- Delivery constraints (time, team, release risk).
- Onboarding and operational ownership expectations.

## Workflow
1. Perform architecture and workflow audit.
2. Implement UI changes with clear component/state boundaries.
3. Document operational flow, setup, and debugging runbook.
4. Add phased remediation plan for unresolved debt.
5. Verify documentation against real execution paths.
6. Deliver a handoff bundle with explicit ownership-ready artifacts.

## Evidence-Backed Guardrails
- Treat architecture/workflow audits as first-class deliverables for unstable UI systems.
- Keep generation/preview/production workflows explicit when multi-mode rendering exists.
- Require manual gate steps where automatic workflows are historically fragile.
- Include setup, env expectations, and test/run commands to reduce onboarding failures.
- Record blockers, mitigations, and phased follow-up work in handoff output.

## Reference Map
- `references/handoff-package-template.md` -> required handoff sections.
- `references/phased-remediation-template.md` -> remediation plan format.
- `references/quality-checklist.md` -> quality gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox UI/UX projects.

## Output Contract
Return:
- UX and architecture change summary,
- updated workflow/runbook docs,
- remediation roadmap with phases,
- validation checklist and known risks,
- handoff-ready next actions.

## Validation Checklist
- Key user flows are testable and documented.
- Architecture docs match implemented behavior.
- Setup/troubleshooting docs match current runtime.
- Known limitations have explicit mitigation and owner-ready next steps.
- Handoff can be executed by a new contributor without hidden assumptions.

## Failure Modes + Recovery
- Doc drift: regenerate docs from current code paths and commands.
- Workflow ambiguity: add explicit sequence diagrams/states and acceptance checks.
- Unbounded debt: split into phased remediation with measurable gates.

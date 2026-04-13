---
name: "game_systems_and_liveops"
description: "Use for game system design and implementation with modular loops, audit-friendly progression, secure moderation/liveops controls, and optional non-custodial blockchain-signal game influences."
---

# game_systems_and_liveops

## Quick Start
1. Define one loop at a time: earning, spending, progression, moderation.
2. Store all sensitive state server-side/DB-side and log every privileged action.
3. Add cooldowns, caps, and role checks before enabling rewards.
4. Validate with scenario tests and moderation abuse tests.

## When To Use
- Building persistent game loops with XP, economy, rankings, or matchmaking.
- Adding moderation and host tools to social/multiplayer systems.
- Hardening a live game against abuse, leaks, or replay exploits.
- Designing non-custodial blockchain-influenced gameplay loops.

## Inputs Required
- Core loop description and success metrics.
- Role/permission model (player, mod, admin, host).
- Persistence schema and event logging expectations.
- Abuse assumptions (spam, alt accounts, command misuse).
- Optional signal-mapping sources (for example Tezos/Objkt read-only metrics).

## Workflow
1. Design loop contracts: triggers, rewards, caps, and anti-farm rules.
2. Split systems into modules (`commands`, `engine`, `resolver`, `scoring`, `events`).
3. Enforce permission boundaries for all moderator and host actions.
4. Persist state changes and reward deltas with auditable transactions.
5. Add secrecy-safe error messages for hidden-state systems.
6. Add regression tests for progression integrity and moderation safety.
7. If using blockchain signals, map through bounded non-custodial influence layers only.

## Evidence-Backed Guardrails
- Use modular command/engine boundaries to keep game logic debuggable and replaceable.
- Keep hidden role/state data in DB only; do not expose via platform roles.
- Use cooldowns and per-phase caps for reward events to prevent farming.
- Return generic failure messages when detailed errors would leak game state.
- Enforce quarantine/category boundaries when commands must run in controlled channels.
- For blockchain-influenced loops, enforce read-only inputs and volatility clamps.

## Reference Map
- `references/quality-checklist.md` -> release gate before shipping gameplay changes.
- `references/moderation-security-patterns.md` -> permission, secrecy, and audit patterns.
- `references/chain_signal_game_loop_patterns.md` -> safe data-to-mechanics mapping patterns.
- `references/non_custodial_chain_game_guardrails.md` -> strict non-custodial constraints for game loops.
- `references/sandbox-evidence.md` -> source evidence from Sandbox projects.

## Output Contract
Return:
- loop and system architecture summary,
- data model and transaction logging plan,
- moderation/permission control design,
- abuse controls (cooldowns, caps, anti-leak handling),
- test matrix and residual risk notes.

## Validation Checklist
- Reward events are deterministic and auditable.
- Privileged actions are role-gated and logged.
- Hidden game state is never exposed via public errors.
- Cooldowns and caps prevent obvious farming loops.
- Scenario tests cover normal, malicious, and moderation paths.

## Failure Modes + Recovery
- Economy exploit: freeze affected rewards, patch invariant checks, replay from audit log.
- Moderator misuse: tighten role guardrails and add explicit action approvals.
- State drift: rebuild canonical state from event log and verify leaderboard deltas.
- Hidden-state leak: replace verbose errors, rotate compromised round, re-test secrecy paths.

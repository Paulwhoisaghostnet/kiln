---
name: "subagent_skill_harvest_loop"
description: "Use when running delegated subagent rounds to generate prototypes, harvest evidence and feedback, patch skills with extracted knowledge, and clean up temporary project workspaces."
---

# subagent_skill_harvest_loop

## Quick Start
1. Define the round objective and target skill(s) to improve.
2. Create isolated per-agent work directories.
3. Spawn subagents with disjoint ownership and strict deliverables.
4. Require each agent to produce prototype + feedback + DOC_PACK artifacts.
5. Harvest and synthesize cross-agent findings.
6. Patch skills/references with extracted knowledge.
7. Sync updated skills globally and verify parity.
8. Delete temporary round workspaces and close agents.

## When To Use
- You want subagents to explore a task family and produce evidence for skill improvements.
- You need repeatable delegation + synthesis + cleanup cycles.
- You want reusable templates for assignment quality and artifact extraction.

## Inputs Required
- Objective statement for the round.
- Number of agents and disjoint ownership paths.
- Mandatory artifact schema.
- Skill targets to patch.
- Cleanup policy.

## Workflow
1. Draft assignments using `references/delegation-assignment-template.md`.
2. Enforce artifact schema from `references/subagent-feedback-schema.md`.
3. Collect results with `references/harvest-synthesis-matrix.md`.
4. Patch skill docs via `references/skill-patch-checklist.md`.
5. Run cleanup and verification via `references/cleanup-and-verification-checklist.md`.

## Guardrails
- Never allow overlapping agent write ownership.
- Require explicit non-destructive cleanup rules.
- Do not patch skills from single-agent anecdotes; synthesize across artifacts.
- Keep source evidence paths in every final synthesis report.
- Always verify local/global skill parity after patching.

## Output Contract
Return:
- delegation summary,
- harvested insights matrix,
- skill patches applied,
- global sync verification,
- cleanup confirmation.

## Validation Checklist
- All agent outputs satisfy required artifact schema.
- Synthesized findings are cross-agent and evidence-backed.
- Skill patches are concrete and reference-linked.
- Temporary workspaces are removed.
- Agent sessions are closed.

## Failure Modes + Recovery
- Missing artifacts: re-request targeted completion from specific agent.
- Inconsistent findings: prioritize repeated patterns across agents.
- Partial patching: produce patch backlog and apply in ranked order.
- Cleanup drift: run explicit directory and session closure checks.

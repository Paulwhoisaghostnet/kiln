# Kiln Agent Bootstrap

This directory is the universal handoff point for remote AI agents.

## Purpose

When an AI agent enters this repository, it should:
1. Read [`KILN_AGENT_SKILL.md`](./KILN_AGENT_SKILL.md).
2. Read its matching profile dotfile (`.codex`, `.claude`, `.gemini`, etc.).
3. Use Kiln APIs/CLI to run the full contract lifecycle:
   - source intake (guided / SmartPy / Michelson)
   - predeploy workflow gate (compile, validate, audit, simulate, clearance)
   - shadownet deployment
   - postdeploy E2E
   - mainnet-readiness bundle export (zip)

## Included Agent Profiles (10)

- `.codex`
- `.claude`
- `.gemini`
- `.chatgpt`
- `.copilot`
- `.cursor`
- `.cline`
- `.aider`
- `.continue`
- `.windsurf`

All profiles point to the same Kiln contract lifecycle skill and human-first behavior.

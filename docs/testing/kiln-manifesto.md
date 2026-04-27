# Kiln Manifesto (Execution Lens)

Kiln is a contract proving chamber, not only a deploy button.

Its purpose is to make contract delivery legible:

- Source intake
- Structural checks
- Audit
- Simulation
- Clearance
- Deploy
- Post-deploy validation
- Handoff artifacting

The identity is strongest where humans remain in final control and agents can still
operate the same staged API surface with deterministic evidence.

## Current Soul in Delivery

Kiln currently works as a confidence bridge between intent and chain action.
It stores workflow history in visible session summaries, preserves a terminal-like
execution trace, and forces explicit state transitions before destructive operations.

## Expansion Direction

The next step is to keep this contract intact while expanding chain coverage:

1. Preserve the staged rails when adding Etherlink shadownet.
2. Add deterministic dummy EVM wallet execution at the same stage boundaries.
3. Add explicit preflight checks for chain-switch and wallet mismatch.
4. Preserve manual consent/guardrails for any mainnet path.
5. Keep evidence-first delivery by exporting every publishable run.

## Non-negotiables

- No mutation unless mode requires it.
- No chain operation without explicit API token in auth/mutating contexts.
- No mainnet path bypassing clear consent and deployment readiness.
- Report every failure, not just every pass.

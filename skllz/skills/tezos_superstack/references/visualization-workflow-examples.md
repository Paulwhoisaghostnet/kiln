# Visualization Workflow Examples

## Example 1: Transaction Flow 3D
- Route: `data_pipeline` -> visualization
- Steps: bounded fetch -> normalize -> render points/flow -> emit deterministic state summary

## Example 2: Wallet Pulse
- Route: `data_pipeline` + lightweight client checkpointing
- Steps: account + ops fetch -> signal mapping -> pulse render -> degrade gracefully on failure

## Example 3: Marketplace Stream
- Route: `data_pipeline` with domain filter dictionary
- Steps: per-entrypoint fetch -> merge -> lane rendering -> retry/backoff UX

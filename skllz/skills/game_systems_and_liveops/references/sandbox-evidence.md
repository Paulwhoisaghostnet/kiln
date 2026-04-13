# Sandbox Evidence

## Sources
- `Discord Bots/PROJECT_STRUCTURE.md`
- `Discord Bots/README.md`
- `projects/Sandbox/mafiabot/README.md`
- `ROUND3_GAME_SIGNAL_HARVEST_REPORT.md`
- Round-3 game DOC_PACK artifacts under `subagent_games_round3/*/DOC_PACK`

## Lessons Applied
1. Modular architecture + audit logs remain core for liveops safety.
2. Chain-influenced mechanics should be bounded, smoothed, and deterministic.
3. Non-custodial constraints must be explicit and testable.
4. Fallback/stale-state UX is essential for API-dependent loops.
5. Deterministic hooks accelerate balancing and incident debugging.

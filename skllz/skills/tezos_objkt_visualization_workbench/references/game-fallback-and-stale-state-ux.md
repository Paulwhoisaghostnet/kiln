# Game Fallback and Stale-State UX

## Failure Classes
- Upstream HTTP/network failure.
- Empty/malformed payload for selected scope.
- Source schema drift.

## Recovery Behavior
1. Keep gameplay active using last-good profile if available.
2. Otherwise switch to deterministic fallback profile.
3. Surface clear status: `live`, `degraded`, or `stale`.
4. Provide manual refresh and bounded retry policy.

## UX Requirements
- Show source mode (`objkt`, `tzkt`, `fallback`).
- Avoid blocking overlays that freeze game loop.
- Keep player trust with explicit provenance and reason text.

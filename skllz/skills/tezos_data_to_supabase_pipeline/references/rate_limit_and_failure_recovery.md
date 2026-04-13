# Rate Limit And Failure Recovery

## 429 handling
- Exponential backoff with jitter: 1s -> 2s -> 4s (cap retries).
- Lower poll rate and/or reduce `limit`.
- Surface cooldown status in UI and logs.

## 5xx / transient failure
- Retry with capped attempts.
- Keep stale snapshot visible in read-only/degraded mode.

## Empty result handling
- Distinguish true empty window from upstream error.
- Show explicit no-data state with active filters.

## Recovery principles
- Never advance checkpoint on failed fetch/merge.
- Resume from last committed checkpoint.
- Keep error bucket counters for observability.

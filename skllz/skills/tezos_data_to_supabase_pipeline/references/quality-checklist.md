# Quality Checklist

- Stream scope is bounded and explicitly documented.
- Checkpoint storage is monotonic and write-coupled.
- Upsert conflict keys guarantee idempotent replay behavior.
- Rate limits and retries are bounded and observable.
- Verification queries include counts, duplicates, and freshness checks.
- Recovery path is checkpoint-based and tested on partial failure.

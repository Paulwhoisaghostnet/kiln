# Quality Checklist

- Loop contracts are explicit (trigger, reward, cap, cooldown).
- Sensitive game state remains server-side/DB-side only.
- Every privileged action is role-gated and audit-logged.
- Error responses avoid leaking hidden game information.
- Scenario tests cover normal, abuse, and moderator override flows.
- Rollback/recovery path exists for corrupted rounds or XP exploits.

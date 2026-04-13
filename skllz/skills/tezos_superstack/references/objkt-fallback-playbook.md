# Objkt Fallback Playbook

## Primary Path
1. Query Objkt GraphQL for collection/token records.
2. Normalize to canonical row model.
3. Render/report with source=`objkt`.

## Fallback Path
1. On GraphQL failure, call TzKT token endpoints.
2. Map fields using fallback map.
3. Render/report with source=`tzkt-fallback`.

## Guardrails
- Keep source provenance visible in UI/report.
- Preserve normalized output shape across source switch.
- Record switchover reason for debugging and postmortems.

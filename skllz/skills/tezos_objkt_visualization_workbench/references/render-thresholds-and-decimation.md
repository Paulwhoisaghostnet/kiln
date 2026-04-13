# Render Thresholds and Decimation

## Tiers
- <=200 rows: full glyph rendering.
- 201-500 rows: hybrid glyph + aggregation.
- >500 rows: aggregated lanes/heat modes.
- >2000 rows: summary mode with focused drill-down.

## UX Requirements
- Show decimated count.
- Preserve inspectable summary counters.
- Provide filter tools to narrow to detailed mode.

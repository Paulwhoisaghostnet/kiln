# Skill Format Comparison

Date: 2026-04-07

Compared custom skills against common `~/.codex/skills` structure expectations:
- `SKILL.md` with YAML frontmatter
- `agents/openai.yaml` with UI metadata
- `LICENSE.txt`
- `references/` for progressive disclosure

| Skill | SKILL.md | openai.yaml | LICENSE | references files | short_description length | default_prompt has $skill |
|---|---|---|---|---:|---:|---:|
| game_systems_and_liveops | yes | yes | yes | 5 | 53 | 1 |
| subagent_skill_harvest_loop | yes | yes | yes | 5 | 47 | 1 |
| tezos_contract_lifecycle | yes | yes | yes | 4 | 54 | 1 |
| tezos_dapp_wallet_ops | yes | yes | yes | 4 | 48 | 1 |
| tezos_data_to_supabase_pipeline | yes | yes | yes | 14 | 45 | 1 |
| tezos_objkt_visualization_workbench | yes | yes | yes | 14 | 49 | 1 |
| tezos_superstack | yes | yes | yes | 8 | 55 | 1 |
| uiux_delivery_handoff | yes | yes | yes | 4 | 49 | 1 |
| video_local_pipeline_and_mintable_export | yes | yes | yes | 4 | 51 | 1 |
| visual_sim_debug_3js_p5js | yes | yes | yes | 8 | 58 | 1 |

## Result
- All custom skills meet or exceed baseline structure used by mature installed skills.
- `short_description` values follow the 25-64 character guideline.
- Default prompts include explicit `$skill_name` invocation hints.
- Tezos set includes dedicated visualization and game-influence coverage.
- A reusable delegation/harvest loop skill is now included.

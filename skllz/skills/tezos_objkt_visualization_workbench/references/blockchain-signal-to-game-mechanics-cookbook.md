# Blockchain Signal to Game Mechanics Cookbook

## Pattern A: Activity -> Hazard Intensity
- Input: transaction count in bounded window.
- Normalize: `txSignal = clamp(txCount / windowMax, 0, 1)`.
- Map: `hazardRate = lerp(minHazard, maxHazard, txSignal)`.
- Safety: cap max hazard and preserve boost floor.

## Pattern B: Metadata Traits -> Ability Modifiers
- Input: trait strings or metadata fields.
- Normalize: hash/score to stable seed buckets.
- Map: jump/stamina/cooldown modifiers within bounded ranges.
- Safety: keep modifiers within +/-25% baseline unless explicitly intentional.

## Pattern C: Entrypoint Families -> World Mood
- `buy/collect/fulfill_ask` -> hazard bias.
- `ask/list/create_ask` -> boost/resource bias.
- Unknown-heavy mix -> fallback profile + warning badge.

## Pattern D: Diversity Metrics -> Recovery Systems
- Input: unique sender/holder diversity.
- Map: power-up chance, cooldown reductions, visibility aids.
- Safety: avoid runaway loops with clamp floors/ceilings.

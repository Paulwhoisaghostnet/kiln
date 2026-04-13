# Style Resolution Rules

## Baseline Mapping
- `2+` mint models required -> `bowers-unified`
- Bonding curve mint path -> `bowers-bonding-curve`
- Allowlist + open edition -> `bowers-allowlist`
- Open edition only -> `bowers-open-edition`
- Fallback marketplace style -> `bowers-marketplace`

## Mint-Only Variants
- Open edition mint-only -> `bowers-mint-oe`
- Allowlist mint-only -> `bowers-mint-allowlist`
- Bonding curve mint-only -> `bowers-mint-bonding-curve`

## Hard Rules
- Do not silently downgrade to fallback style when requirements conflict.
- Surface unsupported combinations as blocking validation errors.
- Keep style IDs, icons/labels, and artifact names aligned across shared type maps.

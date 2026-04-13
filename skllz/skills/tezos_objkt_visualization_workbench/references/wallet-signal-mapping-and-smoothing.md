# Wallet Signal Mapping and Smoothing

## Mapping Patterns
- Balance -> radius/intensity with `log10(balance + 1)`.
- Tx count -> pulse frequency (clamped min/max).
- Recency -> alpha/brightness decay.

## Outlier Handling
- Winsorize top 1-2% values before visual mapping.
- Keep raw value tooltips for transparency.
- Use moving average for noisy short windows.

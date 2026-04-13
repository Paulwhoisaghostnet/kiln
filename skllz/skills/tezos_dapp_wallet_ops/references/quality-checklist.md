# Quality Checklist

- Wallet adapter lifecycle is singleton-safe.
- Permission requests use explicit network targeting.
- Chain ID verification is enforced before send.
- Operation results are parsed from confirmed metadata.
- User-facing errors are actionable and non-misleading.
- Known provider failure signatures have explicit fallback guidance.

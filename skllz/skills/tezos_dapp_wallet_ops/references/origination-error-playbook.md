# Origination Error Playbook

## Frequent Signatures
- `UNKNOWN_ERROR` after connect: usually duplicate wallet client instances.
- `ABORTED_ERROR` on originate: often provider-side simulation failure.
- `No signer has been configured`: toolkit recreated without reattaching provider.
- `Network mismatch`: wallet chain differs from app target chain.

## Triage Steps
1. Confirm singleton wallet adapter state.
2. Confirm network target and chain ID alignment.
3. Re-run operation via wallet API path (`Tezos.wallet`).
4. Reattach wallet provider after toolkit recreation.
5. If provider-specific origination bug is detected, guide user to known working wallet option.

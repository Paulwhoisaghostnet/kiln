---
name: "tezos_dapp_wallet_ops"
description: "Use when hardening Tezos dApp wallet flows: connect, network switching, chain-id verification, and reliable origination/operation handling."
---

# tezos_dapp_wallet_ops

## Quick Start
1. Initialize one wallet adapter instance for the page lifecycle.
2. Resolve network config and expected chain ID before requesting permissions.
3. Use wallet API operation flow (`Tezos.wallet...send()`) for browser-originated actions.
4. Verify chain ID before each sensitive operation.
5. Parse operation results from confirmed operation data, not string transforms.

## When To Use
- Browser dApps connecting Tezos wallets.
- Origination, transfer, and contract-call flows with user signing.
- Network mismatch and wallet-provider reliability issues.

## Inputs Required
- Wallet stack and provider options.
- Target network settings (RPC, explorer, chain ID).
- Operation type and expected outputs.
- Known provider-specific failure constraints.

## Workflow
1. Build adapter singleton and guard against duplicate client instantiation.
2. Request wallet permissions for explicit network target.
3. Verify active chain ID equals expected chain ID.
4. Execute operation through wallet-safe APIs.
5. Confirm operation and extract op hash/contract address from operation metadata.
6. Persist status, user-facing remediation, and retry guidance.

## Evidence-Backed Guardrails
- In browser wallet flows, prefer `Tezos.wallet` operations over raw contract-signing patterns.
- Do not create multiple wallet clients in reactive startup loops.
- Block send when wallet network and app network diverge.
- Detect known provider failure signatures and present clear reconnect guidance.
- Never derive KT1 addresses from operation hash string replacement.

## Reference Map
- `references/network-wallet-checklist.md` -> connect/network/origination checks.
- `references/origination-error-playbook.md` -> failure signature triage.
- `references/quality-checklist.md` -> pre-merge quality gate.
- `references/sandbox-evidence.md` -> source evidence from Sandbox Tezos docs.

## Output Contract
Return:
- wallet provider and network status,
- chain verification result,
- operation result with canonical identifiers,
- failure classification and remediation guidance,
- residual risk notes.

## Validation Checklist
- Connect/disconnect cycle works without duplicate adapter creation.
- Network switching updates RPC + explorer + chain assumptions.
- Chain mismatch blocks send path.
- Operation parser extracts real contract/op identifiers.
- Provider-specific known failures show actionable recovery.

## Failure Modes + Recovery
- Duplicate client: reset to singleton adapter and prevent parallel init.
- Chain mismatch: force user/app network alignment before retry.
- Origination aborted: classify provider issue and suggest supported wallet path.
- Missing identifiers: re-read confirmed operation details from chain/indexer APIs.

# Network + Wallet Checklist

- Active network label matches configured RPC/explorer/API endpoints.
- Wallet permission request uses the intended network and RPC.
- Chain ID is verified before operation submission.
- Browser dApp uses wallet operation API (`Tezos.wallet...send()`) for signed sends.
- Contract/origination identifiers are taken from operation confirmation details.
- Session reconnect path reuses the same adapter instance.

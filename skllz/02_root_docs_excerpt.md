# Root Docs Excerpts

## Bowers/BOWERS_MEMORY.md

# Bowers Project — Memory / Index

**Purpose:** FA2 NFT collections and marketplace on Tezos (Ghostnet). "Deploy your own NFT collection contracts on Tezos with no code. Choose a style, configure, and deploy."

---

## Current state

- **Contracts (SmartPy v2, in `attached_assets/`):**
  - **All-in-one (mint + marketplace):** All include `contract_blocklist` (admin-only `block_address` / `unblock_address`). Blocklist enforced in `transfer`, `buy`, `make_offer`, `accept_offer`, and `mint_editions` (to_).
  1. **BowersAllowlistFA2.py** — Open edition + allowlist phased minting + full marketplace (listings, offers, buy, per-owner blacklist, contract blocklist, withdraw).
  2. **BowersOpenEditionFA2_v5_fa2complete_1771143451660.py** — Open edition FA2 + marketplace + contract blocklist.
  3. **BowersUnifiedFA2.py** — Multi-mint (admin / OE / bonding curve per-token), allowlist, full marketplace + contract blocklist.
  4. **BowersBondingCurveFA2.py** — Bonding-curve mint + marketplace + contract blocklist.
  5. **BowersFA2_partial_fill_offer_1771139881452.py** — Marketplace-only ("BowersMarketplace") + contract blocklist.
  - **Mint-only (no marketplace; sell on objkt/teia):**
  6. **BowersMintOpenEdition.py** — Open edition mint, contract blocklist, withdraw. Style: `bowers-mint-oe`.
  7. **BowersMintAllowlist.py** — Open edition + allowlist phase, contract blocklist, withdraw. Style: `bowers-mint-allowlist`.
  8. **BowersMintBondingCurve.py** — Bonding-curve mint, contract blocklist, withdraw. Style: `bowers-mint-bonding-curve`.

- **Compilation:** Scripts in `scripts/`: `compile_marketplace.py`, `compile_open_edition.py`, `compile_allowlist.py`, `compile_bonding_curve.py`, `compile_unified.py`, `compile_mint_open_edition.py`, `compile_mint_allowlist.py`, `compile_mint_bonding_curve.py`. Run `bash scripts/compile-contracts.sh` (requires SmartPy with `@sp.module` support). Output: `build/smartpy/<ScenarioName>/`; JSON copied to `client/src/lib/tezos/michelson/`; `generate-michelson-ts.cjs` writes `.ts` modules.

- **Style resolution:** `shared/contract-styles.ts` — Presets include mint-only styles. `resolveStyleFromModules()` for custom: 2+ mint models → `bowers-unified`; else bonding-curve → `bowers-bonding-curve`; allowlist+open-edition → `bowers-allowlist`; open-edition only → `bowers-open-edition`; else → `bowers-marketplace`.

---

## Issues reported (user)

- UI not wired to all contract types; app not deployment-ready.
- Need Ghostnet default with Mainnet switching.
- Need deployment instructions (not GitHub+Netlify).

---

## Actions taken

- **Supervisor audit (full code review):** See changelog entry below for all fixes.

---

## How to use Ollama for audits (instruction for Cursor agent)

- **One terminal, one chat:** Run `ollama run qwen2.5-coder:7b-instruct-q4_K_M` **once** at the start. That terminal becomes the chat session with qwen.
- **Feeding content:** After that, do **not** call `ollama run` again in that terminal. Feed text by pasting whole files or using `echo` / redirecting a file into the process (e.g. prepare a prompt file, then in the same session you can pipe: `cat prompt.txt | ollama run ...` is one way—but that starts a *new* run). So for a **single** audit: run `ollama run qwen2.5-coder:7b-instruct-q4_K_M < scripts/ollama_audit_prompt.txt` (stdin from file = first user message; qwen replies; process exits when stdin closes). For a **multi-turn** chat you keep the process running and type/paste in that terminal.
- **Model:** Always use `qwen2.5-coder:7b-instruct-q4_K_M`.

---

## Ollama audit log

- **BowersAllowlistFA2.py** — Ran `ollama run qwen2.5-coder:7b-instruct-q4_K_M < scripts/ollama_audit_prompt.txt` (prompt = audit instructions + full contract). Qwen’s response (summary):
  - **Token creation:** `create_token` allows admin to create tokens (metadata, creator, mint price, max supply, allowlist end, royalty, min offer).
  - **Allowlisting:** `set_allowlist` lets admin set allowlist; listed addresses can mint at lower/no cost before allowlist end.
  - **Minting:** `mint_editions` checks allowlist when applicable and mints to the user.
  - **Marketplace:** Listing, buy, offers (make/accept/close), royalties on sale, withdraw.
  - **Views:** Balances, listings, offers, claimable, blacklist.
  - **Security:** Blacklisting, admin-only and allowlist checks. No COMPILE/BEHAVIOR/ISSUES/RECOMMENDATIONS section in the reply—it was a high-level breakdown. For stricter audit format, prompt can ask explicitly for COMPILE/BEHAVIOR/ISSUES/RECOMMENDATIONS.

---

## Contract rules (Tezos / SmartPy / FA2)

*From official Tezos docs and Trilitech-style patterns. Use these when writing or changing Bowers contracts.*

1. **FA2 (TZIP-12):**
   - Ledger: `(owner, token_id) -> balance`. Big_map for gas.
   - Operators: `(owner, operator, token_id) -> unit`. Only `owner` can add/remove.
   - `transfer`: batch of `{ from_, txs: [{ to_, token_id, amount }] }`. Check operator if `from_ != sp.sender`. Deduct from `from_`, add to `to_`; remove ledger key if balance 0.
   - `balance_of`: requests + callback contract; respond with list of `(request, balance)`; callback receives reversed list per spec.
   - Entrypoints that do not accept XTZ: `assert sp.amount == sp.mutez(0), "NO_TEZ"`.

2. **Marketplace (Trilitech-style):**
   - Listings/sells: key by seller + token_id (e.g. `(owner, token_id)`). Check seller balance before listing.
   - Buy: verify buyer payment >= price×qty; transfer XTZ to seller (or to contract then withdraw); transfer tokens seller→buyer; update/remove listing when qty exhausted.
   - Offers: store offer (buyer, token_id, unit_price, remaining_qty, expiry). On accept: seller sends tokens to buyer; buyer’s locked XTZ goes to seller (and royalty). Handle partial fill if design allows.
   - Contract as operator: marketplace often needs contract to be operator for seller to transfer on sale; add/remove as needed around listing/buy.

3. **SmartPy v2:**
   - Use `@sp.module` and `def main():` with types and class inside.
   - Types: `sp.record(...)`, `sp.variant(...)`, `sp.list[...]`, `sp.big_map[...]`. Use `sp.cast` for params and storage init.
   - Entrypoints: `@sp.entrypoint`; no `self` in param. Views: `@sp.onchain_view`.
   - Big_map key: use `sp.record(...)` for compound keys; check `key in self.data.xxx` before read/del; when balance goes to 0, remove ledger key and any listing for that key.

4. **Bowers-specific:**
   - `token_config` per token_id: creator, mint_price, mint_end, mint_paused, max_supply, minted, allowlist_end (if allowlist), royalty_recipient, royalty_bps, min_offer_per_unit_mutez (marketplace contracts).
   - Royalties: `royalty_bps <= 10_000`; use `sp.split_tokens(amount, royalty_bps, 10_000)` for royalty share.
   - Allowlist: key `(token_id, address)`; entry `max_qty`, `minted`, `price_override`. During allowlist phase enforce cap and optional price override.
   - Claimable: accumulate in `claimable[address]`; `withdraw` sends and zeros.
   - **Contract blocklist:** `contract_blocklist: sp.big_map[sp.address, sp.unit]`. Admin-only `block_address(addr)` and `unblock_address(addr)`. Enforce in: `transfer` (assert neither `from_` nor `to_` in blocklist), `buy` (assert `sp.sender` not blocked), `make_offer` (assert `sp.sender` not blocked), `accept_offer` (assert offer buyer not blocked), `mint_editions` (assert `to_` not blocked). This makes objkt/teia purchases fail at the token contract when the buyer is blocked.

5. **Safety:**
   - All params: `sp.cast` to expected type.
   - Division: use `sp.split_tokens` for mutez; avoid division by zero.
   - Offer expiry: check `sp.now <= o.expiry` for accept; allow close_offer after expiry or by buyer.

---

## Changelog (memory updates)

- Initial memory created; project index, contract list, and contract rules from Tezos/Trilitech patterns added. First Ollama audit: BowersAllowlistFA2.
- **Restructure (contract blocklist + mint-only):** (1) All five existing contracts: added `contract_blocklist` storage; admin entrypoints `block_address`, `unblock_address`; enforcement in `transfer` (from_/to_), `buy`, `make_offer`, `accept_offer`, `mint_editions` (to_). (2) Three new mint-only contracts: BowersMintOpenEdition, BowersMintAllowlist, BowersMintBondingCurve (no marketplace; claimable + withdraw for mint payments). (3) Compile scripts and `compile-contracts.sh` updated; frontend: new styles in contract-styles.ts, originate.ts storage for mint-only and contract_blocklist, create-collection wizard grouped (Mint only / Mint + marketplace / Marketplace only / Custom) and blocklist info in configure step. (4) Contract rules in memory updated with blocklist behaviour.
- **Supervisor audit + UI refinement:** Fixed critical bugs:
  1. `types.ts` — `BOWERS_STYLE_IDS` missing unified + 3 mint-only IDs; `styleIcons` missing icons. Added `isMintOnlyStyle()`, `hasCreateTokenFlow()` helpers.
  2. `originate.ts` — Contract address extraction used `opHash.replace(/^o/, "KT1")` (wrong). Replaced with proper `op.contractAddress` + RPC block scan fallback.
  3. `mint.ts` — Called `mint` entrypoint (marketplace-only) for all styles. Refactored to: (a) `create_token` + `mint_editions` for OE/allowlist/bonding-curve styles, (b) `mint` for marketplace-only. Now accepts `styleId` param.
  4. Dashboard/collection/mint-token pages — `styleIcons` only mapped 2 styles; now imports shared `styleIcons`. Explorer links hardcoded to ghostnet; now use `explorerBaseUrl` from network context.
  5. Server routes — `isOpenEdition` only matched `bowers-open-edition`; expanded to include all styles with `token_config`.
  6. Created `blocklist.ts` — Client helpers: `blockAddress`, `unblockAddress`, `setAdmin`, `setMintPaused`, `setMintPrice`.
  7. Created `network-context.tsx` — `NetworkProvider` with `ghostnet`/`mainnet` toggle; calls `setActiveNetwork()` on wallet module to reinitialize TezosToolkit + BeaconWallet for correct network.
  8. `wallet.ts` — Added `setActiveNetwork()` to reset tezos/wallet singletons on network change; `getWallet()` now uses `NetworkType.MAINNET` or `GHOSTNET` based on `currentNetwork`.
  9. `server/index.ts` — CSP `connectSrc` expanded with `mainnet.ecadinfra.com`, `tzkt.io`, `api.tzkt.io`, `api.mainnet.tzkt.io`.
  10. Created `manage-contract.tsx` — Tabbed admin page: Blocklist (block/unblock), Mint Config (pause/resume, set price), Admin (transfer role), Withdraw. Wired to `/manage/:id` route.
  11. Added `DEPLOY.md` — Deployment instructions for Cloudflare, Render, Fly.io (all with free tiers).
- **octez.connect transition:** Beacon SDK is sunsetting; Trillitech's octez.connect (`@tezos-x/octez.connect-sdk`) is the approved successor. Implemented dual-provider architecture:
  1. `loaders.ts` — Added `loadOctezConnect()` lazy loader for `@tezos-x/octez.connect-sdk`.
  2. `wallet.ts` — Rewritten with `WalletAdapter` interface. `OctezConnectAdapter` (primary) uses `getDAppClientInstance` from octez.connect SDK. `BeaconLegacyAdapter` (fallback) uses `@taquito/beacon-wallet` + `@airgap/beacon-dapp`. Auto-detect: tries octez.connect first, falls back to Beacon if unavailable. `getActiveProviderName()` exported for UI display.
  3. `wallet-context.tsx` — `providerName` field added to context (`"octez.connect"` or `"beacon"`). Sidebar shows which provider is active.
  4. Both providers are lazy-loaded. Both integrate with Taquito via `setWalletProvider()`. When octez.connect is active, it creates a `BeaconWallet` under the hood for Taquito compatibility while using `DAppClient` for permission/account management.
  5. Package: `@tezos-x/octez.connect-sdk@1.0.0` added to dependencies.

---

## Bowers/DEPLOY.md

# Bowers Deployment Guide

Three routes to deploy Bowers to a live web state, each with free tiers suitable for testing.

## Prerequisites (all routes)

1. **Build the production bundle:**
   ```bash
   npm install
   npm run build
   ```
   This produces `dist/index.cjs` (server) and `dist/public/` (client assets).

2. **Database:** You need a PostgreSQL instance. Options:
   - [Neon](https://neon.tech) — free tier, serverless Postgres, zero config
   - [Supabase](https://supabase.com) — free tier with Postgres
   - [Railway](https://railway.app) — free starter plan with Postgres add-on

3. **Environment variables** (set these in your deployment platform):
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/bowers
   SESSION_SECRET=<random-64+-char-string>
   NODE_ENV=production
   PORT=3000
   ALLOWED_ORIGINS=https://yourdomain.com
   PINATA_JWT=<your-pinata-jwt-for-ipfs>
   ```

4. **IPFS:** Get a free Pinata JWT at https://app.pinata.cloud (free tier: 1GB storage, 100 pins).

---

## Route 1: Cloudflare Pages + Workers (Recommended)

Cloudflare offers a generous free tier with global edge deployment, SSL, and custom domains.

### Steps

1. **Install Wrangler:**
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. **Create a `wrangler.toml`** in the project root:
   ```toml
   name = "bowers"
   compatibility_date = "2024-01-01"
   main = "dist/index.cjs"

   [vars]
   NODE_ENV = "production"

   [site]
   bucket = "dist/public"
   ```

3. **Deploy:**
   ```bash
   # Set secrets (one-time)
   wrangler secret put DATABASE_URL
   wrangler secret put SESSION_SECRET
   wrangler secret put PINATA_JWT
   wrangler secret put ALLOWED_ORIGINS

   # Deploy
   wrangler deploy
   ```

4. **Custom domain:** In the Cloudflare dashboard, go to Workers & Pages > your project > Settings > Domains, and add your domain.

### Free tier includes
- 100,000 requests/day
- Global edge network
- Free SSL
- Custom domains

### Alternative: Cloudflare Pages (static + Functions)
If you prefer to separate the frontend from the backend, deploy the `dist/public/` folder as a Cloudflare Pages site and run the server separately on another platform.

---

## Route 2: Render

Render provides a straightforward free tier for web services with automatic deploys and managed PostgreSQL.

### Steps

1. **Create a Render account** at https://render.com

2. **Create a PostgreSQL database:**
   - Dashboard > New > PostgreSQL
   - Choose the free tier
   - Copy the Internal Database URL

3. **Create a Web Service:**
   - Dashboard > New > Web Service
   - Connect your repo or use "Deploy from existing image"
   - Settings:
     - **Build Command:** `npm install && npm run build`
     - **Start Command:** `npm start`
     - **Environment:** Node
     - **Instance Type:** Free

4. **Set environment variables** in the Render dashboard:
   ```
   DATABASE_URL=<internal-db-url-from-step-2>
   SESSION_SECRET=<random-string>
   NODE_ENV=production
   PINATA_JWT=<your-jwt>
   ALLOWED_ORIGINS=https://your-service.onrender.com
   ```

5. **Deploy:** Push to your connected repo or trigger a manual deploy.

### Free tier includes
- 750 hours/month of web service runtime
- Free managed PostgreSQL (90-day retention on free tier)
- Automatic SSL
- Custom domains
- Auto-deploy from Git

---

## Route 3: Fly.io

Fly.io deploys Docker containers to edge locations worldwide. Their free tier includes enough resources for a production app.

### Steps

1. **Install flyctl:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create a `Dockerfile`** in the project root:
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM node:20-alpine
   WORKDIR /app
   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/package.json ./
   EXPOSE 3000
   CMD ["npm", "start"]
   ```

3. **Launch the app:**
   ```bash
   fly launch --name bowers --region iad
   ```
   When prompted, say yes to creating a Postgres database (free tier).

4. **Set secrets:**
   ```bash
   fly secrets set SESSION_SECRET="<random-string>"
   fly secrets set PINATA_JWT="<your-jwt>"
   fly secrets set ALLOWED_ORIGINS="https://bowers.fly.dev"
   ```
   Note: `DATABASE_URL` is automatically set when you attach a Fly Postgres database.

5. **Deploy:**
   ```bash
   fly deploy
   ```

6. **Custom domain:**
   ```bash
   fly certs add yourdomain.com
   ```
   Then point your DNS to the provided CNAME.

### Free tier includes
- 3 shared-cpu-1x VMs (256MB RAM each)
- 3GB persistent storage
- Free Postgres (1GB)
- Automatic SSL
- Global edge deployment

---

## Switching to Mainnet

The app ships with Shadownet (testnet) as the default. To switch to Mainnet:

1. **In the UI:** Click the network badge in the sidebar to toggle between Shadownet and Mainnet. The wallet, RPC, and explorer links all switch automatically.

2. **CSP headers:** The server already allows both `shadownet.tezos.ecadinfra.com` and `mainnet.ecadinfra.com` in its Content Security Policy.

3. **Wallet reconnection:** When switching networks, users need to reconnect their wallet — the Beacon SDK creates network-specific sessions.

4. **No code changes required** — the network context propagates through the entire stack.


---

## Bowers/README.md

# Bowers

FA2 NFT collections and marketplace on Tezos (Shadownet by default, with Mainnet support).

## Database setup

The app uses PostgreSQL. Default dev credentials (in `.env`): **admin** / **password**.

### Option A: Docker (recommended)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) if needed.
2. Start the database:
   ```bash
   npm run db:up
   ```
3. Create tables:
   ```bash
   npm run db:push
   ```

### Option B: Local PostgreSQL

1. Install and start PostgreSQL (e.g. `brew install postgresql@16 && brew services start postgresql@16`).
2. Create user and database:
   ```bash
   createuser -P admin   # set password to: password
   createdb -O admin bowers
   ```
3. Ensure `.env` has:
   ```
   DATABASE_URL=postgresql://admin:password@localhost:5432/bowers
   ```
4. Create tables:
   ```bash
   npm run db:push
   ```

## Run the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up or sign in once the database is running.

## Validation checks

```bash
npm run check
npm run check:styles
npm run test:e2e:smoke
```

## Deployment and network docs

- Deployment options: `DEPLOY.md`
- Operational runbook and lessons learned: `docs/DEPLOYMENT-GUIDE.md`
- Network switching in-app: use the sidebar badge (`Shadownet (Testnet)` / `Mainnet`)

---

## Conflict-Atlas/README.md

# Conflict Atlas

Conflict Atlas is a sandbox project that tracks global conflict events from headline feeds, classifies them, and visualizes them on a world map with a timeline slider.

## What it does

- Pulls headlines from multiple providers every hour via RSS feeds.
- Detects conflict-relevant headlines using keyword filters.
- Classifies each event by:
  - location (lat/lon + region)
  - conflict type (airstrike, missile/drone, ground clash, diplomacy, etc.)
  - severity (1-5)
  - actors
  - story corridor / thread (example: Israel-Gaza-Lebanon arc)
- Stores everything in local SQLite.
- Shows events on an interactive map and lets users scrub timeline history.

## Run locally

```bash
cd /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/Conflict-Atlas
npm install
npm run dev
```

Open:

- http://localhost:3340

Optional one-off ingest:

```bash
npm run ingest
```

## API endpoints

- `GET /api/health`
- `POST /api/ingest/run`
- `GET /api/events?window=30d&limit=8000`
- `GET /api/timeline?window=30d`
- `GET /api/clusters?window=30d&limit=40`
- `GET /api/coverage?window=30d`
- `GET /api/sources`
- `GET /api/runs?limit=20`
- `GET /api/stats`

## Data model

- `headlines`: raw feed headline records
- `events`: classified and mappable conflict events
- `source_status`: per-source ingest health
- `ingest_runs`: ingest run diagnostics

SQLite file:

- `./data/conflict_atlas.db`

## Current classification strategy

This version uses headline + summary text only.

Pros:

- fast, low-cost ingestion
- no full-article scraping pipeline required
- good for trend surface and early signal

Limits:

- some events are ambiguous or under-specified in headline text
- location and actor resolution is heuristic
- difficult to disambiguate multi-event roundups

## Practical fallback if headline-only is insufficient

If you want production-grade reliability without manually curating all articles, move to a 2-stage pipeline:

1. **Headline stage (existing):** detect candidate conflict items quickly.
2. **Selective enrichment stage:** only fetch full article text for low-confidence or high-impact events.

Suggested gate for enrichment:

- confidence `< 0.45`
- severity `>= 4`
- large corridor spikes (unusual burst in 24h)

This keeps scrape volume bounded while improving accuracy where it matters most.

---

## Discord Bots/COMMANDS.md

# Command Reference

Quick reference for all bot commands.

## 👤 User Commands (Everyone)

### Stats & Progress
| Command | Description | Example |
|---------|-------------|---------|
| `!stats` | View your XP, level, and progress | `!stats` |
| `!stats @user` | View another user's stats | `!stats @JohnDoe` |
| `!rank` | Check your server rank | `!rank` |
| `!rank @user` | Check another user's rank | `!rank @JohnDoe` |
| `!levels` | View leveling system information | `!levels` |
| `!compare @user1 @user2` | Compare two users' stats | `!compare @Alice @Bob` |

### Leaderboards
| Command | Description | Example |
|---------|-------------|---------|
| `!leaderboard` | View top 10 users | `!leaderboard` |
| `!lb 25` | View top 25 users | `!lb 25` |
| `!top` | Alias for leaderboard | `!top` |

### Image Challenges
| Command | Description | Example |
|---------|-------------|---------|
| `!respond <answer>` | Submit a challenge response | `!respond The shadow is too dark and lighting is off` |
| *(Button)* | Use the interactive button on challenges | Click "Submit Response" |

### Trait Ideas
| Command | Description | Example |
|---------|-------------|---------|
| `!suggest <name> [desc]` | Submit a trait idea | `!suggest "Fire Wings" Wings made of flames` |
| `!suggesttrait` | Alias for suggest | `!suggesttrait "Ice Crown"` |
| `!mytraits` | View your trait submissions | `!mytraits` |
| `!mytraits @user` | View another user's traits | `!mytraits @JohnDoe` |
| `!alltraits` | View all trait ideas | `!alltraits` |
| `!alltraits adopted` | View only adopted traits | `!alltraits adopted` |
| `!alltraits pending` | View only pending traits | `!alltraits pending` |
| `!traitstats` | View trait statistics | `!traitstats` |

---

## 🛡️ Moderator Commands

*Requires Moderator or Admin role*

### XP Management
| Command | Description | Example |
|---------|-------------|---------|
| `!addxp @user <amount> [reason]` | Award XP to a user | `!addxp @Bob 50 Great contribution!` |
| `!removexp @user <amount> [reason]` | Remove XP from a user | `!removexp @Alice 25 Spam warning` |
| `!history @user [limit]` | View user's XP history | `!history @Bob 20` |

### Image Challenges
| Command | Description | Example |
|---------|-------------|---------|
| `!postchallenge <url> <issues>` | Post an image challenge | `!postchallenge https://i.imgur.com/abc.png Shadow too dark, bad lighting` |
| `!award_bonus <id> <points>` | Award bonus for response | `!award_bonus 42 25` |
| *(Buttons)* | Use review buttons in mod channel | Click "Award 25 XP" |

### Trait Management
| Command | Description | Example |
|---------|-------------|---------|
| `!adoptrait <trait_id>` | Mark a trait as adopted | `!adoptrait 7` |

### Tezos Verification
| Command | Description | Example |
|---------|-------------|---------|
| `!verifytezos @user` | Verify a Tezos token holder | `!verifytezos @Alice` |
| `!unverifytezos @user` | Remove Tezos verification | `!unverifytezos @Bob` |

---

## 🎵 DJ Commands (Music Playback)

*Available to everyone unless noted*

### Basic Playback
| Command | Description | Example |
|---------|-------------|---------|
| `!join` | DJ joins your voice channel | `!join` |
| `!leave` | DJ leaves voice channel | `!leave` |
| `!play [song]` | Play song or resume playback | `!play summer vibes` |
| `!pause` | Pause current track | `!pause` |
| `!resume` | Resume playback | `!resume` |
| `!skip` | Skip current track | `!skip` |
| `!stop` | Stop and clear queue | `!stop` |

### Queue & Info
| Command | Description | Example |
|---------|-------------|---------|
| `!queue [page]` | Show current queue | `!queue 2` |
| `!nowplaying` | Show current track info | `!nowplaying` |
| `!np` | Alias for nowplaying | `!np` |
| `!library [page]` | Show all available songs | `!library` |

### Playback Modes
| Command | Description | Example |
|---------|-------------|---------|
| `!random [on/off]` | Toggle/set random mode | `!random on` |
| `!loop` | Toggle loop mode | `!loop` |
| `!volume [0-100]` | Set or show volume | `!volume 75` |
| `!scan` | Rescan music channel (Mod) | `!scan` |

### Playlists
| Command | Description | Example |
|---------|-------------|---------|
| `!playlist` | Show playlist commands | `!playlist` |
| `!playlist create <name>` | Create new playlist | `!playlist create Chill Mix` |
| `!playlist list` | Show all playlists | `!playlist list` |
| `!playlist show <id>` | Show tracks in playlist | `!playlist show 1` |
| `!playlist add <pl> <song>` | Add song to playlist | `!playlist add 1 5` |
| `!playlist remove <pl> <song>` | Remove song from playlist | `!playlist remove 1 5` |
| `!playlist play <id>` | Play entire playlist | `!playlist play 1` |
| `!playlist delete <id>` | Delete playlist | `!playlist delete 1` |

---

## 👑 Admin Commands

*Requires Admin role*

### Advanced XP Management
| Command | Description | Example |
|---------|-------------|---------|
| `!setxp @user <amount> [reason]` | Set exact XP amount | `!setxp @Bob 5000 Event winner` |

### Bot Management
| Command | Description | Example |
|---------|-------------|---------|
| `!botstats` | View comprehensive bot stats | `!botstats` |
| `!reload <cog>` | Reload a cog without restart | `!reload core_agent` |

---

## 💡 Quick Tips

### For Users
- **Earn XP by being active**: Send messages, react to posts, join voice channels
- **Complete challenges**: Respond to image challenges for bonus XP
- **Submit ideas**: Suggest traits that might get adopted for big rewards
- **Check progress often**: Use `!stats` to see how close you are to leveling up
- **Compete**: Check `!leaderboard` to see how you rank

### For Moderators
- **Review promptly**: Check the moderator review channel regularly
- **Be generous**: Reward quality contributions to encourage engagement
- **Verify holders**: Use `!verifytezos` to give token holders their badge
- **Adopt good traits**: Use `!adoptrait` to reward creative ideas

### For Admins
- **Monitor stats**: Use `!botstats` to track engagement
- **Balance XP**: Adjust values in `.env` if leveling is too fast/slow
- **Reload on updates**: Use `!reload <cog>` to update without downtime
- **Backup regularly**: Copy `bot_database.db` periodically

---

## 📊 XP Earning Rates (Default)

| Activity | XP Earned | Notes |
|----------|-----------|-------|
| 💬 Send Message | 1 XP | 60 second cooldown |
| 👍 React to Bot | 2 XP | Per reaction |
| 🎤 Voice Chat | 5 XP/min | While in voice channel |
| 🎯 Challenge Response | 10 XP | Base amount |
| 🎯 Challenge Bonus | Up to 50 XP | From moderator review |
| 💡 Trait Suggestion | 5 XP | Per submission |
| 💡 Trait Adopted | 100 XP | When your trait is used! |
| 💎 Tezos Verified | 50 XP | One-time bonus |

*Adjust these values in your `.env` file*

---

## 🎮 Command Aliases

Some commands have shorter versions:

- `!leaderboard` = `!lb` = `!top`
- `!suggest` = `!suggesttrait`
- `!stats` = `!profile` = `!xp`

---

## ❓ Help

Need help with a specific command?
```
!help
!help <command_name>
```

Example:
```
!help suggest
!help addxp
```


---

## Discord Bots/DJ_GUIDE.md

# DJ Agent Guide

Complete guide for the music playback system.

## 🎵 Overview

The DJ Agent turns your Discord bot into a full-featured music player that:
- Plays MP3 files uploaded to the "HEY DJ!" channel
- Manages playlists
- Supports 24/7 random playback mode
- Caches music for faster playback
- Tracks play counts and statistics

## 📋 Requirements

### 1. FFmpeg
The DJ requires FFmpeg for audio playback.

**Install FFmpeg:**
- **macOS**: `brew install ffmpeg`
- **Windows**: `choco install ffmpeg` or [manual install](FFMPEG_INSTALL.md)
- **Linux**: `sudo apt install ffmpeg`

See [FFMPEG_INSTALL.md](FFMPEG_INSTALL.md) for detailed instructions.

### 2. Voice Channel Permissions
Bot needs these permissions:
- Connect to voice channels
- Speak in voice channels
- View channels

### 3. Music Source Channel
Create a channel called **"HEY DJ!"** where users can upload MP3 files.

## ⚙️ Configuration

Add these to your `.env` file:

```env
# Channel IDs
DJ_CHANNEL_ID=123456789  # "HEY DJ!" text channel ID
DJ_VOICE_CHANNEL_ID=987654321  # Default voice channel (optional)

# DJ Settings
DJ_ENABLED=true
DJ_DEFAULT_VOLUME=50
DJ_RANDOM_MODE=false
DJ_AUTO_RECONNECT=true
DJ_CACHE_MUSIC=true
DJ_MAX_CACHE_SIZE_MB=500
```

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `DJ_ENABLED` | Enable/disable DJ agent | `true` |
| `DJ_CHANNEL_ID` | Text channel for music files | `0` (required) |
| `DJ_VOICE_CHANNEL_ID` | Default voice channel for 24/7 | `0` (optional) |
| `DJ_DEFAULT_VOLUME` | Default volume percentage | `50` |
| `DJ_RANDOM_MODE` | Start in random mode | `false` |
| `DJ_AUTO_RECONNECT` | Auto-reconnect in 24/7 mode | `true` |
| `DJ_CACHE_MUSIC` | Cache downloaded files | `true` |
| `DJ_MAX_CACHE_SIZE_MB` | Max cache size in MB | `500` |

## 🎮 Commands

### Basic Playback

| Command | Description | Example |
|---------|-------------|---------|
| `!join` | Join your voice channel | `!join` |
| `!leave` | Leave voice channel | `!leave` |
| `!play [song]` | Play a song or resume | `!play epic music` |
| `!pause` | Pause playback | `!pause` |
| `!resume` | Resume playback | `!resume` |
| `!skip` | Skip current track | `!skip` |
| `!stop` | Stop and clear queue | `!stop` |

### Queue Management

| Command | Description | Example |
|---------|-------------|---------|
| `!queue` | Show current queue | `!queue` |
| `!queue 2` | Show page 2 of queue | `!queue 2` |
| `!nowplaying` | Show current track | `!nowplaying` |
| `!np` | Alias for nowplaying | `!np` |

### Music Library

| Command | Description | Example |
|---------|-------------|---------|
| `!library` | Show all songs | `!library` |
| `!library 2` | Show page 2 | `!library 2` |
| `!scan` | Rescan music channel (mod) | `!scan` |

### Playback Modes

| Command | Description | Example |
|---------|-------------|---------|
| `!random` | Toggle random mode | `!random` |
| `!random on` | Enable random mode | `!random on` |
| `!loop` | Toggle loop mode | `!loop` |
| `!volume [0-100]` | Set or show volume | `!volume 75` |

### Playlist Management

| Command | Description | Example |
|---------|-------------|---------|
| `!playlist` | Show playlist commands | `!playlist` |
| `!playlist create <name>` | Create new playlist | `!playlist create Chill Vibes` |
| `!playlist list` | Show all playlists | `!playlist list` |
| `!playlist show <id>` | Show playlist tracks | `!playlist show 1` |
| `!playlist add <pl_id> <song_id>` | Add song to playlist | `!playlist add 1 5` |
| `!playlist remove <pl_id> <song_id>` | Remove song | `!playlist remove 1 5` |
| `!playlist play <id>` | Play entire playlist | `!playlist play 1` |
| `!playlist delete <id>` | Delete playlist | `!playlist delete 1` |

## 📚 Usage Examples

### Basic Playback
```
User: !join
Bot: 🎵 Joined General Voice!

User: !play summer
Bot: ➕ Added to queue: Summer Vibes.mp3

User: !np
Bot: [Shows now playing embed with track info]

User: !skip
Bot: ⏭️ Skipped!
```

### Creating a Playlist
```
User: !playlist create Workout Mix
Bot: ✅ Created playlist Workout Mix (ID: 1)

User: !library
Bot: [Shows available songs with IDs]

User: !playlist add 1 5
Bot: ✅ Added Epic Rock.mp3 to playlist Workout Mix

User: !playlist add 1 12
Bot: ✅ Added High Energy.mp3 to playlist Workout Mix

User: !playlist play 1
Bot: ✅ Playing playlist Workout Mix (2 tracks)
```

### 24/7 Random Mode
```
Moderator: !join
Bot: 🎵 Joined 24/7 Music!

Moderator: !random on
Bot: 🔀 Random mode enabled!
Bot: ➕ Added 10 random tracks to queue

[Bot plays continuously in random mode]
```

## 🎯 Workflows

### Setting Up Music Library

1. **Create Channel**
   ```
   Create a text channel named "HEY DJ!"
   ```

2. **Configure Bot**
   ```env
   DJ_CHANNEL_ID=your_channel_id_here
   ```

3. **Upload Music**
   - Have users upload MP3 files to the channel
   - Bot automatically scans every 30 minutes
   - Or use `!scan` to scan immediately

4. **Verify Library**
   ```
   !library
   ```

### Setting Up 24/7 Music

1. **Create Dedicated Voice Channel**
   ```
   Create a voice channel for 24/7 music
   ```

2. **Configure**
   ```env
   DJ_VOICE_CHANNEL_ID=your_voice_channel_id
   DJ_AUTO_RECONNECT=true

---

## Discord Bots/DJ_QUICKSTART.md

# DJ Quick Start

Get the DJ up and running in 5 minutes!

## ✅ Prerequisites

1. **Install FFmpeg**
   ```bash
   # macOS
   brew install ffmpeg
   
   # Windows
   choco install ffmpeg
   
   # Linux
   sudo apt install ffmpeg
   ```

2. **Install Python dependencies**
   ```bash
   pip install PyNaCl yt-dlp aiohttp
   ```

## 🎵 Setup Steps

### 1. Create "HEY DJ!" Channel
Create a text channel named **"HEY DJ!"** in your Discord server.

### 2. Get Channel ID
- Right-click the channel → Copy ID
- Add to `.env`:
  ```env
  DJ_CHANNEL_ID=your_channel_id_here
  DJ_ENABLED=true
  ```

### 3. Upload Music
- Have users upload MP3 files to the "HEY DJ!" channel
- Bot will automatically scan every 30 minutes
- Or use `!scan` to scan immediately (moderator only)

### 4. Start Playing
```
!join          # Join voice channel
!library       # See available songs
!play summer   # Play a song by name
!volume 50     # Set volume to 50%
```

## 🎮 Essential Commands

### Join & Play
```
!join                  # Bot joins your voice
!play [song name/id]   # Play music
!pause                 # Pause playback
!resume                # Resume
!skip                  # Skip track
!stop                  # Stop & clear queue
```

### Queue
```
!queue        # Show queue
!nowplaying   # Show current track
!library      # Browse all songs
```

### Modes
```
!random on    # Enable shuffle mode
!loop         # Loop current track
!volume 75    # Set volume 0-100
```

### Playlists
```
!playlist create Chill Mix
!playlist add 1 5         # Add song 5 to playlist 1
!playlist play 1          # Play playlist
!playlist list            # Show all playlists
```

## 🔥 Pro Tips

### 24/7 Music Server
```env
# In .env
DJ_VOICE_CHANNEL_ID=your_24_7_voice_channel_id
DJ_AUTO_RECONNECT=true
DJ_RANDOM_MODE=true
```

Then:
```
!join
!random on
!volume 30
# Bot plays continuously!
```

### Organize Your Music
- Name files clearly: `Artist - Song.mp3`
- Create themed playlists
- Use `!scan` after bulk uploads
- Check play counts with `!library`

### Performance
- Enable caching: `DJ_CACHE_MUSIC=true`
- First play downloads, next play is instant
- Cache stored in `music_cache/` folder

## ❓ Troubleshooting

**Bot won't join voice?**
- Check bot has Connect + Speak permissions
- Try leaving and rejoining: `!leave` then `!join`

**No music plays?**
- Verify FFmpeg installed: `ffmpeg -version`
- Check music library: `!library`
- Upload MP3s to HEY DJ! channel
- Run `!scan`

**Music is laggy?**
- Enable caching in config
- Lower volume: `!volume 40`
- Check internet connection

## 📚 Learn More

- Full DJ Guide: [DJ_GUIDE.md](DJ_GUIDE.md)
- FFmpeg Install: [FFMPEG_INSTALL.md](FFMPEG_INSTALL.md)
- All Commands: [COMMANDS.md](COMMANDS.md)

---

**Let the music play! 🎵**


---

## Discord Bots/FFMPEG_INSTALL.md

# FFmpeg Installation Guide

FFmpeg is required for the DJ music playback feature. Follow these instructions to install it on your system.

## macOS

### Using Homebrew (Recommended)
```bash
brew install ffmpeg
```

### Verify Installation
```bash
ffmpeg -version
```

## Windows

### Option 1: Using Chocolatey (Recommended)
```powershell
choco install ffmpeg
```

### Option 2: Manual Installation
1. Download FFmpeg from https://ffmpeg.org/download.html
2. Extract the files to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to your system PATH:
   - Right-click "This PC" → Properties
   - Advanced system settings → Environment Variables
   - Under System variables, find "Path" → Edit
   - Add new entry: `C:\ffmpeg\bin`
   - Click OK and restart terminal

### Verify Installation
```powershell
ffmpeg -version
```

## Linux

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install ffmpeg
```

### Fedora
```bash
sudo dnf install ffmpeg
```

### Arch Linux
```bash
sudo pacman -S ffmpeg
```

### Verify Installation
```bash
ffmpeg -version
```

## Troubleshooting

### "ffmpeg not found" error
- Make sure ffmpeg is in your system PATH
- Restart your terminal/command prompt after installation
- Try running with full path (e.g., `/usr/local/bin/ffmpeg`)

### Permission errors on Linux/Mac
```bash
sudo chmod +x /usr/local/bin/ffmpeg
```

### Python can't find ffmpeg
Make sure ffmpeg is callable from the command line before starting the bot.

---

**Once installed, you can use all DJ features!** 🎵


---

## Discord Bots/PROJECT_STRUCTURE.md

# Project Structure

Overview of the Discord XP Bot system architecture.

## 📁 File Structure

```
Discord Bots/
├── bot.py                          # Main bot entry point
├── config.py                       # Configuration management
├── database.py                     # Database operations
├── requirements.txt                # Python dependencies
├── .env                           # Environment variables (create from example)
├── config.example.env             # Example configuration
├── .gitignore                     # Git ignore patterns
├── bot_database.db                # SQLite database (auto-created)
│
├── cogs/                          # Modular agent system
│   ├── __init__.py
│   ├── core_agent.py              # Core XP tracking
│   ├── image_challenge_agent.py   # Image challenges
│   ├── trait_ideas_agent.py       # Trait submissions
│   ├── admin_commands.py          # Admin/mod commands
│   └── leaderboard.py             # Rankings & stats
│
├── start.sh                       # Unix/Mac startup script
├── start.bat                      # Windows startup script
│
└── Documentation/
    ├── README.md                  # Main documentation
    ├── SETUP.md                   # Setup guide
    ├── COMMANDS.md                # Command reference
    └── PROJECT_STRUCTURE.md       # This file
```

## 🏗️ Architecture

### Master Bot (`bot.py`)
- Coordinates all agents (cogs)
- Manages database connection
- Handles global events and errors
- Command prefix: `!`

### Configuration (`config.py`)
- Loads environment variables
- Provides configuration values to all modules
- Handles XP calculations for leveling

### Database Layer (`database.py`)
- SQLite with aiosqlite for async operations
- Centralized data access for all agents
- Automatic table creation
- Transaction logging

### Agent System (`cogs/`)

#### Core Agent
**Purpose**: Basic XP earning mechanics
- Message XP (with cooldown)
- Reaction XP (on bot messages)
- Voice channel XP tracking
- Level-up announcements
- User stats command

#### Image Challenge Agent
**Purpose**: Interactive image challenges
- Post challenges with known issues
- Collect user responses
- Base XP on submission
- Moderator review system
- Bonus XP awards
- Interactive buttons/modals

#### Trait Ideas Agent
**Purpose**: Community idea submission
- Submit trait ideas
- Track all submissions
- Adoption system
- Special role rewards (Trait Master)
- Statistics tracking

#### Admin Commands
**Purpose**: Bot management
- Manual XP adjustments
- Tezos verification
- Transaction history
- Bot statistics
- Cog hot-reloading

#### Leaderboard
**Purpose**: Rankings and competition
- XP leaderboard
- Rank checking
- User comparisons
- Progress tracking
- Statistics display

## 🗄️ Database Schema

### `users`
Primary table for user data
```sql
user_id         INTEGER PRIMARY KEY
username        TEXT
xp              INTEGER
level           INTEGER
last_message_time INTEGER
tezos_verified  INTEGER (0/1)
created_at      INTEGER
updated_at      INTEGER
```

### `point_transactions`
Audit log of all XP changes
```sql
id              INTEGER PRIMARY KEY
user_id         INTEGER (FK)
points          INTEGER (can be negative)
reason          TEXT
agent_name      TEXT
moderator_id    INTEGER
timestamp       INTEGER
```

### `image_challenges`
Posted image challenges
```sql
id              INTEGER PRIMARY KEY
message_id      INTEGER UNIQUE
image_url       TEXT
known_issues    TEXT
posted_by       INTEGER
posted_at       INTEGER
active          INTEGER (0/1)
```

### `challenge_responses`
User responses to challenges
```sql
id              INTEGER PRIMARY KEY
challenge_id    INTEGER (FK)
user_id         INTEGER (FK)
response        TEXT
points_awarded  INTEGER
bonus_points    INTEGER
reviewed        INTEGER (0/1)
review_message_id INTEGER
submitted_at    INTEGER
```

### `trait_ideas`
User-submitted trait ideas
```sql
id              INTEGER PRIMARY KEY
user_id         INTEGER (FK)
trait_name      TEXT
description     TEXT
adopted         INTEGER (0/1)
adopted_by      INTEGER
submitted_at    INTEGER
adopted_at      INTEGER
```

### `level_roles`
Level-based role assignments (future)
```sql
level           INTEGER PRIMARY KEY
role_id         INTEGER
role_name       TEXT
```

## 🔄 Data Flow

### XP Award Flow
```
1. Event occurs (message, reaction, etc.)
   ↓
2. Agent validates event
   ↓
3. Agent calls db.add_xp()
   ↓
4. Database updates XP and calculates new level
   ↓
5. Transaction logged
   ↓
6. If level up: announcement sent
   ↓
7. Return result to agent
```

### Challenge Flow
```
1. Admin posts challenge → database
   ↓
2. User submits response → database
   ↓
3. Base XP awarded immediately
   ↓
4. Response sent to moderator channel
   ↓

---

## Discord Bots/QUICKSTART.md

# Quick Start Guide

Get your Discord XP Bot running in 5 minutes!

## ⚡ Fast Setup

### 1. Install Dependencies
```bash
# Python packages
pip install discord.py python-dotenv aiosqlite PyNaCl yt-dlp

# FFmpeg for music playback
# macOS: brew install ffmpeg
# Windows: choco install ffmpeg  
# Linux: sudo apt install ffmpeg
```

### 2. Create Your Bot
1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Go to "Bot" → "Add Bot"
4. Enable ALL three intents under "Privileged Gateway Intents"
5. Copy the bot token

### 3. Configure
```bash
cp config.example.env .env
```

Edit `.env` and add your bot token:
```env
DISCORD_TOKEN=your_token_here
GUILD_ID=your_server_id
MODERATOR_ROLE_ID=your_mod_role_id
ADMIN_ROLE_ID=your_admin_role_id
```

### 4. Invite Bot
Use this URL (replace `YOUR_CLIENT_ID`):
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot
```

### 5. Run
```bash
python bot.py
```

## 🎮 Test It Out

In Discord, try:
```
!help
!stats
!levels
!leaderboard
```

Give yourself admin role, then:
```
!addxp @yourself 500 Testing
!stats
```

## 📖 Next Steps

- **Full setup**: See [SETUP.md](SETUP.md)
- **All commands**: See [COMMANDS.md](COMMANDS.md)
- **Full docs**: See [README.md](README.md)

## 🎯 Key Features to Try

### 1. DJ Music
```
Create a channel called "HEY DJ!"
Upload some MP3 files to it
!scan
!join
!play <song name>
!random on
```

### 2. Image Challenge
```
!postchallenge https://i.imgur.com/example.png Shadow too dark
```
Users click button or use `!respond` to answer.

### 3. Trait Ideas
```
!suggest "Fire Wings" Wings made of flames
```
Then adopt it:
```
!adoptrait 1
```

### 4. Tezos Verification
```
!verifytezos @user
```

## ⚙️ Adjust XP Values

Edit `.env` to change how fast users level:

```env
# Faster leveling
POINTS_PER_MESSAGE=5
XP_BASE=50

# Slower leveling  
POINTS_PER_MESSAGE=1
XP_BASE=200
```

## 🐛 Common Issues

**Bot doesn't respond?**
- Check intents are enabled
- Verify bot has "Send Messages" permission
- Make sure token is correct

**Can't use commands?**
- Check role IDs in `.env`
- Make sure you have the role
- Try `!help` first

**Bot crashes?**
- Check console for errors
- Verify Python 3.8+
- Delete `bot_database.db` and retry

## 🎉 You're Ready!

Your bot is now tracking XP, handling challenges, and building community engagement!

For detailed documentation, see [README.md](README.md).

---

**Built with ❤️ for Discord communities**


---

## Discord Bots/README.md

# Discord XP & Engagement Bot System
## Complete User Manual

A comprehensive modular Discord bot system designed to reward community engagement through XP, leveling, interactive challenges, and music playback. Perfect for NFT communities, particularly those built around Tezos tokens.

---

## 📖 Table of Contents

### Getting Started
1. [Overview](#-overview)
2. [Features](#-features)
3. [Requirements](#-requirements)
4. [Installation](#-installation)
5. [Configuration](#-configuration)
6. [First Time Setup](#-first-time-setup)

### Core Systems
7. [XP & Leveling System](#-xp--leveling-system-detailed)
8. [DJ Music System](#-dj-music-system-detailed)
9. [Image Challenge System](#-image-challenge-system-detailed)
10. [Trait Ideas System](#-trait-ideas-system-detailed)
11. [Tezos Verification](#-tezos-verification-detailed)
12. [Leaderboards & Stats](#-leaderboards--stats-detailed)

### User Guides
13. [For Server Members](#-for-server-members)
14. [For Moderators](#-for-moderators)
15. [For Administrators](#-for-administrators)

### Reference
16. [All Commands](#-complete-command-reference)
17. [Configuration Options](#-configuration-reference)
18. [Database Schema](#-database-schema-detailed)
19. [Troubleshooting](#-troubleshooting-guide)
20. [Best Practices](#-best-practices--tips)
21. [FAQs](#-frequently-asked-questions)

### Advanced
22. [Customization](#-customization--extension)
23. [Architecture](#-technical-architecture)
24. [Security](#-security-considerations)
25. [Performance](#-performance-optimization)

---

## 🎯 Overview

This bot system transforms your Discord server into an engaging community platform with multiple integrated systems:

- **Engagement Rewards**: Users earn XP through natural Discord activities
- **Music Entertainment**: 24/7 music playback from community-uploaded songs
- **Interactive Challenges**: Creative tasks with rewards
- **Community Input**: Trait suggestion system for projects
- **Token Integration**: Special benefits for token holders

**Perfect For:**
- NFT project communities
- Gaming servers
- Creative communities
- Educational servers
- Any Discord server wanting to boost engagement

---

## 🌟 Features

### Core XP System
- **Automatic XP Tracking**: Earn XP from messages, reactions, and voice channel activity
- **Level Progression**: Dynamic leveling system with configurable XP requirements
- **Cooldown Management**: Prevent spam with message cooldown system
- **Real-time Announcements**: Celebrate level-ups instantly

### 🎵 DJ Music System
- **Music Playback**: Play MP3 files from dedicated "HEY DJ!" channel
- **Playlist Management**: Create, edit, and share custom playlists
- **24/7 Random Mode**: Continuous random playback with auto-reconnect
- **Smart Queue**: Automatic queue management and track caching
- **Music Library**: Automatic scanning and indexing of uploaded songs
- **Full Controls**: Play, pause, skip, volume, loop, and more

### 🎯 Image Challenge Agent
- Post image challenges with known issues
- Users submit responses for base XP
- Moderators review responses and award bonus points
- Interactive button and modal interfaces
- Automated review queue system

### 💡 Trait Ideas Agent
- Users submit creative trait ideas for your project
- Track which traits get adopted
- Reward users when their ideas are adopted
- Special "Trait Master" role for prolific contributors
- View statistics and track all submissions

### 💎 Tezos Verification System
- Verify token holders with special roles
- Bonus XP for verified members
- Visual badges on leaderboards

### 🏆 Leaderboards & Stats
- Global XP leaderboard
- Personal stats and progress tracking
- Rank checking and comparisons
- Transaction history viewing

### 🛠️ Admin Controls
- Manual XP adjustments (add/remove/set)
- Tezos holder verification
- Challenge response review and bonus awards
- Trait adoption management
- Comprehensive bot statistics
- Hot-reload cogs without restarting

## 📋 Requirements

- Python 3.8+
- Discord.py 2.3.2+
- FFmpeg (for music playback)
- A Discord bot token
- Server with appropriate permissions

## 🚀 Quick Start

### 1. Installation

```bash
# Clone or download this repository
cd "Discord Bots"

# Install dependencies
pip install -r requirements.txt

# Install FFmpeg for music playback
# macOS: brew install ffmpeg
# Windows: choco install ffmpeg
# Linux: sudo apt install ffmpeg
# See FFMPEG_INSTALL.md for details
```

### 2. Configuration

1. Copy the example environment file:
```bash
cp config.example.env .env
```

2. Edit `.env` with your settings:
   - Add your Discord bot token
   - Add your server (guild) ID
   - Configure role IDs for moderators and admins
   - Set up channel IDs for specific features
   - Adjust XP values to your liking

### 3. Create Your Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a New Application
3. Go to the "Bot" section
4. Click "Add Bot"
5. Enable these Intents:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
6. Copy the bot token to your `.env` file

### 4. Invite the Bot

Use this URL (replace CLIENT_ID with your bot's client ID):
```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=8&scope=bot
```

### 5. Run the Bot

```bash
python bot.py
```

---

## 📊 XP & Leveling System (Detailed)

### How XP Works

The XP system rewards users for participating in your Discord community through various activities:

#### **Message XP**
- **Amount**: 1 XP per message (configurable)
- **Cooldown**: 60 seconds between XP awards (prevents spam)
- **How it works**: Users earn XP for sending messages in any channel
- **Example**: User sends "Hello!" → Earns 1 XP (must wait 60s for next XP)

#### **Reaction XP**
- **Amount**: 2 XP per reaction (configurable)
- **Trigger**: Reacting to bot or agent messages
- **How it works**: Encourages engagement with bot-posted content
- **Example**: User reacts 👍 to challenge post → Earns 2 XP

#### **Voice Channel XP**

---

## Discord Bots/SETUP.md

# Setup Guide

Follow these steps to get your Discord XP Bot up and running.

## Step 1: Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Give it a name (e.g., "XP Master Bot")
4. Go to "Bot" tab in left sidebar
5. Click "Add Bot" → "Yes, do it!"
6. Under "Token", click "Reset Token" and copy it (save for later)

## Step 2: Enable Intents

Still on the Bot page:

1. Scroll down to "Privileged Gateway Intents"
2. Enable these three intents:
   - ✅ **Presence Intent**
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
3. Click "Save Changes"

## Step 3: Get Your Server ID

1. Open Discord
2. Go to User Settings → Advanced
3. Enable "Developer Mode"
4. Right-click your server icon → "Copy ID"
5. Save this ID for later

## Step 4: Create Roles (In Discord)

Create these roles in your Discord server:

1. **Admin** - For full bot control
2. **Moderator** - For reviewing challenges and verifying users
3. **Tezos Holder** - Auto-assigned to verified token holders
4. **Trait Master** - Auto-assigned after 3 adopted traits

To get role IDs:
- Right-click each role in Server Settings → Roles
- Click "Copy ID"
- Save these IDs

## Step 5: Create Channels (Optional)

You can configure dedicated channels for:

1. **#moderator-review** - Private channel for reviewing challenge responses
2. **#image-challenges** - Public channel for posting challenges
3. **#trait-ideas** - Public channel for trait submissions
4. **#leaderboard** - Public channel for stats (future use)

Get channel IDs:
- Right-click channel → "Copy ID"

## Step 6: Install Python Dependencies

```bash
cd "/Users/joshuafarnworth/Desktop/cursor projects/Sandbox/Discord Bots"
pip install -r requirements.txt
```

Or if you prefer:
```bash
pip install discord.py>=2.3.2 python-dotenv>=1.0.0 aiosqlite>=0.19.0
```

## Step 7: Configure Environment

1. Copy the example config:
```bash
cp config.example.env .env
```

2. Edit `.env` with your favorite text editor:

```env
# Required Settings
DISCORD_TOKEN=your_bot_token_here
GUILD_ID=your_server_id_here

# Required for full functionality
MODERATOR_ROLE_ID=your_moderator_role_id
ADMIN_ROLE_ID=your_admin_role_id

# Optional but recommended
TEZOS_HOLDER_ROLE_ID=your_tezos_role_id
TRAIT_MASTER_ROLE_ID=your_trait_master_role_id
MODERATOR_REVIEW_CHANNEL_ID=your_review_channel_id
IMAGE_CHALLENGE_CHANNEL_ID=your_challenge_channel_id
TRAIT_IDEAS_CHANNEL_ID=your_trait_channel_id

# XP Settings (adjust to your preference)
POINTS_PER_MESSAGE=1
POINTS_PER_REACTION=2
POINTS_PER_VOICE_MINUTE=5
MESSAGE_COOLDOWN_SECONDS=60

IMAGE_CHALLENGE_BASE_POINTS=10
IMAGE_CHALLENGE_BONUS_POINTS=50

TRAIT_SUGGESTION_POINTS=5
TRAIT_ADOPTED_POINTS=100

# Leveling (default is good for most)
XP_BASE=100
XP_MULTIPLIER=1.5
```

## Step 8: Invite Bot to Server

1. Go back to Discord Developer Portal
2. Click on your application
3. Go to "OAuth2" → "URL Generator"
4. Select scopes:
   - ✅ `bot`
5. Select permissions:
   - ✅ Read Messages/View Channels
   - ✅ Send Messages
   - ✅ Send Messages in Threads
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Add Reactions
   - ✅ Manage Roles (for assigning Tezos Holder/Trait Master)
   - ✅ Manage Messages (optional, for cleanup)

6. Copy the generated URL at bottom
7. Open in browser and select your server
8. Click "Authorize"

## Step 9: Set Bot Permissions in Discord

1. In your Discord server, go to Server Settings → Roles
2. Drag the bot's role ABOVE the roles it needs to manage:
   - Bot role should be above "Tezos Holder" and "Trait Master"
3. This is crucial for the bot to assign roles!

## Step 10: Run the Bot

```bash
python bot.py
```

You should see:
```
Connecting to database...
Database connected!
✓ Loaded cogs.core_agent
✓ Loaded cogs.image_challenge_agent
✓ Loaded cogs.trait_ideas_agent
✓ Loaded cogs.admin_commands
✓ Loaded cogs.leaderboard

==================================================
Bot is online!
Logged in as: YourBotName (ID: 123456789)
==================================================
```

## Step 11: Test Basic Commands

In your Discord server, try:

```
!help
!levels
!stats
```

If these work, congratulations! Your bot is running!

## Step 12: Test Admin Commands

Give yourself the Admin role in Discord, then try:

```
!addxp @yourself 100 Testing the bot
!stats
```

You should see your XP increase!

## Troubleshooting

### Bot doesn't respond
- Make sure bot is online (check Discord member list)
- Verify bot has "Read Messages" and "Send Messages" permissions
- Check console for errors
- Ensure Message Content Intent is enabled

### Can't use admin commands
- Verify you have the role with the ID you set as ADMIN_ROLE_ID
- Make sure role IDs are numbers, not names
- Check bot console for permission errors

### Bot crashes on startup

---

## Discord Bots/requirements.txt

discord.py>=2.3.2
python-dotenv>=1.0.0
aiosqlite>=0.19.0
PyNaCl>=1.5.0
yt-dlp>=2023.3.4


---

## Guidance/README.md

# Guidance

Guidance is a unified Tezos intelligence project that combines the strongest parts of:

- **Objkt-Advisor**: creator-level scoring and deeper market signal interpretation.
- **TezPulse**: fast, contract-centric activity scanning across major marketplaces.
- **web3 simulator / nft-pipeline**: local-first archival architecture with replayable analytics.

## What Guidance does

1. Archives Tezos marketplace activity into a local SQLite database.
2. Pulls Objkt sales plus marketplace lifecycle events via GraphQL for creator scoring and event-state analytics.
3. Tracks marketplace contracts with confidence-scored discovery (static list + creator/alias inference).
4. Derives deeper analytics:
   - CEX-funded buyer flow
   - creator fund-flow/cashout posture
   - primary vs resale metrics
   - estimated marketplace fees
5. Supports scheduled sync jobs and retention controls.
6. Imports existing historical data from other local Sandbox projects.
7. Serves a browser dashboard with tabbed views for Network Health, NFT Market, Objkt Focus, and Data Ops.

## Tech stack

- Node.js + TypeScript
- Express API + static dashboard
- SQLite (`better-sqlite3`)
- Chart.js (browser charts)

## Run

```bash
cd /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/Guidance
npm install
npm run dev
```

Open: [http://localhost:3210](http://localhost:3210)

## Scripts

- `npm run dev` - start API + dashboard in development
- `npm run check` - TypeScript check
- `npm run build` - compile to `dist/`
- `npm run start` - run compiled build

## API overview

- `POST /api/sync/tzkt` body `{ "hours": 24 }`
- `POST /api/sync/objkt/recent` body `{ "hours": 24, "limit": 1200 }`
- `POST /api/sync/objkt/comprehensive` body `{ "hours": 24, "limit": 1200 }`
- `POST /api/sync/teia/recent` body `{ "hours": 24, "limit": 2000 }`
- `POST /api/sync/objkt/state` body `{ "limit": 1200 }`
- `POST /api/sync/objkt/creator/:address` body `{ "limit": 800 }`
- `POST /api/sync/coingecko` body `{ "days": "max" }` (legacy endpoint; now runs historical + current price workers)
- `POST /api/sync/xtz/historical` body `{ "fromDay": "2017-07-01", "toDay": "2026-02-25" }` (both fields optional)
- `POST /api/sync/xtz/current`
- `POST /api/sync/all` body `{ "tzktHours": 24, "objktHours": 24 }`
- `GET /api/analytics/overview`
- `GET /api/analytics/daily?days=30`
- `GET /api/analytics/contracts`
- `GET /api/analytics/creators?limit=25`
- `GET /api/analytics/score-methodology`
- `GET /api/analytics/network-health?days=60`
- `GET /api/analytics/nft-market?days=60`
- `GET /api/analytics/objkt-only?days=60`
- `GET /api/analytics/market-angles?window=24h`
- `GET /api/analytics/market-angles?window=7d`
- `GET /api/analytics/market-angles?window=36mo`
- `GET /api/analytics/market-angles?window=all`
- `GET /api/analytics/market-angles?start=2025-01-01T00:00:00Z&end=2025-12-31T23:59:59Z`
  - Supports `24h`, `48h`, `72h`, `96h`, `7d`, `14d`, `30d`, `90d`, `6mo`, `12mo`, `36mo`, `all`, `alltime`, and custom `start`/`end`.
- `GET /api/analytics/data-ops`
- `GET /api/analytics/xtz-price?days=180`
- `GET /api/analytics/buyers/cex?limit=25`
- `GET /api/analytics/creators/fund-flow?limit=25`
- `GET /api/analytics/resales?days=30`
- `GET /api/analytics/fees?days=30`
- `GET /api/analytics/insights`
- `GET /api/analytics/fifo-trace?address=<tz>&amountXtz=100&maxHops=3&maxEdges=1200`
- `GET /api/import/inspect`
- `POST /api/import/existing` body `{ "objktSalesLimit": 250000, "web3TxLimit": 200000, "includeObjktCreatorProfiles": true }`
- `GET /api/research/objkt/recent-sales?limit=500`
- `GET /api/research/xtz/cex-receipts?limit=500`
- `GET /api/admin/scheduler`
- `POST /api/admin/scheduler/run-sync`
- `POST /api/admin/scheduler/run-retention`
- `POST /api/admin/retention/run` body `{ "keepDays": 180 }`
- `POST /api/admin/rebuild-creators`
- `GET /api/sync/runs?limit=20`

## Data location

Default database path:

`/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/Guidance/data/guidance.db`

You can override with env var:

`GUIDANCE_DB_PATH=/custom/path/guidance.db`

Core archival tables:

- `raw_tzkt_transactions`
- `raw_tzkt_transfers`
- `raw_objkt_sales`
- `market_events`
- `market_state_snapshots`
- `marketplace_wallet_activity`
- `marketplace_contracts`
- `creators`
- `daily_metrics`
- `buyer_cex_flow`
- `creator_fund_flow`
- `resale_daily_metrics`
- `marketplace_fee_daily`

Research exports are saved under:

`/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/Guidance/data/research`

## Environment variables (optional)

- `PORT` (default `3210`)
- `TZKT_BASE_URL` (default `https://api.tzkt.io/v1`)
- `OBJKT_GRAPHQL` (default `https://data.objkt.com/v3/graphql`)
- `TEIA_GRAPHQL` (default `https://teztok.teia.rocks/v1/graphql`)
- `COINGECKO_BASE_URL` (default `https://api.coingecko.com/api/v3`)
- `COINGECKO_API_KEY` (optional; improves rate limits)
- `COINGECKO_SYNC_DAYS` (default `365`)
- `CRYPTOCOMPARE_BASE_URL` (default `https://min-api.cryptocompare.com`)
- `XTZ_ICO_DAY` (default `2017-07-01`, historical sync anchor)
- `GUIDANCE_DB_PATH` (default `./data/guidance.db`)
- `GUIDANCE_SYNC_SCHEDULE_ENABLED` (`true|false`, default `false`)
- `GUIDANCE_SYNC_INTERVAL_MINUTES` (default `30`)
- `GUIDANCE_SCHEDULE_TZKT_HOURS` (default `2`)
- `GUIDANCE_SCHEDULE_OBJKT_HOURS` (default `2`)
- `GUIDANCE_RETENTION_SCHEDULE_ENABLED` (`true|false`, default `false`)
- `GUIDANCE_RETENTION_INTERVAL_HOURS` (default `24`)
- `GUIDANCE_RETENTION_KEEP_DAYS` (default `180`)

---

## Guidance/README_AI_AGENTS.md

# Guidance AI Agent README

This document is the fast-start context for AI agents working in the Guidance app folder.

## Project mission

Guidance is a production-style Tezos analytics app.

Core objective:
- Maintain a rich local historical dataset.
- Sync only recent deltas from APIs.
- Expose analytics from multiple angles (creator, collector, holder, market structure, flow).

## First files to read

Read these first, in order:
- `server/index.ts`: app boot, API routes, scheduler wiring.
- `server/db.ts`: full SQLite schema + migration/index logic.
- `server/config.ts`: env vars, marketplace config, known contracts/entrypoints.
- `server/services/analytics.ts`: derived metrics and windowed analytics logic.
- `server/services/tzkt.ts`: chain transaction ingestion.
- `server/services/objkt.ts`: Objkt + Teia market/event ingestion.
- `server/services/scheduler.ts`: periodic sync/retention behavior.
- `public/index.html` and `public/app.js`: UI tabs, controls, frontend data flow.

## Runtime model

- Stack: Node.js + TypeScript + Express + better-sqlite3.
- App entry: `server/index.ts`.
- DB path default: `data/guidance.db` (override via `GUIDANCE_DB_PATH`).
- Startup always does:
  - `initDb()`
  - `refreshDerivedMetrics()`
- Then it binds port (`PORT`, default `3210`) and serves API + static dashboard.

## Key data layers

Raw archival layer:
- `raw_tzkt_transactions`
- `raw_tzkt_transfers`
- `raw_objkt_sales`
- `market_events`
- `market_state_snapshots`

Derived analytics layer:
- `daily_metrics`
- `resale_daily_metrics`
- `marketplace_fee_daily`
- `buyer_cex_flow`
- `creator_fund_flow`
- `creators`

Ops/metadata layer:
- `sync_runs`
- `marketplace_contracts`
- `marketplace_wallet_activity`
- `address_labels`
- `data_chunks`
- `xtz_price_daily`

## API groups that matter most

Ingestion/sync:
- `POST /api/sync/tzkt`
- `POST /api/sync/objkt/comprehensive`
- `POST /api/sync/teia/recent`
- `POST /api/sync/objkt/state`
- `POST /api/sync/all`

Analytics:
- `GET /api/analytics/overview`
- `GET /api/analytics/market-angles` (supports fixed windows and custom start/end)
- `GET /api/analytics/wallet/:address`
- `GET /api/analytics/network-health`
- `GET /api/analytics/nft-market`
- `GET /api/analytics/objkt-only`

Admin/data ops:
- `GET /api/admin/scheduler`
- `POST /api/admin/scheduler/run-sync`
- `POST /api/admin/rebuild-creators`
- `POST /api/admin/chunks/rebuild`
- `POST /api/admin/labels/refresh`

## Scheduler behavior

Configured by env vars in `server/config.ts`:
- `GUIDANCE_SYNC_SCHEDULE_ENABLED`
- `GUIDANCE_SYNC_INTERVAL_MINUTES`
- `GUIDANCE_SCHEDULE_TZKT_HOURS`
- `GUIDANCE_SCHEDULE_OBJKT_HOURS`
- Retention equivalents (`GUIDANCE_RETENTION_*`)

Important:
- Scheduler jobs are guarded against overlap (`running` flag in `scheduler.ts`).
- Sync jobs write run metadata into `sync_runs`.

## Historical prefill context

Local archive salvage scripts live under `scripts/`:
- `prefill_from_archives.sql`
- `prefill_chunked.sh`
- `prefill_fast_missing.sql`
- `prefill_fast_nojoins.sql`
- `prefill_fast_nocreatorjoin.sql`

Use case:
- Backfill Guidance DB from historical local sources (Objkt-Advisor + web3 simulator pipeline).
- Goal is a full historical base before scheduler delta-sync.

## Commands

From this folder:
- `npm run dev` starts app (tsx, dev mode).
- `npm run check` runs TypeScript no-emit checks.
- `npm run build` compiles to `dist/`.
- `npm run start` runs compiled server.

## Operational priorities for agents

When changing code:
- Preserve data integrity first.
- Keep ingestion idempotent (`INSERT OR IGNORE`, deterministic IDs, safe upserts).
- Keep heavy analytics in backend SQL, not browser-side.
- Re-run `refreshDerivedMetrics()` after meaningful raw-data changes.
- Rebuild chunks when archive size/shape changes.

When debugging data gaps:
- Compare source DB counts vs Guidance target counts.
- Validate by `missing` joins on stable IDs.
- Check `sync_runs` for failing sources and details JSON.

When handling UX/admin controls:
- Treat Guidance as an end-user product.
- Internal salvage/backfill mechanics should not become mandatory end-user flows.

## Known performance hotspots

- Bulk inserts into indexed tables (`market_events`, `raw_objkt_sales`) can be expensive.
- Large startup `refreshDerivedMetrics()` can delay port bind.
- Joins with `lower(...)` on both sides can crush SQLite performance at scale.

## Minimal safe workflow for substantial data changes

1. Backup `data/guidance.db`.
2. Run migration/import in idempotent form.
3. Verify row parity/gap checks.
4. Run `refreshDerivedMetrics()`.
5. Run `rebuildDataChunks()`.
6. Refresh labels if address/name coverage changed.
7. Start server and verify `/api/admin/scheduler` + key analytics endpoints.


---

## Lil Guys/README.md

# Lil Guys Generator

A web-based character generator that creates unique "Lil Guys" by randomly combining layered traits from different categories.

## Features

### Current Functionality
- **Random Generation**: Generate 1 or 4 characters at once with randomized traits
- **Manual Selection**: Preview combinations by manually selecting traits from each category
- **Image Layering**: Properly layers traits in the correct order to create composite characters
- **Save Functionality**: Export generated characters as PNG images or JSON data
- **Responsive Design**: Clean, minimal interface that works on desktop and mobile
- **Offline Operation**: Runs entirely locally with no external dependencies

### Trait Categories
The generator includes 18 trait categories organized by layering order:
1. **Background** (Required)
2. **Skin** (Required) 
3. **Skin Variants** (Optional, Multiple allowed)
4. **Eyes** (Required)
5. **Noses** (Optional)
6. **Mouths** (Required)
7. **Legs Under Shoes** (Optional)
8. **Hair Layer 1** (Optional)
9. **Accessories** (Optional, Multiple allowed)
10. **Footwear** (Optional)
11. **Eye Accessories** (Optional)
12. **Tops** (Optional)
13. **Neck** (Optional)
14. **Legs Over Shoes** (Optional)
15. **Hair Layer 2** (Optional)
16. **Holding** (Optional)
17. **Speech Bubbles** (Optional)
18. **Coveralls** (Optional)

## Usage

1. **Open `index.html`** in any modern web browser
2. **Generate Characters**:
   - Click "Generate 1" for a single random character
   - Click "Generate 4" for a 2x2 grid of characters
3. **Manual Preview**:
   - Use the dropdown menus to select specific traits
   - Preview updates automatically as you make selections
4. **Save Characters**:
   - Click "Save Characters" to download PNG images
   - Falls back to JSON data if image export fails

## Technical Structure

### Current Implementation
- **HTML5 Canvas**: For image composition and export
- **Vanilla JavaScript**: No external dependencies
- **CSS Grid/Flexbox**: Responsive layout
- **File Structure**: Trait images organized in numbered folders

### Future Extensibility

The codebase is structured to support advanced features:

#### Weighting System
```javascript
// Each category has a weight (0.0 - 1.0) controlling appearance probability
{ weight: 0.7 } // 70% chance this category appears in random generation
```

#### Rules Engine (Planned)
```javascript
const generationRules = {
  conflictingTraits: [
    // Prevent certain trait combinations
    { category1: 'tops', trait1: 'shirt.png', category2: 'coveralls', trait2: 'overall.png' }
  ],
  dependentTraits: [
    // Require certain traits when others are present
    { ifCategory: 'footwear', ifTrait: 'boots.png', thenCategory: 'legsUnder', thenRequired: true }
  ],
  exclusiveGroups: [
    // Only allow one category from a group
    ['hairLayer1', 'hairLayer2']
  ]
};
```

#### Individual Trait Weights (Planned)
```javascript
const traitWeights = {
  'skin': { 
    'common-skin.png': 1.0,    // Normal probability
    'rare-skin.png': 0.1       // Rare trait (10% normal chance)
  }
};
```

## Adding New Traits

1. **Add image files** to the appropriate numbered folder
2. **Update the trait list** in the `loadTraitsFromFolder()` function
3. **Images should be 256x256 pixels** for best results
4. **Use PNG format** with transparency for proper layering

## File Organization

```
Lil Guys/
├── index.html              # Main application
├── README.md              # This file
├── 0- Background/         # Background images
├── 1- Skin/              # Base skin tones
├── 2- Skin Variants/     # Skin modifications
├── 3- Eyes/              # Eye styles
├── 4- Noses/             # Nose types
├── 5- Mouths/            # Mouth expressions
├── 6- Legs Under Shoes/  # Lower leg clothing
├── 7- Hair Layer 1/      # Primary hair
├── 8- Accesories/        # General accessories
├── 9- Footwear/          # Shoes and boots
├── 10- Eye Accessories/  # Glasses, etc.
├── 11- Tops/             # Shirts and upper clothing
├── 12- Neck/             # Necklaces, ties
├── 13- Legs Over Shoes/  # Pants, skirts
├── 14- Hair Layer 2/     # Secondary hair elements
├── 15- Holding/          # Items in hands
├── 16- Speech Bubbles/   # Dialog bubbles
├── 17- Coveralls/        # Full-body clothing
└── WIP/                  # Work in progress assets
```

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support  
- **Safari**: Full support
- **Mobile browsers**: Responsive design supported

## Future Enhancements

- [ ] Advanced rule system for trait conflicts and dependencies
- [ ] Rarity/weighting system for individual traits
- [ ] Animation support for dynamic traits
- [ ] Batch export functionality
- [ ] Custom trait upload interface
- [ ] Character variation system
- [ ] Template/preset saving

## License

This project is designed for the Lil Guys character generation system. All trait artwork and character designs remain property of their respective creators.

---

## Lil Guys/trait_combinations_analysis.md

# Lil Guys Trait Combinations Analysis

## Trait Count by Category

### Required Categories (Always Present):
- **Background**: 2 options
- **Skin**: 17 options  
- **Eyes**: 21 options
- **Mouths**: 20 options

### Optional Categories with Special Rules:
- **Noses**: 3 options (50% chance of none, 75%/25% split between first two when present)

### Optional Categories (Present based on weight):
- **Skin Variants**: 5 options (weight: 0.3, allowMultiple: true)
- **Legs Under Shoes**: 0 options (empty folder)
- **Hair Layer 1**: 26 options (weight: 0.8)
- **Accessories**: 16 options (weight: 0.4, allowMultiple: true)
- **Footwear**: 14 options (weight: 0.6)
- **Eye Accessories**: 18 options (weight: 0.3)
- **Neck**: 16 options (weight: 0.4)
- **Legs Over Shoes**: 11 options (weight: 0.5)
- **Tops**: 23 options (weight: 0.7)
- **Hair Layer 2**: 37 options (weight: 0.6)
- **Holding**: 4 options (weight: 0.3)
- **Speech Bubbles**: 4 options (weight: 0.2)
- **Coveralls**: 1 option (weight: 0.1)

## Minimum Characters Needed

### For Required Traits Only:
**Base combinations**: 2 × 17 × 21 × 20 = **14,280 combinations**

### For ALL Possible Trait Combinations:
This is much more complex due to:

1. **Optional traits** can be present/absent
2. **Nose special rules** (3 states: none, first nose, second nose)
3. **Multiple traits allowed** in some categories
4. **Probabilistic generation** based on weights

### Simplified Maximum Calculation:
If we consider ALL possible combinations (ignoring probabilities):

- Background: 2
- Skin: 17  
- Skin Variants: 6 (none + 5 individual traits, ignoring multiples for simplicity)
- Eyes: 21
- Noses: 3 (none + 2 actual noses)
- Mouths: 20
- Hair Layer 1: 27 (none + 26 traits)
- Accessories: 17 (none + 16 traits, ignoring multiples)
- Footwear: 15 (none + 14 traits)
- Eye Accessories: 19 (none + 18 traits)
- Neck: 17 (none + 16 traits)  
- Legs Over Shoes: 12 (none + 11 traits)
- Tops: 24 (none + 23 traits)
- Hair Layer 2: 38 (none + 37 traits)
- Holding: 5 (none + 4 traits)
- Speech Bubbles: 5 (none + 4 traits)
- Coveralls: 2 (none + 1 trait)

**Theoretical Maximum**: 2 × 17 × 6 × 21 × 3 × 20 × 27 × 17 × 15 × 19 × 17 × 12 × 24 × 38 × 5 × 5 × 2

This equals approximately **1.8 × 10^18 combinations** (1.8 quintillion!)

## Realistic Answer

### For showing ALL individual traits at least once:
You would need **~250 characters** to guarantee every single trait appears at least once, considering:
- Some traits are rare (low weight categories)
- Nose rules reduce certain trait appearances
- Random generation might miss some traits

### For seeing most trait combinations:
Given the astronomical number of possible combinations, it's practically impossible to show all combinations. Even generating **millions** of characters would only scratch the surface.

### Recommendation:
- **~100-500 characters** would give you a very good sampling of trait variety
- **~1,000-5,000 characters** would show most individual traits multiple times in different combinations
- **Complete coverage** is mathematically impractical due to the combinatorial explosion

The beauty of this system is that even with "only" thousands of generated characters, you'd still see incredible variety and rarely see exact duplicates!

---

## Objkt-Advisor/SCORING_METHODOLOGY.md

# NFT Creator Investment Scoring Model - 5-Point System

## Overview
A 100-point scoring system evaluating NFT creators for investment potential across 5 categories. Scores are capped at category maximums, with time decay applied to weight recent activity more heavily. "Recent" is defined as the last 6 months.

## Time Decay
- **Decay Factor**: 0.95 per month
- **Formula**: `value * (0.95 ^ months_ago)`
- Applied to weight recent data more heavily than historical data

## Price Validation
All sales prices are filtered to exclude unrealistic values:
- **Minimum**: 0.000001 XTZ
- **Maximum**: 1,000,000 XTZ
- Sales outside this range are excluded from all calculations

---

## 1. LIQUIDITY & MARKET ACTIVITY (20 points max)

### Purpose
Measures how active and liquid the creator's secondary market is.

### Parameters
- **Total Secondary Sales Count**: Number of valid secondary market sales
- **Secondary Volume (XTZ)**: Sum of all valid secondary sale prices
- **Months Active**: Time between first and last token mint (minimum 1 month)
- **Sales Per Month**: Total sales / months active

### Scoring Formula
```
salesScore = min(totalSales / 100, 1) * 0.4          // 40% weight, caps at 100 sales
volumeScore = min(secondaryVolumeXtz / 1000, 1) * 0.4  // 40% weight, caps at 1000 XTZ
frequencyScore = min(salesPerMonth / 10, 1) * 0.2     // 20% weight, caps at 10 sales/month

liquidityScore = (salesScore + volumeScore + frequencyScore) * 20
```

### Output Metrics
- `secondaryVolumeXtz`: Total volume in XTZ
- `salesPerMonth`: Average sales frequency

---

## 2. PRICE APPRECIATION & ROI (25 points max)

### Purpose
Evaluates how well tokens appreciate in value after initial mint.

### Parameters
- **Price Gain Per Sale**: `salePrice / primaryPrice` for each secondary sale
- **Average Gain**: Mean of all price gains
- **Median Gain**: Median of all price gains
- **Tokens Appreciated**: Percentage of tokens that have at least one sale above primary price

### Scoring Formula
```
avgGainScore = min(avgGain / 5, 1) * 0.32          // 32% weight, caps at 5x gain
medianGainScore = min(medianGain / 5, 1) * 0.28    // 28% weight, caps at 5x gain
appreciationScore = (tokensAppreciated / 100) * 0.4 // 40% weight, percentage of tokens

appreciationScore = (avgGainScore + medianGainScore + appreciationScore) * 25
```

### Output Metrics
- `avgGain`: Average price multiplier (e.g., 2.0 = tokens sell for 2x original price)
- `medianGain`: Median price multiplier
- `tokensAppreciated`: Percentage of tokens with gains

---

## 3. CONSISTENCY & LONGEVITY (20 points max)

### Purpose
Assesses creator's track record, productivity, and recent activity.

### Parameters
- **Years Active**: Time between first and last mint (minimum 0.1 years)
- **Tokens Per Year**: Total tokens / years active
- **Recent Mints Count**: Number of tokens minted in last 6 months

### Scoring Formula
```
yearsScore = min(yearsActive / 5, 1) * 0.25              // 25% weight, caps at 5 years
productivityScore = min(tokensPerYear / 50, 1) * 0.25     // 25% weight, caps at 50 tokens/year
recentActivityScore = min(recentMintsCount / 20, 1) * 0.5 // 50% weight, caps at 20 recent mints

consistencyScore = (yearsScore + productivityScore + recentActivityScore) * 20
```

### Output Metrics
- `yearsActive`: Years between first and last mint
- `tokensPerYear`: Average annual productivity
- `recentMintsCount`: Tokens minted in last 6 months

---

## 4. MARKET MOMENTUM (20 points max)

### Purpose
Measures recent market trends and velocity compared to previous period.

### Parameters
- **Recent Sales Count**: Sales in last 6 months
- **Previous Sales Count**: Sales in 6-12 months ago
- **Recent Sales Velocity**: `recentSalesCount / previousSalesCount` (or 2.0 if no previous sales but has recent)
- **Recent Average Price**: Mean price of recent sales
- **Previous Average Price**: Mean price of previous sales
- **Recent Gain Trend**: `recentAvgPrice / previousAvgPrice`
- **Floor Price Metrics**: Calculated from minimum prices per period
  - `recentFloor`: Minimum price in last 6 months
  - `previousFloor`: Minimum price in 6-12 months ago
  - `floorTrend`: `recentFloor / previousFloor`
  - `floorStability`: Standard deviation of monthly floor prices (last 6 months)

### Scoring Formula
```
velocityScore = min(recentSalesVelocity / 2, 1) * 0.35           // 35% weight, caps at 2x velocity
gainTrendScore = min(recentGainTrend / 1.5, 1) * 0.35            // 35% weight, caps at 1.5x trend
floorTrendScore = min(floorTrend / 1.5, 1) * 0.20                // 20% weight, caps at 1.5x
stabilityScore = max(0, 1 - (floorStability / 10)) * 0.10        // 10% weight, lower deviation = better

momentumScore = (velocityScore + gainTrendScore + floorTrendScore + stabilityScore) * 20
```

### Output Metrics
- `recentSalesVelocity`: Ratio of recent to previous sales frequency
- `recentGainTrend`: Ratio of recent to previous average prices
- `floorTrend`: Ratio of recent to previous floor prices
- `floorStability`: Standard deviation of monthly floors (lower = more stable)

---

## 5. EDITION STRATEGY & SCARCITY (15 points max)

### Purpose
Evaluates creator's edition sizing strategy and scarcity approach.

### Parameters
- **Average Edition Size**: Mean of all token supplies
- **Scarcity Ratio**: Percentage of tokens with supply ≤ 10
- **Price Strategy**: Consistency of primary prices (standard deviation relative to mean)
- **Edition Balance**: Penalty for extremes (ideal: 5-100 editions)

### Scoring Formula
```
// Price Strategy Score (0-1)
priceStdDev = standardDeviation(primaryPrices)
avgPrice = mean(primaryPrices)
priceStrategyScore = max(0, 1 - (priceStdDev / avgPrice))  // Lower deviation = better

// Edition Balance Score (0-1)
if avgEditionSize >= 5 && avgEditionSize <= 100:
  editionBalanceScore = 1.0
else if avgEditionSize < 5:
  editionBalanceScore = avgEditionSize / 5  // Too scarce
else:
  editionBalanceScore = max(0, 1 - (avgEditionSize - 100) / 500)  // Too common

// Final Scoring
scarcityScore = (scarcityRatio / 100) * 0.53        // 53% weight
priceScore = priceStrategyScore * 0.27              // 27% weight
balanceScore = editionBalanceScore * 0.20          // 20% weight

scarcityScore = (scarcityScore + priceScore + balanceScore) * 15
```

### Output Metrics
- `avgEditionSize`: Average supply across all tokens
- `scarcityRatio`: Percentage of tokens with ≤10 editions

---

## TOTAL SCORE CALCULATION

```
totalScore = liquidityScore + appreciationScore + consistencyScore + momentumScore + scarcityScore
totalScore = min(totalScore, 100)  // Capped at 100
```

## Additional Calculated Metrics

- `firstMintDate`: ISO string of earliest token mint
- `lastMintDate`: ISO string of most recent token mint
- `recentFloor`: Minimum sale price in last 6 months
- `previousFloor`: Minimum sale price in 6-12 months ago
- `monthlyFloors`: Array of 6 monthly floor prices (last 6 months)

---

## Data Requirements

### Input Data
- **Tokens**: Array of token objects with:
  - `id`, `supply`, `mintedAt`, `primaryPriceXtz`
- **Sales**: Array of sale objects with:
  - `tokenTableId`, `priceXtz`, `timestamp`

### Data Filtering
- All sales with prices outside 0.000001 - 1,000,000 XTZ are excluded

---

## Tezos-Intel/replit.md

# Objkt Advisor

## Overview
Objkt Advisor is a Tezos NFT market intelligence and wallet analytics platform. It provides a dashboard for tracking NFT collections, wallet holdings, transaction activity, and market trends from the Tezos blockchain ecosystem. The platform indexes data from Objkt.com and TzKT into a PostgreSQL database, then serves it through a REST API to a React frontend. Its primary purpose is to offer comprehensive insights into the Tezos NFT market and individual wallet performance.

## User Preferences
Preferred communication style: Simple, everyday language.
All data must be 100% chain or objkt API verified — no mock/placeholder data.
Rate limits must be respected when querying TzKT and Objkt APIs.

## System Architecture

### Frontend
- **Framework**: React with TypeScript and Vite.
- **Routing**: Wouter for client-side navigation across eight main pages (Dashboard, Holdings, Activity, Market Pulse, Marketplace Analytics, Historic Analytics, Wallet Analyzer, Sync Data).
- **UI Components**: shadcn/ui (new-york style) built on Radix UI and Tailwind CSS v4.
- **State Management**: TanStack React Query for server state management and data fetching via custom hooks.
- **Wallet State**: `WalletContext` for managing global wallet connection state.
- **API Client**: Typed API client (`lib/api.ts`) centralizing all frontend API calls.
- **Charts**: Recharts for data visualization.
- **Wallet Integration**: `@airgap/beacon-dapp` for Tezos wallet connection (read-only).
- **Styling**: Dark "Data Future" theme with Inter and JetBrains Mono fonts.
- **Data Flow**: All data is fetched via server-side `/api/*` endpoints through React Query hooks; no direct external API calls from the client.

### Backend
- **Framework**: Express.js with Node.js and TypeScript.
- **Architecture**: A single HTTP server serving both the API and the client.
- **API Design**: REST endpoints under `/api/` providing market data, wallet analytics, token details, and synchronization controls. Key endpoints include `/api/dashboard/*`, `/api/wallet/:address/*`, `/api/market/*`, and `/api/tokens/:contract/:tokenId`.
- **Background Workers**: Continuous priority-based orchestrator loop (`server/workers.ts`). P0: XTZ price → P1: Head scans (new sales/mints) → P2: Token metadata backfill (recent 7 days first) → P3: Collection sync + gap fill → P4: Sales/mints gap fills → P5: Token metadata (all-time) → P6: Historic backfill → P7: Address resolution + address tagging (known + auto-discovery via TzKT) → P8: Daily aggregation + indexing queue processing. Workers keep running until DB coverage is complete, then enter 60s maintenance pause. Stale thresholds control re-run frequency per worker. Rate limiting enforced between all external API calls.
- **Indexing Queue**: `indexing_queue` table enables network-expansion discovery — querying one wallet cascades to discover connected wallets via shared token holdings and sales history. Depth-limited to prevent infinite expansion (max depth 2).
- **Address Tagging**: `address_tags` table stores semantic labels (marketplace, cex, burn, dex, contract) for known addresses, seeded from a hardcoded list and auto-discovered via TzKT account metadata.
- **Build Process**: Custom build script using Vite for the client and esbuild for the server.

### Data Layer
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema**:
  - `collections`: NFT collection metadata.
  - `sales`: Individual NFT sale events.
  - `marketSnapshots`: Time-series aggregated market statistics.
  - `walletCache`: Cached wallet data.
  - `watchlistItems`: User-defined watchlist entries.
  - `tokens`: Token-level metadata including IPFS URIs and sale statistics.
  - `tokenHoldings`: Wallet-level token ownership and acquisition details.
  - `indexingQueue`: Queue for network-expansion discovery (wallet cascade indexing).
  - `addressTags`: Semantic labels for known addresses (marketplace, cex, burn, etc).
  - `users`: User accounts (reserved for future use).
- **Migrations**: Managed by `drizzle-kit`.
- **Storage Pattern**: `IStorage` interface with `DatabaseStorage` implementation using upsert operations.

### Key Design Decisions
- **Server-side data aggregation**: Centralizes all external API interactions to mitigate CORS issues and enable caching.
- **Background worker pattern**: Utilizes pre-fetching and persistent storage in PostgreSQL for improved response times and reduced load on external APIs. Workers use batch operations (e.g., batchUpsertTokenHoldings) for bulk data.
- **Non-blocking wallet sync**: POST /api/wallet/:address/sync returns immediately; sync runs in background. Frontend polls /api/wallet/:address/sync-status for progress.
- **Batch address resolution**: TzKT batch API (address.in) resolves up to 200 addresses per cycle in groups of 50, pulling from sales, mints, token_holdings, and tokens tables.
- **Indexer-style database**: Optimized for fast queries and time-series analytics.
- **Shared schema**: Ensures type safety across the full stack (server and client) using the `shared/` directory.
- **Wallet caching**: Server-side caching of wallet data to reduce TzKT API load and maintain data freshness.

## External Dependencies

### APIs
- **TzKT API**: Tezos blockchain indexer for wallet balances, token balances, and transaction history.
- **Objkt GraphQL API**: Objkt.com's data API for NFT collections, sales data, and marketplace statistics.
- **CoinGecko API**: Used for fetching XTZ/USD price data.

### Database
- **PostgreSQL**: The primary relational database for persistent data storage.

### Blockchain
- **Tezos via Beacon**: Client-side integration for connecting user wallets and accessing their on-chain data (read-only).

### Key npm Packages
- `drizzle-orm`, `drizzle-kit`: ORM and database migration tools.
- `express`: Backend web framework.
- `axios`: HTTP client for server-side API calls.
- `recharts`: Charting library.
- `wouter`: Frontend router.
- `@tanstack/react-query`: Data fetching and caching library for React.
- `date-fns`: Date utility library.
- `zod`, `drizzle-zod`: Schema validation.
- `@airgap/beacon-dapp`: Tezos wallet connection library.
---

## WTF/README.md

# WTF Gameshow Platform

A survival-based challenge game platform on Tezos, featuring WTF token integration, real-time messaging, marketplace with on-chain FA2 swaps, and a retro Windows 95 UI aesthetic.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript + React95 (Windows 95 UI)
- **Backend**: Express.js + Drizzle ORM + **PostgreSQL hosted on Supabase**
- **Auth**: Passport.js (local + Google OAuth)
- **Wallet**: octez.connect + Beacon SDK fallback + Taquito
- **Real-time**: WebSockets for live chat
- **Blockchain**: TzKT API + Teznames domain resolution
- **Deploy**: Netlify (serverless functions + static frontend)
- **Supabase CLI**: `supabase/` (local stack, migrations, GitHub integration path = **repository root** / `.`)

## WTF Token

- Contract: `KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD`
- Standard: FA2 | Symbol: WTF | Decimals: 8

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — see “Supabase & environment” below
npm run db:check  # validates DATABASE_URL + network reachability before app boot
npm run db:push   # applies Drizzle schema to Postgres
npm run dev
```

### Supabase and environment variables

Supabase uses **two different screens**:

| What you need | Where in the dashboard |
|---------------|-------------------------|
| **Publishable + secret API keys** | **Project Settings** (gear) → **Data API** (or **API**) |
| **`DATABASE_URL` (Postgres URI)** | **Connect** (top of the project home page) — not under the API screen |

The UI **does not** use the label `DATABASE_URL`. You copy a line that starts with `postgresql://` or `postgres://` from the **Connect** panel. The **API keys** page only shows REST/Auth keys, not Postgres URIs.

**Current Supabase layout (as of their docs):**

1. Open your **project** (not org-only or billing-only views).
2. Click **Connect** in the top bar (or open `https://supabase.com/dashboard/project/<YOUR_PROJECT_REF>?showConnect=true` and replace `<YOUR_PROJECT_REF>` with the subdomain from `https://<ref>.supabase.co`).
3. Pick **Direct**, **Session pooler**, or **Transaction pooler** and copy the string; use **Transaction** (port **6543**) for Netlify serverless when it fits your driver.
4. Replace `[YOUR-PASSWORD]` with your **database password**. If you never saved it: left sidebar **Database** → **Settings** (URL shape: `…/database/settings`) → **Reset database password**.

**If you still do not see Connect or any Postgres URI:** use `npm run db:print-url` (see below) with `SUPABASE_DB_PASSWORD` — the hosted URI follows a fixed pattern once you know the project ref from `SUPABASE_URL`.

**If the dashboard only shows API keys or won’t open Connect:** Supabase’s APIs and CLI **never** return your **database password** (you set it or reset it under **Database → Settings**). You can still assemble `DATABASE_URL` locally:

```bash
export SUPABASE_DB_PASSWORD='your-database-password'
# Optional: token from https://supabase.com/dashboard/account/tokens — fills region for the Transaction pooler URL.
# Or run `supabase login` first; the script may read the CLI token from ~/.supabase/access-token.
export SUPABASE_ACCESS_TOKEN='sbp_...'

npm run db:print-url
# For local terminal only (prints real password; never use in CI/build logs):
# npm run db:print-url -- --raw
```

The script reads `SUPABASE_URL` from `.env` to get the project ref, prints a **direct** URI (`db.<ref>.supabase.co:5432`) and, with a token or `SUPABASE_REGION`, a **pooler** URI (`…pooler.supabase.com:6543`). Output is redacted by default for log safety.

**API keys** are still required for `@supabase/supabase-js` and `VITE_*` vars. **Service role** = secret key—server and Netlify only, never in the browser.

Copy **the same** variable names and values into **Netlify → Site configuration → Environment variables** for production builds and functions.

### Supabase as PostgreSQL host (schema management)

Supabase **is** the Postgres server: you point `DATABASE_URL` at their cluster. This app does **not** run its own Postgres.

| Piece | Role |
|-------|------|
| **Supabase → Database** (sidebar) | SQL Editor, backups, extensions; **connection strings** are in **Connect** at project level, not only here |
| **`npm run db:push`** | Applies [`shared/schema.ts`](shared/schema.ts) to that database via **Drizzle Kit** (creates/updates tables) |
| **[`server/db.ts`](server/db.ts)** | Connection pool with TLS + limits suited to Supabase (pooler-friendly) |
| **[`drizzle.config.ts`](drizzle.config.ts)** | Same `DATABASE_URL` + SSL for CLI migrations |

**Recommended URIs**

- **Production (Netlify Functions):** **Transaction pooler**, port **6543** (PgBouncer).
- **One-off `db:push` / Drizzle Studio:** **Session mode** or **direct** `db.<project>.supabase.co:5432` if the pooler causes issues—see [Supabase connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres).

Optional: `DATABASE_POOL_MAX` (default `10` when using Supabase host) — lower to `1`–`3` on heavy serverless if you hit connection limits.

Quick diagnostic (recommended before debugging auth):

```bash
npm run db:check
```

`db:check` prints host family (IPv4/IPv6), attempts a real query, and reports actionable hints for common failures (timeout, wrong DB name, missing schema, wrong pooler credentials).

Link the Supabase CLI to the same project (optional, for `supabase db pull`, branches, etc.):

```bash
npm run supabase:link
# paste project ref when prompted (from your Supabase URL / dashboard)
```

### Supabase CLI (`supabase init` is already run)

The repo includes [`supabase/config.toml`](supabase/config.toml). For **Supabase → GitHub integration**, set the working directory to the folder that **contains** `supabase/` — i.e. **`.`** (this repo root), not `supabase` itself.

| Command | Purpose |
|--------|---------|
| `npm run supabase:start` | Local Supabase (Docker required) |
| `npm run supabase:stop` | Stop local stack |
| `npm run supabase:status` | Show local URLs and keys |
| `npm run supabase:link` | Link CLI to your hosted project |
| `npm run supabase:db:reset` | Reapply migrations + seed locally |

**Schema note:** The app’s tables are defined in Drizzle ([`shared/schema.ts`](shared/schema.ts)) and applied with `npm run db:push`. Use `supabase/migrations/` for Supabase-specific SQL (e.g. RLS policies, extensions) if you add them; avoid duplicating the whole Drizzle schema in two places unless you intentionally migrate to SQL-first workflows.

### Supabase JS (`@supabase/supabase-js`)

This is a **Vite + Express** app, not Next.js. Supabase’s template may show `NEXT_PUBLIC_SUPABASE_*` and `utils/supabase/server.ts` — here:

| Dashboard / Next.js | This project |
|---------------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` (same value) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` |
| Server Components + cookies | Express: [`server/supabase.ts`](server/supabase.ts) (`getSupabaseServiceClient` / `getSupabaseAnonClient`) |
| Browser | [`client/src/lib/supabase/browser.ts`](client/src/lib/supabase/browser.ts) (`getSupabaseBrowserClient`) |

Set **`VITE_*`** in Netlify for production builds (Vite inlines them at build time). Keep **`SUPABASE_SERVICE_ROLE_KEY`** server-only (never `VITE_`).

## User Roles

| Role | Description |
|------|-------------|
| **Host** | Full admin control over the gameshow |
| **Cohost** | Admin-level access for managing rounds and challenges |
| **Contestant** | Active participant in rounds and challenges |
| **Witness** | Read-only observer access |

## Features

- **Dashboard**: WTF balance, active season, quick actions
- **Seasons & Rounds**: Browse seasons, view round details and challenges
- **Challenges**: Submit responses, receive grades, earn WTF rewards
- **Message Board**: Hybrid async/sync chat with channels and threads
- **Marketplace**: List tokens for auction or buy-now, pay with WTF
- **Leaderboard**: WTF holder rankings with .tez domain resolution
- **Gallery**: Survival tokens and exclusive gameshow art
- **Side Quests**: Bonus challenges for extra WTF earnings
- **Admin Panel**: Manage users, seasons, rounds, challenges, channels

## Smart Contracts

The marketplace contract is in `contracts/WTFMarketplace.py` (SmartPy).
The barter board contract is in `contracts/WTFBarterBoard.py` (SmartPy).
Compile with SmartPy CLI before deploying to Tezos.

### Marketplace contract flow

- Listing and buy settlement are on-chain using FA2 transfers.
- Buyers pay in WTF FA2.
- No listing fee is charged by the marketplace contract.
- Royalty split is supported via per-listing `royalty_recipient` + `royalty_bps`.
- Contract can hold XTZ (`default`) and admin can withdraw XTZ (`admin_withdraw_xtz`).

Important Tezos rule: operation fees are paid by the operation source account; contract balance cannot directly pay user transaction fees. If you want fully sponsored UX, use a relayer/paymaster architecture that submits signed user intents.

### Deploy + configure

0. Run local contract QA first:
   - `npm run contract:test`
1. Compile contract with SmartPy:
   - `pip install smartpy-tezos`
   - `SMARTPY_OUTPUT_DIR=build/contracts SMARTPY_SCENARIO_NAME=. python3 contracts/WTFMarketplace.py`
   - `SMARTPY_OUTPUT_DIR=build/contracts SMARTPY_SCENARIO_NAME=. python3 contracts/WTFBarterBoard.py`
   - Optional wrapper command: `smartpy compile contracts/WTFMarketplace.py build/contracts`
   - Optional wrapper command: `smartpy compile contracts/WTFBarterBoard.py build/contracts`
2. Originate on mainnet with:
   - `admin`
   - `wtf_token_address`
   - `wtf_token_id`
3. Set frontend env:
   - `VITE_MARKETPLACE_CONTRACT_ADDRESS=KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj`
   - `VITE_BARTER_CONTRACT_ADDRESS=<your-barter-contract-address>`
   - (optional server override) `BARTER_CONTRACT_ADDRESS=<your-barter-contract-address>`
4. Restart frontend after env changes.

## Deployment

Configured for Netlify deployment:

```bash
npm run build:netlify
```

**API routing:** Requests to `/api/*` are proxied so that, after `serverless-http` strips `/.netlify/functions/api`, the path Express sees is `/api/...` (matching `server/auth/routes.ts`, etc.). If auth or other API calls 404 in production, confirm `netlify.toml` still has `to = "/.netlify/functions/api/api/:splat"` for the `/api/*` rule.

**Bootstrap admin (host) user** — from a machine that can reach Postgres (use the **transaction pooler** `DATABASE_URL` if direct times out):

```bash

---

## WTF/security_best_practices_report.md

# WTFMarketplace Contract Security Audit

## Executive Summary

The marketplace contract has one blocking correctness issue (the source file is not valid Python/SmartPy syntax as written), one high-impact economic correctness risk (token unit handling appears inconsistent with `WTF` decimals), and several medium/low hardening gaps. The contract's core transfer flow is straightforward, but deployment reliability and payment semantics need tightening before production use.

Scope reviewed:
- `contracts/WTFMarketplace.py`
- pricing/unit usage context in `shared/types.ts` and `client/src/pages/Marketplace.tsx`

## Critical Findings

### C-001: Contract source is syntactically invalid as written (compile/deploy blocker)
- Severity: Critical
- File: `contracts/WTFMarketplace.py:230`
- Evidence: The file ends with:
  - `@sp.add_compilation_target(...)` (lines 230-239)
  - no following function/class definition for decorator attachment
- Impact: The contract source does not parse as Python, so standard SmartPy/Python execution paths fail before compilation. This blocks reproducible builds and increases risk that deployed bytecode does not match repository source.
- Recommendation:
  - Replace decorator form with direct call:
    - `sp.add_compilation_target("WTFMarketplace", WTFMarketplace(...))`
  - Add CI check that compiles contract artifacts from source.

## High Findings

### H-001: WTF amount unit mismatch risk (decimals vs raw nat) can misprice sales
- Severity: High
- Files:
  - `contracts/WTFMarketplace.py:157-158` (price/royalty math on raw `nat`)
  - `shared/types.ts:5` (`decimals: 8`)
  - `client/src/pages/Marketplace.tsx:199-201` (`parseInt` for `priceWtf`)
  - `client/src/pages/Marketplace.tsx:443` (displayed directly as `X WTF`)
- Impact: If `WTF` truly uses 8 decimals, then entering/displaying "25 WTF" but transferring `25` raw units yields `0.00000025 WTF` on-chain. This can undercharge sales by up to 1e8.
- Recommendation:
  - Normalize all on-chain marketplace amounts to raw base units.
  - Convert user-facing decimal amounts with a `toRawWtf()`-style helper before calling contract methods.
  - Use formatted display (`formatWtf`) for values read from chain/storage.

## Medium Findings

### M-001: Royalty config allows `royalty_bps > 0` with no recipient, reducing seller payout unintentionally
- Severity: Medium
- File: `contracts/WTFMarketplace.py:122`, `contracts/WTFMarketplace.py:160-167`
- Impact: When `royalty_recipient=None` and `royalty_bps>0`, buyer transfers only `price - royalty` to seller and no royalty transfer occurs. Seller receives less than expected; buyers pay less than listed price.
- Recommendation:
  - Enforce invariant at listing creation:
    - `royalty_bps == 0` OR `royalty_recipient.is_some()`
  - Alternatively force `royalty_bps=0` whenever recipient is `None`.

### M-002: Non-payable entrypoints do not reject attached XTZ
- Severity: Medium
- Files: `contracts/WTFMarketplace.py:103`, `149`, `181`, `203`, `209`, `215`, `221`
- Impact: Users/integrators can accidentally send XTZ to functional entrypoints (`create_listing`, `buy`, etc.). XTZ remains in contract until admin withdrawal, which is a recoverability and trust issue.
- Recommendation:
  - Add `sp.verify(sp.amount == sp.mutez(0), "NO_XTZ_ALLOWED")` to non-`default` entrypoints.
  - Keep treasury behavior explicit via `default`.

## Low Findings

### L-001: Missing contract-level test coverage for critical invariants
- Severity: Low
- File: `contracts/WTFMarketplace.py` (entire contract; no associated tests found in repo)
- Impact: Regressions in payout split, cancellation auth, and unit semantics may go undetected.
- Recommendation:
  - Add SmartPy tests for:
    - listing creation escrow success/failure
    - buy payout split correctness (with/without royalties)
    - cancel auth (`seller` vs `admin`)
    - rejection of accidental XTZ on non-payable entrypoints
    - decimal/raw unit conversion expectations

## Notes / Assumptions

- The high-severity unit mismatch finding assumes `WTF` decimals are intended to be `8` per `shared/types.ts`.
- This audit focuses on contract/source-level security and economic correctness, not formal verification.

---

## album packager/progress.md

Original prompt: I have a new projet for the sandbox directory... make a new sub directory for it... call it album packager.

Album packager is a piece of software with a gui that guides the user through the creation of an album package. The package will contain the cover image, the rear cover image, song book pages with lyrics for songs (if any, allow user to upload .txt lyric files for each page of the book. The package should also contain images of the vinyl record and cd cover art. The package is output as an html that shows the cover image as the splash page, then when clicked, it turns like a page and the vinyl album side A is displayed with the first track loaded in audio player and the song book page for the track displayed opposite the record. when the track is played, the record spins and audio playback begins. skipping the track loads the next song on side A and changes the songbook page. A button near the record player allows you to flip the album to b-side whenever you like, otherwise it cycles through the same songs assigned to side A. An alternate tab shows CD player control for playback, with all songs on one playlist and the cd image spinning inside of a cd player design you create. it is important that this entrie package is one html under 250 mb that does not call external references, everything must operate entirely within the directory containing the index.html that will be displayed. that directory will then be compressed and minted as a token on tezos blockchain. it must be entirely local.

also create a base image of a vinyl record using code to create elaborate and highly detailed svg drawing that scales easily and can be spun without causing distortion. Allow user to select exact color of vinyl to be used, or multicolor effects, even semi translucent material. allow them to upload the label design for the sticker that is applied to the center area of the record.

Initial notes:
- New project directory created at `album packager/`.
- Builder is being implemented as a local static app with:
  - guided GUI for art uploads, tracks, side assignment, lyric text pages, and vinyl appearance
  - live iframe preview rendered from the same standalone HTML used for export
  - single-file export with embedded assets and package size estimation against the 250 MB cap
  - code-generated vinyl SVG and CD disc visuals

Update 2026-03-23:
- Built the first complete local builder in:
  - `index.html`
  - `styles.css`
  - `app.js`
- Implemented the package builder GUI:
  - album metadata and output file naming
  - uploads for cover image, rear cover image, CD art, and vinyl label art
  - vinyl material controls for primary color, secondary color, opacity, and multicolor effects
  - dynamic track list with side A / side B assignment
  - per-track audio upload
  - per-track `.txt` lyric upload plus editable lyric text area
- Added demo content generation so the app can be tested without user uploads:
  - generated poster-style cover/rear/CD art
  - generated vinyl label art
  - generated short WAV tracks
  - demo lyrics
- Implemented single-file export:
  - exports one standalone HTML
  - all assets are embedded inline as data
  - export size is estimated from the actual generated HTML
  - export is blocked if the HTML exceeds 250 MB
- Implemented the exported package runtime:
  - cover splash page opens like a jacket
  - vinyl deck view with record art, play/pause, prev/next, side flip, progress bar, and lyrics page
  - CD deck view with spinning disc, playlist, and transport controls
  - rear cover view with art and side A / side B listings
- Vinyl art is generated in code as detailed SVG:
  - scalable vector record
  - grooves, highlights, arc details, label area
  - solid / swirl / split / nebula effects
  - opacity control for semi-translucent pressings
  - uploaded label art is applied to the center sticker area

Validation 2026-03-23:
- `node --check app.js` passed.
- Builder browser pass:
  - `output/manual/initial-pass/builder.png`
  - `output/manual/initial-pass/builder-state.json`
- Exported-package browser pass:
  - `output/manual/exported-pass/splash.png`
  - `output/manual/exported-pass/vinyl-open.png`
  - `output/manual/exported-pass/vinyl-playing.png`
  - `output/manual/exported-pass/vinyl-side-b.png`
  - `output/manual/exported-pass/cd-view.png`
  - `output/manual/exported-pass/cd-next.png`
  - `output/manual/exported-pass/rear-view.png`
  - `output/manual/exported-pass/runtime-state.json`
- Verified GUI download flow:
  - `output/manual/download-pass/download.json`
  - exported file downloaded as `sleeve-theory-package.html`
  - demo export size was `1,090,049` bytes
- Ran the required web-game client regression:
  - `output/web-game/builder-pass/`

Open follow-ups:
- The builder preview iframe still composes lower in the automated screenshot than it does in the standalone export; the export itself is the source of truth and is visually verified, but the builder-side preview framing could still be polished.
- A future pass could add optional booklet background art, drag-and-drop track reordering, and richer vinyl label side-specific variations.

Compile workflow update 2026-03-23:
- Shifted the export model from browser download to a real local compile flow:
  - added `server.js` as the local builder + compile service
  - added `package.json` with `npm start`
  - builder now detects compile-service availability through `/api/status`
  - compile button now posts the generated standalone HTML + manifest data to `/api/compile`
  - successful compile writes a mintable directory under `compiled/<slug>/`
  - each compiled package currently contains:
    - `index.html`
    - `package-manifest.json`
- The builder now behaves the way the user requested:
  - it asks for art/audio/lyric inputs
  - compiles those inputs into a local output directory on disk
  - keeps the minted package self-contained with embedded assets inside one standalone `index.html`

Validation 2026-03-23 compile pass:
- Started the local compile service at `http://127.0.0.1:8013`.
- Loaded the demo dataset through the GUI and confirmed the builder state reflected:
  - `Sleeve Theory`
  - `Signal Bureau`
  - `4` tracks
  - side A / side B split and attached art/audio/lyrics
- Clicked `Compile Output Folder` and confirmed the package directory was written to:
  - `compiled/sleeve-theory-package/`
- Verified compiled artifacts on disk:
  - `compiled/sleeve-theory-package/index.html`
  - `compiled/sleeve-theory-package/package-manifest.json`
  - compiled HTML size is now `1,090,575` bytes after favicon embedding
- Added embedded favicon support to the builder and generated package HTML, plus a `204` favicon response in the local server, so the earlier browser 404 noise is gone from the compile flow.
- Browser validation after the favicon pass:
  - builder loaded with `0` console errors
  - compiled package loaded with `0` console errors
  - compiled package splash and opened vinyl view were captured successfully

Artifacts 2026-03-23 compile pass:
- `output/playwright/compile-pass/builder-demo.png`
- `output/playwright/compile-pass/builder-state-before-compile.json`
- `output/playwright/compile-pass/builder-after-compile.png`
- `output/playwright/compile-pass/compiled-splash.png`
- `output/playwright/compile-pass/compiled-open.png`
- `output/web-game/compile-pass/shot-0.png`
- `output/web-game/compile-pass/state-0.json`

Open follow-ups after compile pass:
- The builder preview iframe still frames low in some automated captures even though the compiled package itself is rendering correctly.
- A next pass could add a packaged download helper that zips `compiled/<slug>/` for minting convenience, without changing the self-contained output format.

Vinyl art refresh 2026-03-24:
- Rebuilt the generated vinyl SVG to look like an actual record instead of a stylized poster element:
  - dense concentric groove rings across the playable surface
  - dedicated dead-wax rings near the label
  - stronger outer rim / edge shadow structure
  - subtler specular highlights so the disc reads as glossy vinyl
  - label area still cleanly clips uploaded label art into the center sticker zone
- Kept the vinyl material options, but made the color effects more restrained so they tint the pressing without hiding the grooves.
- Changed the demo package default from `swirl` to `solid` so the first thing the user sees is a realistic black pressing with visible grooves.

Validation 2026-03-24 vinyl refresh:
- `node --check app.js` passed after the SVG rewrite.
- Recompiled the demo package and confirmed the artifact regenerated:
  - `compiled/sleeve-theory-package/index.html`
  - `compiled/sleeve-theory-package/package-manifest.json`
  - compiled HTML size is now `1,097,017` bytes
- Browser validation after recompiling:
  - compiled package loaded with `0` console errors
  - opened vinyl deck shows the refreshed record art with visible concentric groove structure

Artifacts 2026-03-24 vinyl refresh:
- `output/playwright/vinyl-refresh/builder-demo-refresh.png`
- `output/playwright/vinyl-refresh/compiled-splash-grooves.png`
- `output/playwright/vinyl-refresh/compiled-open-grooves.png`
- `output/web-game/vinyl-refresh/shot-0.png`
- `output/web-game/vinyl-refresh/state-0.json`

Visual overhaul 2026-03-24:
- Reworked the playback visuals based on user feedback:
  - removed the faux tonearm / platter look from the vinyl deck
  - vinyl now sits as the hero object in a simpler floating stage
  - added hover shadow plus subtle playback wobble so the record feels suspended and slightly imperfect while spinning
  - rebuilt the CD base art to a more neutral metallic disc
  - added a WebGL shader layer for the CD surface so playback visuals come from a real shader instead of fake SVG glare
- The CD shader is intentionally restrained rather than neon-heavy, but it now sits above the disc surface and is rendered in WebGL during playback.

Validation 2026-03-24 visual overhaul:
- `node --check app.js` passed after the layout + shader changes.
- Recompiled the demo package and confirmed the updated standalone artifact:
  - `compiled/sleeve-theory-package/index.html`
  - `compiled/sleeve-theory-package/package-manifest.json`
  - compiled HTML size is now `1,104,900` bytes
- Browser validation against the compiled artifact:
  - vinyl deck loads with the simplified floating record presentation
  - CD deck loads with the shader canvas sized and layered above the CD image
  - compiled package loaded with `0` console errors during the final pass

Artifacts 2026-03-24 visual overhaul:
- `output/playwright/visual-overhaul/builder-demo.png`
- `output/playwright/visual-overhaul/compiled-splash.png`
- `output/playwright/visual-overhaul/vinyl-open.png`
- `output/playwright/visual-overhaul/cd-idle.png`
- `output/playwright/visual-overhaul-2/cd-playing-overlay.png`
- `output/web-game/visual-overhaul/state-0.json`

---

## bootloader-project/README.md

# 🚀 Bootloader Generative Art Template

A comprehensive boilerplate for creating generative art on the [Bootloader platform](https://bootloader.art/).

## 📁 Project Structure

```
bootloader-project/
├── generator.js         # Main art generation logic (upload this to Bootloader)
├── preview.html         # Local testing environment
├── examples/           # Example variations and techniques
│   ├── minimal.js      # Minimal example
│   ├── geometric.js    # Geometric patterns
│   └── organic.js      # Flowing organic shapes
└── README.md           # This file
```

## 🎨 Quick Start

### 1. Local Development
```bash
# Navigate to project directory
cd bootloader-project

# Start local server (recommended)
python -m http.server 8000
# Or use any other local server

# Open preview
open http://localhost:8000/preview.html
```

### 2. Development Workflow
1. Edit `generator.js` with your generative algorithm
2. Refresh `preview.html` to see changes
3. Test with different seeds and iterations
4. Use preview mode to design cover images
5. Deploy to Bootloader when ready

### 3. Deploy to Bootloader
1. Copy contents of `generator.js`
2. Paste into Bootloader's code editor
3. Test with live preview on Bootloader
4. Set pricing and edition parameters
5. Publish your generative art!

## 🔧 Key Features

### ✅ Complete BTLDR Environment Simulation
- Identical random number generation (sfc32 + splitmix64)
- Proper seed handling and deterministic output
- Preview mode for marketplace covers
- Iteration-based evolution support

### ✅ Comprehensive Boilerplate
- **Utility Functions**: Random helpers, SVG creation, color palettes
- **Pattern Examples**: Circles, grids, organic flows
- **Best Practices**: Preview handling, edition evolution, optimization
- **Error Handling**: Graceful fallbacks and debugging

### ✅ Development Tools
- **Interactive Preview**: Real-time testing with seed/iteration controls
- **Visual Debugging**: Error display and console logging
- **Export Functionality**: Download generated SVGs
- **Keyboard Shortcuts**: Space to regenerate, Cmd+R for random seed

## 📖 Understanding Bootloader

### The BTLDR Object
Your generator receives a `BTLDR` object with these properties:

```javascript
BTLDR = {
  rnd: function(),           // Deterministic random (0-1) - USE THIS ALWAYS
  seed: 123456789n,          // BigInt seed from blockchain
  iterationNumber: 42,       // Sequential mint number (1, 2, 3...)
  isPreview: false,          // true for marketplace covers
  svg: SVGElement,           // Root SVG element to modify
  v: 'svg-js:0.0.1'         // Bootloader version
}
```

### Critical Requirements

🔴 **NEVER use Math.random()** - Always use `BTLDR.rnd()`
🔴 **Handle previews** - Check `BTLDR.isPreview` for cover images
🔴 **Optimize size** - Storage costs 250 mutez/byte on-chain
🔴 **Ensure determinism** - Same seed must produce identical output

## 🎯 Customization Guide

### 1. Replace Example Patterns
The template includes three example patterns. Replace with your own:

```javascript
// Replace this section with your algorithm
if (random.chance(0.4)) {
  // Your pattern 1
} else if (random.chance(0.3)) {
  // Your pattern 2  
} else {
  // Your pattern 3
}
```

### 2. Customize Configuration
Edit the `CONFIG` object for your needs:

```javascript
const CONFIG = {
  width: 1000,              // Canvas width
  height: 1000,             // Canvas height
  palettes: [...],          // Color schemes
  elementsCount: 50,        // Number of elements
  // Add your own parameters
};
```

### 3. Add Edition Evolution
Use `BTLDR.iterationNumber` for variations:

```javascript
const iterationFactor = BTLDR.iterationNumber / 1000;

if (BTLDR.iterationNumber > 500) {
  // Special elements for later editions
}
```

### 4. Design Preview Covers
Customize the preview section for marketplace display:

```javascript
if (BTLDR.isPreview) {
  // Create compelling cover image
  // Keep it simple but representative
  return; // Exit early
}
```

## 💡 Pro Tips

### Performance
- Avoid infinite loops or heavy computations
- Use efficient SVG elements (prefer `<path>` for complex shapes)
- Consider mobile performance for marketplace viewing

### Aesthetics
- Design for square (1:1) aspect ratio initially
- Test at different sizes (thumbnail to full screen)
- Ensure sufficient contrast for visibility

### Economics
- Keep code under 2KB for reasonable storage costs (≈0.5 tez)
- Consider gas costs for complex calculations
- Price considering storage fees + platform fees

### Testing
- Test with extreme seeds (0, very large numbers)
- Verify deterministic output across multiple runs
- Check preview covers look good at small sizes

## 🔗 Resources

- [Bootloader Platform](https://bootloader.art/)
- [Bootloader Help Documentation](https://bootloader.art/help)
- [Contract Storage Explorer](https://better-call.dev/mainnet/KT1CB4MYiAViCuXWBU961x7LjQXGeA8SnQwt/storage)
- [SVG Reference](https://developer.mozilla.org/en-US/docs/Web/SVG)

## 📄 License

This template is provided as-is for educational and creative purposes. Use freely for your generative art projects.

---

**Happy generating! 🎨**

---

## color wars/AUDIT_REPORT.md

# Full Codebase Audit Report

## Executive Summary

The codebase is well-structured and follows the plan specifications. However, several critical and medium-priority issues were identified and fixed. The audit covered:

- Type safety and imports
- Logic errors
- Error handling
- Path handling
- Database configuration
- Image processing correctness

## Issues Found and Fixed

### ✅ CRITICAL - Fixed

#### 1. Image Resize Function (lib/image/resize.ts)
**Issue**: The `resizeImage` function was creating a new `Image()` and setting `src` synchronously, which doesn't work with the canvas library. The Image constructor requires async loading.

**Fix**: Changed to async function using `loadImage()` to properly load the resized image from buffer.

**Impact**: High - This would cause image processing to fail silently or throw errors.

#### 2. RGB to HSV Hue Calculation (lib/image/color.ts)
**Issue**: The hue calculation used `clamp01(h / 360) * 360` which is redundant and could cause precision issues. The hue was already normalized to 0-360 range.

**Fix**: Changed to proper modulo operation to ensure hue stays in 0-360 range: `h = h % 360; if (h < 0) h += 360;`

**Impact**: Medium - Could cause incorrect color classification at edge cases.

#### 3. Database Path Configuration (lib/db/index.ts)
**Issue**: Database path was hardcoded as `"./data/app.db"` which is relative and might fail depending on execution context.

**Fix**: Use `process.cwd()` to create absolute path, and respect `DATABASE_URL` environment variable.

**Impact**: High - Database connection would fail in production or when running from different directories.

#### 4. Seeded RNG Division (lib/battle/simulate.ts)
**Issue**: Division by `0xffffffff` could cause precision issues. Should divide by `0xffffffff + 1` for proper 0-1 range.

**Fix**: Changed to `(maxUint32 + 1)` for correct normalization.

**Impact**: Low - Minor precision improvement in battle RNG.

## Issues Identified (Not Critical)

### ⚠️ MEDIUM PRIORITY

#### 1. File Path Handling
**Location**: Multiple API routes
**Issue**: Some paths use string concatenation (`process.cwd() + "/public"`) instead of `path.join()`, which could fail on Windows.

**Recommendation**: Use `path.join()` consistently throughout for cross-platform compatibility.

**Status**: Partially fixed - most paths use `join()`, but some string replacements still use concatenation.

#### 2. Error Handling in Image Processing
**Location**: `lib/image/loadImage.ts`, `lib/image/resize.ts`
**Issue**: No explicit error handling for image loading failures.

**Recommendation**: Add try-catch blocks and meaningful error messages.

**Status**: Acceptable for MVP - errors will bubble up to API routes which have error handling.

#### 3. Missing Input Validation
**Location**: API routes
**Issue**: Some API routes don't validate all inputs (e.g., file size limits, image dimensions).

**Recommendation**: Add validation for:
- Maximum file size (e.g., 10MB)
- Maximum image dimensions
- File type validation beyond MIME type

**Status**: Basic validation exists via Zod schemas, but file-specific validation could be enhanced.

### ℹ️ LOW PRIORITY

#### 1. Battle Simulation Edge Cases
**Location**: `lib/battle/simulate.ts`
**Issue**: 
- No handling for empty armies (0 units)
- No handling for armies with < 32 units (would create empty ranks)

**Recommendation**: Add validation to ensure armies have minimum units before battle.

**Status**: Acceptable - edge case that's unlikely in practice.

#### 2. Database Transaction Safety
**Location**: API routes creating multiple records
**Issue**: Army creation involves multiple database inserts without transactions. If one fails, partial data could be created.

**Recommendation**: Wrap multi-step database operations in transactions.

**Status**: Acceptable for MVP - can be enhanced later.

#### 3. Session Expiration Cleanup
**Location**: `lib/auth/session.ts`
**Issue**: Expired sessions are not automatically cleaned up from database.

**Recommendation**: Add periodic cleanup job or cleanup on session validation.

**Status**: Acceptable - expired sessions are ignored, but table will grow over time.

## Code Quality Assessment

### ✅ Strengths

1. **Type Safety**: Excellent TypeScript usage with proper types throughout
2. **Modularity**: Clean separation of concerns (auth, image processing, battle engine)
3. **Error Handling**: API routes have consistent error handling patterns
4. **Versioning**: Proper versioning system for conversions and balance
5. **Determinism**: Hash-based determinism properly implemented
6. **Documentation**: Comprehensive README

### 📝 Areas for Improvement

1. **Testing Coverage**: Only basic unit tests exist. Could add:
   - Integration tests for API routes
   - E2E tests for critical flows
   - Image processing edge case tests

2. **Performance**: 
   - Image processing could be optimized for large images
   - Database queries could be optimized with proper indexes
   - Consider caching for frequently accessed data

3. **Security**:
   - Add rate limiting for API routes
   - Add CSRF protection
   - Validate file uploads more strictly
   - Sanitize user inputs in descriptions

4. **User Experience**:
   - Add loading states for long operations
   - Add progress indicators for image conversion
   - Better error messages for users

## Testing Status

### ✅ Unit Tests
- `classify.test.ts` - Color classification
- `unitize2x2.test.ts` - Unitization logic
- `convertToArmy.test.ts` - Determinism verification
- `clamp.test.ts` - Utility functions

### ❌ Missing Tests
- API route integration tests
- Battle simulation tests
- Auth flow tests
- Image processing edge cases

## Dependencies Audit

### ✅ All Dependencies Are Local
- No CDN usage confirmed
- All packages in `package.json`
- Next.js handles bundling

### ⚠️ Potential Issues
- `canvas` package requires native dependencies (may need system libraries)
- `better-sqlite3` requires native compilation

## Security Audit

### ✅ Good Practices
- Passwords hashed with bcrypt
- Sessions use secure cookies in production
- SQL injection prevented by Drizzle ORM
- Input validation with Zod

### ⚠️ Recommendations
- Add rate limiting
- Add file upload size limits
- Add CSRF tokens
- Sanitize HTML in user descriptions (if allowing HTML later)

## Performance Considerations

### Current Performance
- Image processing: Synchronous, could block event loop for large images
- Database: SQLite is fine for MVP, but consider Postgres for scale
- Battle simulation: Efficient rank-based system

### Optimization Opportunities
1. **Image Processing**: 
   - Use worker threads for large images
   - Stream processing for very large files
   - Cache processed images

2. **Database**:
   - Add indexes on frequently queried columns
   - Consider connection pooling for Postgres

3. **API Routes**:
   - Add response caching where appropriate
   - Implement pagination for army lists

## Conclusion


---

## color wars/DEBUG_AUDIT.md

# Full Debug Audit Report

## Executive Summary

**Critical Issues Found: 3**
- **Issue A**: Processed image not saved (saves original instead of resized)
- **Issue B**: Resized image buffer not exposed from conversion pipeline
- **Issue C**: Path format inconsistencies

**Status**: Files are being created, but processed.png contains original image (21MB JPEG) instead of resized PNG.

---

## Issue A: Processed Image Not Saved Correctly

### Location
- **File**: `app/api/armies/route.ts`
- **Line**: 163
- **Current Code**:
```typescript
await fs.writeFile(processedPath, imageBuffer); // ❌ Saves original, not resized
```

### Evidence
```bash
# File sizes confirm issue:
original.png:  21MB (JPEG format)
processed.png: 21MB (JPEG format)  # Should be ~1MB resized PNG
preview.png:   352B (PNG format)   # ✅ Correct
```

### Root Cause
1. `convertImageToArmy()` resizes the image internally (lines 40-49)
2. But the resized `Image` object is never converted back to a `Buffer`
3. Route handler saves `imageBuffer` (original) instead of resized version

### Impact
- Battle animations use wrong image (original 21MB instead of resized)
- Formation view shows wrong image dimensions
- Performance issues with large images

---

## Issue B: Resized Image Buffer Not Exposed

### Location
- **File**: `lib/image/convertToArmy.ts`
- **Lines**: 40-49 (resize happens), 79-86 (return statement)

### Current Flow
```typescript
let image = await loadImageFromBuffer(imageBuffer);  // Load original
image = await resizeImage(image, 2048);              // Resize stage 1
image = await resizeImage(image, preUnitizeMaxDim); // Resize stage 2
const imageData = imageToImageData(image);           // Convert to ImageData
// ... rest of processing ...
return {
  unitGrid,
  stats,
  preview,      // ✅ Buffer returned
  unitMap,      // ✅ Object returned
  imageHash,    // ✅ String returned
  settings,     // ✅ Object returned
  // ❌ Missing: processedImage buffer
};
```

### Missing Function
Need a utility to convert `Image` → `Buffer`:
```typescript
// lib/image/imageToBuffer.ts (doesn't exist)
export function imageToBuffer(image: Image): Buffer {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return canvas.toBuffer("image/png");
}
```

---

## Issue C: Path Format & API Response

### Current Path Format
- **File**: `app/api/armies/route.ts`
- **Lines**: 203, 213, 223, 233
- **Pattern**: `path.replace(process.cwd() + "/public", "")`

### Example Paths in DB
```
/uploads/3af2d50d4887a9ce6be6fe194b646b48/army_1769236086515/original.png
/uploads/3af2d50d4887a9ce6be6fe194b646b48/army_1769236086515/processed.png
```

### API Response Check
- **File**: `app/api/armies/[armyId]/route.ts`
- **Lines**: 54-64
- **Status**: ✅ Returns paths correctly
  - `previewPath`
  - `processedImagePath`
  - `originalImagePath`
  - `unitMapPath`

### Potential Issue
Paths start with `/uploads/...` which should work with Next.js static serving, but need to verify:
- Next.js serves `/public` as root
- Path `/uploads/...` should resolve to `/public/uploads/...`

---

## Issue D: Rank Preview Generation

### Status: ✅ WORKING
- **File**: `lib/image/preview.ts`
- **Function**: `generatePreview()` - generates rank-collapse preview
- **Called**: Line 71 in `convertToArmy.ts`
- **Saved**: Line 164 in `app/api/armies/route.ts`
- **Size**: 352B (correct for 256x256 preview)

### Preview Algorithm
- Groups units into ranks (32 units per rank by default)
- Sorts by class and power
- Draws as grid with class colors
- ✅ This is correct implementation

---

## Issue E: Unit Map Generation

### Status: ✅ WORKING
- **File**: `lib/image/unitmap.ts`
- **Function**: `encodeUnitMap()` - creates packed base64 format
- **Called**: Line 74 in `convertToArmy.ts`
- **Saved**: Line 165 in `app/api/armies/route.ts`
- **Format**: JSON with base64-encoded Uint8Arrays

### Unit Map Structure
```typescript
{
  unitW: number,
  unitH: number,
  format: "unitmap_v1",
  versions: { conv, mods },
  classIdsB64: string,
  hpB64: string,
  atkB64: string,
  defB64: string,
  spdB64: string,
  maskB64: string
}
```
✅ Correct format

---

## Issue F: Canvas Components (Client-Side)

### Status: ✅ IMPLEMENTED
- **File**: `components/ArmyFormationCanvas.tsx`
  - Draws units at original XY positions
  - Uses `processedImagePath` as background
  - ✅ Implementation correct

- **File**: `components/ArmyRankCanvas.tsx`
  - Sorts units by class and power
  - Draws in grid layout
  - ✅ Implementation correct

### Potential Issue
- Components expect `processedImagePath` to exist
- If path is null/undefined, image won't load
- Need to handle missing assets gracefully

---

## Issue G: Battle Animation Image Loading

### Status: ⚠️ POTENTIAL ISSUE
- **File**: `app/battle/animated/page.tsx`
- **Lines**: 150-184 (image loading)

### Current Implementation
```typescript
if (attackerArmy?.processedImagePath) {
  const img = new Image();
  img.src = attackerArmy.processedImagePath; // Path from API
}
```

### Potential Issues
1. Path format: API returns `/uploads/...` but browser needs full URL or relative path
2. CORS: `crossOrigin = "anonymous"` set but may not be needed for local files
3. Image loading async: No error handling if image fails to load

---

## Summary of Required Fixes

### Priority 1: Fix Processed Image Saving


---

## color wars/README.md

# Color Wars

Convert images into armies via deterministic pixel processing, store them in a database, and battle them against each other.

## Overview

Color Wars is a Next.js application that transforms images into armies through a deterministic conversion pipeline. Each pixel (or 2x2 block) becomes a unit with stats derived from color properties, and these armies can battle each other in a rank-based combat system.

## Features

- **Image to Army Conversion**: Upload images and convert them into armies with units, stats, and classes
- **Deterministic Processing**: Same image + same settings = same army (guaranteed via SHA256 hashing)
- **Battle System**: Rank-based combat simulation between armies
- **User Accounts**: Sign up, login, and manage your armies
- **Stock Armies**: Pre-generated armies for testing and battles
- **Versioning**: All conversion and balance settings are versioned for traceability

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite (dev) / Postgres-ready (prod) with Drizzle ORM
- **Authentication**: Custom session-based auth with bcrypt
- **Image Processing**: Canvas API (node-canvas)
- **Validation**: Zod
- **Testing**: Vitest

## Project Structure

```
/
  app/                    # Next.js App Router pages
    (auth)/              # Auth pages (login, signup)
    dashboard/           # User dashboard
    convert/             # Image conversion page
    battle/              # Battle simulation page
    api/                 # API routes
  components/            # React components
  lib/
    auth/                # Authentication utilities
    db/                  # Database schema and client
    image/               # Image processing pipeline
    battle/              # Battle engine
    validation/          # Zod schemas
    utils/               # Utility functions
  public/
    stock/               # Stock army images
    uploads/              # User-uploaded images
  scripts/               # Seed scripts
  data/                  # SQLite database (gitignored)
```

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository** (or navigate to the project directory)

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `DATABASE_URL=./data/app.db` (or your Postgres URL for production)
   - `SESSION_SECRET` (generate a random string)
   - `NODE_ENV=development`

4. **Create database directory**:
   ```bash
   mkdir -p data
   ```

5. **Generate and run database migrations**:
   ```bash
   npm run db:generate
   npm run db:push
   ```

6. **Start the development server**:
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## Usage

### Creating an Account

1. Navigate to `/signup`
2. Enter your email, password (min 8 characters), and optional display name
3. You'll be automatically logged in and redirected to the dashboard

### Converting an Image to an Army

1. Navigate to `/convert`
2. Upload an image (PNG, JPG, JPEG, or WebP)
3. Enter a name and optional description
4. Click "Convert to Army"
5. The image will be processed:
   - Resized to max 2048px, then to max 1024px (pre-unitize)
   - Converted to 2x2 pixel blocks (units)
   - Each unit classified by color (HOLY, UNHOLY, GREY, or color classes)
   - Stats computed from HSV values and class modifiers applied
   - Preview image generated showing rank formation

### Viewing Your Armies

1. Navigate to `/dashboard`
2. See all your armies in a grid
3. Click any army to view detailed stats and preview

### Battling Armies

1. Navigate to `/battle`
2. Select an attacker army and defender army
3. Click "Start Battle"
4. Watch the battle log as ranks fight
5. See the winner and remaining ranks

### Seeding Stock Armies

**Option 1: Via API (dev only)**
```bash
curl -X POST http://localhost:3000/api/stock/seed
```

**Option 2: Via script**
1. Place stock images in `public/stock/` (001.png, 002.png, etc.)
2. Run:
   ```bash
   npm run seed:stock
   ```

Stock armies are available for battles but have no owner.

## How Determinism is Guaranteed

The conversion process is fully deterministic:

1. **Image Normalization**: Images are resized to fixed maximum dimensions (2048px, then 1024px)
2. **Fixed Processing**: 2x2 block averaging uses a fixed weighting rule (255-weight = 2, else 1)
3. **Versioned Settings**: All conversion settings (versions, dimensions, rules) are stored and included in hash
4. **Hash Computation**: SHA256 hash includes:
   - Processed image pixel data
   - Conversion version
   - Modifiers version
   - All settings (maxImageDim, unitGridMaxDim, blockSize, weightRule)
5. **Pure Functions**: All conversion functions are pure (no side effects, no randomness)
6. **Database Storage**: Hash is stored in `army_conversion.image_sha256` for verification

**Result**: Same image bytes + same settings version = same army (same units, same stats, same hash)

## Tuning Balance & Versions

### Conversion Versions

Edit `lib/image/versions.ts`:
- `CONVERSION_VERSION`: Version string for conversion algorithm
- `MODIFIERS_VERSION`: Version string for class modifiers
- `CLASS_MODIFIERS`: Modifier tables for each class (HP, ATK, DEF, SPD multipliers)
- `HUE_BANDS`: Hue ranges for color classification

### Battle Balance

Edit `lib/battle/balance.ts`:
- `BATTLE_VERSION`: Version string for battle algorithm
- `BALANCE_VERSION`: Version string for balance tuning
- `INITIATIVE_RNG_RANGE`: RNG range for initiative variation

### Image Processing Settings

Edit `lib/image/convertToArmy.ts`:
- `DEFAULT_SETTINGS.maxImageDim`: Maximum image dimension (default: 2048)
- `DEFAULT_SETTINGS.unitGridMaxDim`: Maximum unit grid dimension (default: 512)
- `DEFAULT_SETTINGS.blockSize`: Block size for unitization (default: 2)

## Development Workflow

### Running Tests

```bash
npm test              # Run tests once
npm run test:watch    # Run tests in watch mode
```

### Database Management

```bash
npm run db:generate   # Generate migrations from schema changes

---

## color wars/progress.md

Original prompt: There are 2 directories within sandbox are that attempts at the same project.   The goal of the project was to allow users to upload images which would be interpreted as armies of pixels, whose battle formation is the composition of the uploaded image.  Users battle image armies by placing them side by side and using their battle positions as the starting point for a simulation which plays out by allowing each pixel to move and act autonomously according to the behavior of its class.  each color family had special attributes and each pixel unit in an army had stats based on the RGBA data of the pixel,  white and black and grey pixels were to have special classes and abilities.  each class had its own movement type.  For example, red units move 1.25x faster than base speed, have 1.5x attack dmg, but only .75x defense.  a pixel unit is a red unit if the R value in its RGB data is greater than the G or B value.   A unit's health is the value of it primary color family.   a unit can have two color families, but must have a primary for determining hit points.  for example, a yellow unit would have red and green values and low blue values, likely to have about equal red and green values.

Notes:
- Chosen base project: `color wars`.
- Reason: it has the stronger deterministic image classification pipeline, unit-map model, and battle-oriented structure.
- Lessons borrowed from `Image-Battle-Arena`: immediate upload-to-play loop, simpler browser-side image processing flow, and more direct canvas feedback.
- Rebuild direction: create a self-contained client-side war room on the home page that does not require auth or the database to enjoy the core game loop.

Original TODOs completed:
- Browser-side image-to-army conversion path that preserves image formation.
- Richer autonomous class behaviors, dual-family stats, and visible death/removal animation.
- Wagering modes with token bankroll tracking.
- `window.render_game_to_text` and `window.advanceTime(ms)` for deterministic browser validation.

Updates:
- Implemented `lib/war-room/armyBuilder.ts` for browser-side image conversion with:
  - special classes for white, black, and grey
  - hue-derived combat classes
  - primary and optional secondary family traits
  - stats derived from RGBA and class modifiers
  - procedural preset armies for instant play
- Implemented `lib/war-room/battleEngine.ts` for animated autonomous combat:
  - class-based movement styles
  - ranged/melee behavior, blink/dash logic, heals, burn, slow, splash, chain hits, lifesteal, armor aura
  - canvas rendering for current placements, health bars, hit trails, and death particles
  - deterministic stepping via `window.advanceTime(ms)`
- Replaced the home page with a standalone war room:
  - two image docks
  - preset loading
  - token bankroll and wager controls
  - single-bet duel and best-of-three modes
  - battle feed, result summary, and reset controls
- Simplified `components/Nav.tsx` into a standalone local-mode nav so the new home page no longer depends on live auth state.
- Updated `app/globals.css` for the new visual direction.
- Reworked image conversion to preserve exact source pixels:
  - upload processing is now true `1 pixel -> 1 unit`
  - built-in presets now render at `1 cell -> 1 pixel` too, so presets no longer inflate into four units per intended cell
  - class detection now uses RGB relationships/signatures for better color-family accuracy while keeping the original pixel appearance untouched
- Reworked battle flow so armies do not get pinned to mirrored halves:
  - the smaller uploaded image is upscaled to the larger army's max axis before battle formation is built
  - armies spawn with wider opening lanes and can cross the entire field without a center divider
  - units now use stronger flank anchors, lane bias, crowd separation, and class-specific kiting/charge behavior so fronts wrap and curl instead of only trading in straight lines
- Tightened combat math and class identity:
  - defense remains percentage reduction only and can no longer fully negate damage
  - white units prioritize healing wounded allies
  - blue units alternate between attacks and ally buffs
  - red units hunt the strongest visible enemies
  - green units pick off weaker visible targets from longer range
  - the other classes retain distinct blink/dash/splash/chain/lifesteal/slow/aura roles
- Added large-upload battle throttling to avoid browser lockups:
  - battle state now chooses a performance profile based on total unit count
  - huge uploads switch to reduced or massive battle mode with staggered unit updates, lighter targeting scans, smaller trail/particle budgets, and simplified rendering
  - large battles now announce their active performance mode in the battle banner so the behavior is visible instead of feeling like a silent freeze
  - normalized army scaling was also rewritten to replicate visible units directly instead of scanning every pixel in the destination grid

Validation:
- `npx tsc --noEmit --pretty false 2>&1 | rg 'app/page|lib/war-room'`
  - no errors reported from the new war-room files
- `npx vitest run`
  - existing repo failures remain outside the new work:
    - `ImageData is not defined` in `lib/image/unitize2x2.test.ts`
    - `canvas.node` binary mismatch in `lib/image/convertToArmy.test.ts`
- Browser verification:
  - used the develop-web-game Playwright client to capture idle setup screenshots and state JSON
  - used Playwright scripts to verify:
    - default preset battle starts and resolves to a result view
    - uploaded SVG images convert into new armies
    - uploaded armies visibly lose units during battle
    - `window.render_game_to_text` reflects live counts and wager state
  - latest checks after the exact-pixel/swarm rework:
    - preset battle at tick `218` showed live attrition on both sides: `184 / 232` vs `144 / 159`
    - battle canvas artifact saved to `output/manual/rework-battle-canvas.png`
    - mismatched upload normalization check saved to `output/manual/upload-normalize-check.json`
      - small upload started at `20` units in setup and entered battle as `125` units after upscale/normalization
      - larger upload stayed at `104` units
  - huge upload stress check:
    - `160x160` solid-vs-solid uploads (`51,200` total units) entered battle successfully in massive mode
    - artifact saved to `output/manual/huge-upload-battle.png`
    - metrics saved to `output/manual/huge-upload-check.json`
      - upload conversion: about `8.8s`
      - battle start click to active state: about `0.66s`
      - advancing `100ms` of simulation in automation: about `3.46s`
    - no browser console errors were reported in that stress run

Known leftovers:
- Legacy API/auth routes still rely on native DB modules in this workspace and are not part of the rebuilt standalone war room.
- Upload-driven battles still cost more than preset battles when images are extremely dense; the tab no longer hard-locks in the tested huge-upload case, but there is still room for deeper optimization if users regularly upload very large full-frame images.

---

## dweet-bootloader/README.md

# Dweet-like Bootloader Generator

A minimal animated generator for bootloader.art inspired by dwitter.net

## Features

- **Ultra-minimal size**: Only 1.9KB total
- **Real-time animation**: Uses `requestAnimationFrame` for smooth 60fps animation
- **Deterministic randomness**: Reproducible with BTLDR.seed
- **Multiple patterns**: 4 different animation patterns per seed
- **Dweet-style math**: Uses classic `S`, `C`, `T` shorthand (sin, cos, tan)
- **Dynamic colors**: HSL color cycling based on time and seed

## Core Dweet Elements Replicated

### Math Shortcuts
```javascript
const S=Math.sin,C=Math.cos,T=Math.tan;  // Classic dweet shorthand
```

### Deterministic Random
```javascript
// Mulberry32-style PRNG for reproducible randomness
let s=Number(BTLDR.seed&0xffffffffn)>>>0;
function R(){...} // Deterministic random 0-1
```

### Animation Loop
```javascript
function anim(){
  const t=Date.now()/1000;  // Time in seconds (dweet standard)
  // Clear and redraw
  BTLDR.svg.innerHTML='<rect width="1920" height="1080" fill="#000"/>';
  // Animation logic...
  requestAnimationFrame(anim);
}
```

### Compact Patterns
4 different animation patterns selected by seed:
- **Pattern 0**: Orbital motion with sine/cosine modulation
- **Pattern 1**: Spiral growth pattern
- **Pattern 2**: Complex oscillating orbits
- **Pattern 3**: Chaotic particle field

## Usage

1. Copy `generator.js` code to bootloader.art
2. Each mint creates a unique animated pattern
3. Preview shows static rainbow circle
4. Live versions animate infinitely

## Size Optimization

- No external dependencies
- Minimal variable names
- Compressed logic
- Direct SVG manipulation
- Only essential animation features

Perfect for on-chain storage while delivering rich, dweet-like animations!

---

## fafo tax/README.md

# FAFO Tax - Crypto Tax Liability Tracker

A comprehensive application for tracking wallet activity and calculating tax liability for cryptocurrency transactions.

## Features

- **Wallet Activity Tracking**: Monitor all transactions for any blockchain wallet address
- **Real-time USD Conversion**: Fetch historical USD prices at the time of each transaction
- **Tax Event Classification**: Automatically categorize transactions as taxable events
- **Tax Liability Calculation**: Calculate total tax owed based on transaction history
- **Comprehensive Reporting**: Generate detailed tax reports and summaries

## Architecture

### Backend (`/backend`)
- **API**: RESTful endpoints for wallet tracking and tax calculations
- **Models**: Database schemas for transactions, tax events, and price data
- **Services**: Business logic for blockchain data fetching and tax calculations
- **Utils**: Helper functions and utilities
- **Config**: Application configuration and environment settings

### Frontend (`/frontend`)
- **React-based UI**: Modern web interface for wallet input and report viewing
- **Components**: Reusable UI components
- **Pages**: Main application pages (dashboard, reports, settings)
- **Services**: API integration and data fetching
- **Types**: TypeScript type definitions

### Database (`/database`)
- **Migrations**: Database schema changes and versioning
- **Seeds**: Sample data for development and testing

## Installation

1. Install dependencies:
   ```bash
   # Backend dependencies
   cd backend && pip install -r requirements.txt
   
   # Frontend dependencies
   cd ../frontend && npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. Initialize database:
   ```bash
   cd backend && python manage.py migrate
   ```

4. Start the application:
   ```bash
   # Start backend
   cd backend && python manage.py runserver
   
   # Start frontend (in another terminal)
   cd frontend && npm start
   ```

## Usage

1. Enter a wallet address in the web interface
2. The application will fetch all transaction history
3. Review categorized tax events and their USD values
4. Generate comprehensive tax liability reports

## Supported Blockchains

- Ethereum
- Bitcoin
- Tezos
- Polygon
- Binance Smart Chain
- (Extensible to other chains)

## Tax Event Types

- **Trading**: Buy/sell transactions with capital gains/losses
- **DeFi Activities**: Yield farming, liquidity provision, staking rewards
- **NFT Transactions**: Minting, buying, selling NFTs
- **Airdrops**: Free token distributions
- **Mining/Staking**: Block rewards and staking rewards

## Legal Disclaimer

This tool is for informational purposes only and should not be considered professional tax advice. Always consult with a qualified tax professional for your specific situation.

---

## fafo tax/SETUP_COMPLETE.md

# 🎉 FAFO Tax Setup Complete!

## ✅ What's Working

Your crypto tax tracking application is now set up and ready to run **without Docker**!

### Backend ✅
- **FastAPI** server running on Python 3.13
- **SQLite** database for local development
- **Basic API endpoints** available
- **Health checks** working

### Frontend ✅
- **React** application with TypeScript
- **Modern UI** with styled-components
- **Responsive design** with sidebar navigation
- **Professional theme** and components

## 🚀 Quick Start

### 1. Start the Application
```bash
./start.sh
```

### 2. Access the App
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## 📁 Project Structure

```
fafo tax/
├── backend/              # FastAPI Python backend
│   ├── venv/            # Python virtual environment
│   ├── main_simple.py   # Simplified server (current)
│   ├── main.py          # Full server (needs blockchain libs)
│   ├── config/          # Settings and database config
│   ├── models/          # Database models
│   ├── services/        # Business logic
│   └── api/             # API endpoints
├── frontend/            # React TypeScript frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API integration
│   │   └── styles/      # Theme and styling
│   └── public/          # Static assets
├── scripts/             # Setup and utility scripts
└── start.sh            # Quick start script
```

## 📝 Current Status

### ✅ What's Ready
- Modern React frontend with professional UI
- FastAPI backend with SQLite database
- Development environment setup
- Basic API structure
- Documentation and scripts

### 🚧 Coming Soon
- Full blockchain integration (Ethereum, Bitcoin, Tezos, etc.)
- Wallet transaction fetching
- Tax calculation engine
- Price data integration
- Comprehensive reporting

## 🔧 Development

### Adding Blockchain Features
To enable full functionality, install additional dependencies:

```bash
cd backend
source venv/bin/activate
pip install web3 eth-account pycoingecko pandas numpy
```

Then switch to the full server:
```bash
python main.py  # instead of main_simple.py
```

### Database
- Uses SQLite by default (`fafo_tax.db`)
- Can switch to PostgreSQL by updating `.env`
- Models ready for wallet and transaction data

### API Testing
Test the API endpoints:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/status
```

## 🎯 Next Steps

1. **Add API Keys**: Edit `.env` to add your blockchain API keys
2. **Test Frontend**: Navigate through the UI pages
3. **Blockchain Integration**: Add full blockchain dependencies when ready
4. **Wallet Tracking**: Implement wallet address tracking
5. **Tax Calculations**: Build out the tax calculation engine

## 🆘 Troubleshooting

### If the backend won't start:
```bash
cd backend
source venv/bin/activate
python main_simple.py
```

### If the frontend won't start:
```bash
cd frontend
npm install
npm start
```

### If you see import errors:
The simplified version avoids problematic dependencies. For full features, you'll need to install the blockchain libraries.

---

**🎉 Congratulations!** You now have a professional crypto tax tracking application foundation running locally without Docker. The app is ready for further development and can be extended with full blockchain integration when needed.


---

## ledger-village/README.md

# Ledger Village

Ledger Village is a cozy Tezos village builder where wallet activity becomes civic weather. XTZ balance shapes the treasury, delegation can unlock a bakery district, and NFT holdings open museums and galleries with provenance.

## Local Run

1. `npm install`
2. `npm run dev`
3. Open the Vite app in the browser and use the sample village or paste a Tezos address.

## Scripts

- `npm run dev` starts the client and the lightweight server together.
- `npm run build` builds both sides.
- `npm run test` runs the derivation tests.
- `npm run lint` checks the codebase.

## Design Notes

- Public address lookup is read-only for MVP.
- The sample village is deterministic so the first play experience is always cozy.
- Permanent village edits should stay separate from live chain snapshots.

---

## ledger-village/progress.md

Original prompt: Build a game that uses actual tezos activity to control in game variables. For example, the game could be a village builder simulator, and the amount of xtz in the wallet could be representative of the village budget. delegating to a baker could create a bakery in your village, buying an nft could open a museum or art gallery that you can visit to see your owned tokenized art.

## Current Direction

- Build Ledger Village as a cozy, read-only Tezos village builder.
- Keep chain snapshot data separate from local layout storage.
- Make the app feel like a game first, not a dashboard.
- Expose `window.render_game_to_text()` and `window.advanceTime(ms)` for automated validation.

## Notes For The Next Pass

- Use a modular `src/` structure so canvas rendering, local persistence, derived state, and UI panels stay separated.
- Keep fallback/demo mode available when the server or wallet fetch is unavailable.
- Preserve a baseline village for empty or dormant wallets.
- The client should not assume private-key signing or wallet connection.

## Completed

- Replaced the Vite starter with a warm village-builder shell.
- Added guest/public-wallet onboarding and read-only copy.
- Added a canvas-based village scene with clickable placement.
- Added local layout persistence separate from the fetched wallet snapshot.
- Added civic quests, a building palette, and museum/gallery browsing.
- Exposed `window.render_game_to_text()` and `window.advanceTime(ms)` for deterministic testing.
- Verified in-browser:
  - guest/sample load works,
  - public wallet input falls back cleanly,
  - building placement and clearing work,
  - `advanceTime(ms)` updates the text-state hook,
  - no console/page errors in the tested scenarios.

---

## local-video-review-lab/README.md

# Local Video Review Lab

Local Video Review Lab is a macOS-first local runtime for reviewing video files with local models and cutting exportable clips.

It is built around tools that already work well on this Mac:

- `ffmpeg` and `ffprobe` for scene detection, frame extraction, preview generation, and final clip export
- `mlx-vlm` for per-segment visual review
- `mlx-lm` for transcript-aware segment scoring and clip recommendations
- `mlx-whisper` for local transcription
- `torchvision` for some MLX vision processors, including GLM-based ones

## What it does

Given a source video, the tool can:

1. inspect file metadata
2. detect scene changes
3. build segment candidates
4. extract representative frames for each segment
5. create a contact sheet and preview clip per segment
6. transcribe spoken audio locally
7. ask a local vision model to review each segment visually
8. ask a local text model to score each segment against an editing objective
9. export top-ranked clips

## Project layout

- `run_video_review.py`
  Easy runner that uses the local `src/` package without installation
- `bootstrap_env.sh`
  Creates a local virtual environment and installs dependencies
- `src/local_video_review_lab/runtime.py`
  MLX model discovery and local model runtime hooks
- `src/local_video_review_lab/pipeline.py`
  ffmpeg pipeline, segment building, previews, report generation, and clip export
- `src/local_video_review_lab/cli.py`
  CLI commands

## Setup

If you want an isolated environment for this project:

```bash
cd /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/local-video-review-lab
./bootstrap_env.sh
source .venv/bin/activate
```

The machine also already has the core MLX packages installed globally, so you can run the tool with:

```bash
python3 /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/local-video-review-lab/run_video_review.py --help
```

## Analyze a video

```bash
python3 run_video_review.py analyze /path/to/input.mp4 \
  --output /path/to/output/project \
  --objective "Find the strongest short-form social clips with clear visual hooks." \
  --auto-export-top 3
```

Outputs include:

- `project.json`
- `report.html`
- `frames/`
- `previews/`
- `exports/` if `--auto-export-top` is used

## Export clips from an existing project

```bash
python3 run_video_review.py export /path/to/project.json \
  --output /path/to/final-clips \
  --top 3
```

Or export specific segment IDs:

```bash
python3 run_video_review.py export /path/to/project.json \
  --output /path/to/final-clips \
  --segments 2,5,7
```

## Model selection

If you do not provide model paths, the runtime auto-discovers local MLX models under:

`/Users/joshuafarnworth/.lmstudio/models`

It will pick:

- the first MLX vision model directory it finds for visual review
- the first MLX text model directory it finds for text scoring

You can override either one explicitly:

```bash
python3 run_video_review.py analyze /path/to/input.mp4 \
  --output /path/to/output/project \
  --vision-model /path/to/vision-mlx-model \
  --text-model /path/to/text-mlx-model
```

## Current shape

This environment is strongest for:

- scene-based clip discovery
- rough editorial review with local models
- building review packs and preview clips quickly

It does not yet do frame-accurate timeline editing or live interactive trimming. It is designed to create strong local review artifacts and export candidate clips that can then be refined further.

---

## local-video-review-lab/pyproject.toml

[project]
name = "local-video-review-lab"
version = "0.1.0"
description = "Local macOS video review and clipping pipeline powered by ffmpeg and MLX models."
requires-python = ">=3.11"
dependencies = [
  "Pillow>=10.0.0",
  "mlx-lm>=0.31.1",
  "mlx-vlm>=0.4.0",
  "mlx-whisper>=0.4.3",
  "torchvision>=0.26.0",
]

[project.scripts]
local-video-review-lab = "local_video_review_lab.cli:main"

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.setuptools]
package-dir = {"" = "src"}

[tool.setuptools.packages.find]
where = ["src"]

---

## local-video-review-lab/requirements.txt

Pillow>=10.0.0
mlx-lm>=0.31.1
mlx-vlm>=0.4.0
mlx-whisper>=0.4.3
torchvision>=0.26.0

---

## model-match-lab/README.md

# Model Match Lab

Model Match Lab is a standalone Electron + React app for macOS-first local AI benchmarking.

The app is built for a simple workflow:

1. Choose a directory that contains local model files.
2. Detect which models are benchmark-ready on the current Mac.
3. Build a hardware-first benchmark plan for each selected model.
4. Run deterministic benchmark tasks against every model and every supported runtime setting combination.
5. Rank model + runtime-parameter combinations by task accuracy, startup time, latency, throughput, GPU load, and memory fit.

## Current scope

- Primary platform: macOS
- Primary runtimes: `llama.cpp` via `llama-server`, MLX text, and MLX vision when installed
- Primary model formats: `GGUF`, GGUF + `mmproj`, and MLX model directories
- Native directory picker: yes
- Hardware detection: yes
- Benchmark ranking: yes
- Unsupported for now: Ollama-native runs, generic standalone safetensors inference outside MLX directories, packaged `.app` distribution

The scanner groups model bundles instead of treating every file as a separate candidate:

- standalone GGUF text models
- GGUF vision bundles paired with `mmproj*.gguf`
- MLX text model directories
- MLX vision model directories

## What the app measures

For each selected model, the app generates a benchmark plan based on:

- benchmark goal: balanced, speed, quality, or efficiency
- benchmark depth: quick, standard, or deep
- detected machine hardware
- the model's declared maximum context window when it can be read locally

For `llama-server` candidates, quick and standard runs now prioritize low-bit KV cache settings first:

- full model context first, then half context, and only smaller contexts if the previous halving improved the score
- batch size
- matched K/V cache types such as `q4_0`, `q4_1`, and `iq4_nl`
- prompt cache on or off

Deep-dive GGUF runs expand the sweep to include higher-bit cache settings such as `q5`, `q8`, and `f16`.

For MLX candidates, the matrix varies the supported equivalents:

- full model context first, then adaptive halving with the same score-based gate
- unified KV cache quantization with low-bit priority (`4-bit`, `3-bit`, `2-bit`)
- prompt cache when available to the runtime

Each candidate run measures:

- server ready time
- request latency and estimated time to first token
- generated tokens per second
- process RSS for the active benchmark process
- system-wide memory pressure history from `memory_pressure -Q`
- system-wide GPU utilization history from macOS `IOAccelerator` performance statistics
- deterministic task accuracy and stability

The current task suite includes:

- a simple arithmetic benchmark
- a directory-analysis benchmark against a generated local fixture directory
- a sorted file-list benchmark against a second generated directory
- a vision color-grid benchmark for vision-capable models

These tasks replace the older free-form “ask each model a question” probe flow.

## Running locally

Prerequisites:

- macOS
- Node.js 25+
- `llama-server` available on your `PATH`, or a full path entered in the app, for GGUF benchmarking
- `mlx-lm` and or `mlx-vlm` installed into a local Python 3 environment if you want MLX benchmarking

Install dependencies:

```bash
npm install
```

Start the app in development:

```bash
npm run dev
```

Build the renderer and Electron bundles:

```bash
npm run build
```

Useful checks:

```bash
npm run typecheck
npm run lint
```

## Project layout

- `electron/`
  Electron main process, preload bridge, hardware detection, model scan, and benchmark engine
- `shared/`
  Shared contracts used by Electron and React
- `src/`
  Renderer UI for setup, scan results, live progress, and ranked benchmark results

## Benchmark behavior

- The app uses a native macOS directory picker for selecting the model directory.
- Hardware detection reads local macOS system data such as memory, CPU, and display/GPU details.
- Runtime detection looks for `llama-server` and checks the active Python environment for `mlx-lm` and `mlx-vlm`.
- Benchmarks run locally and do not send prompts or outputs to a remote service.
- Each candidate runs every deterministic benchmark task for that model.
- Each `llama-server` candidate launches its own local server with different runtime parameters such as `ctx-size`, `batch-size`, low-bit KV cache settings, prompt-cache, and vision projector settings where needed.
- The benchmark always tries the model's largest declared context first, then tests half context, and only continues shrinking context when the smaller context scores better.
- Telemetry is sampled while the candidate is active so different settings can be compared against GPU history and memory pressure, not just raw token speed.
- The GPU and memory samples are gathered from system-level macOS telemetry that corresponds to the same signals Activity Monitor visualizes.
- If a run is cancelled or a candidate fails, the app keeps partial results where possible.
- Benchmark runs are logged to timestamped files under `~/Library/Application Support/model-match-lab/logs/`.

## Next steps you may want to add

- benchmark export to JSON or CSV
- saved benchmark history
- custom prompt suites
- packaging and signing for a standalone macOS `.app`

---

## objkt-owned-editions-sorter/README.md

# objkt Owned Editions Sorter (Chrome Extension)

Private, personal-use Chrome extension that adds sorting options on `objkt.com` owned pages.

## What it does

- Adds an **Owned Sort** control on profile `owned` pages.
- Sort options:
  - `Default`
  - `Most editions owned`
  - `Fewest editions owned`
- Keeps a stable original order so you can always go back to default.
- Works with dynamic/infinite scrolling pages by watching DOM updates.

## Install (unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:
   - `/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/objkt-owned-editions-sorter`

## Use

1. Open an objkt owned page, for example:
   - `https://objkt.com/profile/<your-wallet>/owned`
2. Use the **Owned Sort** dropdown.
3. Click **Refresh** after new cards load if needed.

## Notes

- The parser uses several heuristics to extract owned edition counts from card text/datasets.
- If objkt changes markup, the extension may need selector/parser updates.
- This project is local and personal-use oriented (no telemetry, no remote services).

---

## p5js/README.md

# Signal Foundry

Signal Foundry is a browser-based generative studio for building stills, loops, and motion exports from p5.js and three.js systems.

## Included Systems

- Flow-field particles with quadtree neighbor lookups
- Cellular automata grids with mutation and trail decay
- L-system growth grammar with animated bloom cycles
- A three.js orbital loom with projected 4D rotation

## Creator Workflow

- Pause and scrub to a precise loop phase before capturing a still
- Generate guided variants from the current scene without leaving the studio
- Add live finishing effects with glow, grain, vignette, and mirror modes
- Save promising looks to a local variation shelf and reload them later

## Exports

- PNG snapshot
- GIF loop
- WebM with optional ambient audio
- Experimental MP4 when the browser can encode it
- PDF frame index
- Flattened "4D stack" image that composites captured frames

## Run It

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:8001](http://127.0.0.1:8001).

## Smoke Test

Start the local server first, then run:

```bash
npm run smoke
```

Artifacts are written into `output/manual/smoke-studio/`.

---

## p5js/progress.md

Original prompt: this doesnt work.... and I want to move on to a different project that is more likely to function as we desire.

New project with rely heavily on p5.js, 3js, particle physics, celluar automata, flow fields, l systems, quadtrees, and other similar graphi phenomena.

I want to create a gui that allows users to play with these concepts by adjusting parameters.

Your job is to design this app that will create images, animations, loops, and export as single snapshot image, gif, mp4, webm with audio, and pdf indexing gif frames. also experiment with a 4d export that saves gif frames on top of each other, flattened.

Notes:
- Replacing the old `Quantum Drift` sketch with a new generative studio inside `p5js`.
- Direction: a modular “visual systems lab” with multiple simulation modes and export tools.

TODO:
- Build the new studio UI shell.
- Implement visual system modules across p5.js and three.js.
- Add browser-side export tools for stills, loops, video, GIF, PDF contacts, and flattened frame stacks.

Update 2026-03-22:
- Replaced the old project shell with `Signal Foundry`, a 3-panel generative studio UI in `index.html`, `src/studio.css`, and `src/studio.js`.
- Implemented four live systems:
  - Flow Field Forge: p5.js particles with quadtree neighbor queries
  - Cellular Loom: p5.js cellular automata
  - L-System Canopy: recursive growth grammar with bloom animation
  - Orbit Loom: three.js projected 4D orbital strands
- Implemented browser exports for PNG, GIF, WebM + audio, MP4, PDF frame index, and flattened frame-stack PNG.
- Added `scripts/smoke-studio.mjs` so the app can be validated end-to-end in a real browser and artifacts can be saved under `output/manual/...`.
- Updated package metadata and README from the old `Quantum Drift` identity to the new studio.

Validation 2026-03-22:
- `node --check src/studio.js` passed.
- `node --check scripts/smoke-studio.mjs` passed.
- Smoke runs completed successfully with no browser console errors:
  - `output/manual/smoke-studio-final/`
  - `output/manual/smoke-studio-layout/`
  - `output/manual/smoke-studio-ux/`
  - `output/manual/smoke-studio-creative/`
- Verified downloaded artifacts:
  - PNG snapshot
  - GIF loop
  - PDF frame index
  - flattened stack PNG
  - WebM
  - MP4
- `ffprobe` confirmed the MP4 file contains H.264 video, and the WebM file contains VP9 video plus an Opus audio stream.

Update 2026-03-22, creator UX:
- Added preview transport controls with pause/play and deterministic loop scrubbing.
- Added creator-oriented variant generation so the app can jump to fresh but related compositions quickly.
- Added live post-processing controls for glow, grain, vignette, and mirror modes.
- Added a composite preview canvas so the visible composition is the same source used for still and video export.
- Added a local variation shelf backed by `localStorage` that restores scene, seed, params, finish settings, and exact scrub position.
- Verified the new controls with browser artifacts:
  - `output/manual/ux-controls/`
  - `output/manual/ux-controls-2/`

Open follow-ups:
- The L-system preview reads better than before but could still use stronger small-stage legibility.
- A future pass could add more systems such as reaction-diffusion, boids, sand, or signed-distance feedback loops.
- WebM export is working, but cross-player audio compatibility could still be improved if export robustness becomes a priority.

Execution TODO 2026-03-23:
1. Replace hard-coded scene backdrops with a real background-image system.
2. Add at least five stock background options plus uploaded background support.
3. Add background controls for opacity, blend, scale, and composition mode.
4. Add a mask system with uploaded mask image support.
5. Support mask modes for none / inside / outside behavior plus threshold control.
6. Make masking apply to the actual rendered system output, not just the stage chrome.
7. Add at least four new standalone systems beyond flow / automata / l-system / orbit.
8. Ensure at least one new standalone system is true 3D physics projected into a 2D render.
9. Add preset camera angles for 3D-capable systems.
10. Add custom XYZ camera controls while always facing center in 3D mode.
11. Add scale/composition controls so outputs can feel immersive instead of fixed-grid.
12. Add at least four hybrid systems that combine multiple simulation families.
13. Reorganize the UI so environment, camera, transport, finish, systems, and export controls feel intentional.
14. Retest in-browser and confirm the new control surface and export pipeline still work.

Update 2026-03-23, environment and mask expansion:
- Replaced the old samey stock-image backdrop approach with a real environment system:
  - five built-in stock backdrops are now generated on the fly and visually distinct
  - an explicit uploaded-background slot now appears in the background selector
  - backdrop state now survives look saves without forcing the upload slot accidentally
- Added grouped system browsing in the System menu:
  - Foundations
  - Field Studies
  - Hybrid Labs
- Tightened mask behavior:
  - mask state now reports threshold, feather, and estimated coverage
  - inside vs outside mask logic now drives system motion correctly for masked particle/boid/walker scenes instead of only clipping at composite time
  - uploaded masks now expose a centroid/focus used for nudging agents back toward valid space
- Improved the studio chrome:
  - masthead and stat cards now read like a workspace instead of a landing page
  - panels, cards, controls, and stage framing use stronger gradients/focus states
  - stage status surfaces environment state more clearly
- Expanded `render_game_to_text` so browser tests now capture:
  - scene group
  - environment details
  - mask state
  - camera state

Validation 2026-03-23:
- `node --check src/studio.js` passed after the environment/mask/UI pass.
- `node --check scripts/smoke-studio.mjs` passed.
- Ran the dedicated web-game Playwright client:
  - `output/web-game/studio-pass/`
- Ran richer browser validation for backgrounds, uploaded background slot, outside-mask mode, and 3D camera presets:
  - `output/manual/studio-background-mask-pass/`
- Verified no browser console errors in `output/manual/studio-background-mask-pass/summary.json`.

Open follow-ups:
- The generated stock backdrops are distinct and working, but the more trail-heavy scenes can still overpower subtle environments at default opacity; a future pass could add per-scene environment defaults or a dedicated “backdrop prominence” macro.
- Full export regression was kicked off after the environment refresh and should be kept in the artifact log if another agent continues from here.

Update 2026-03-23, flow-wrap artifact fix:
- Fixed the vertical/horizontal bar artifact in Flow Field Forge.
- Root cause: wrap-based particle systems were using modulo position wrapping and still drawing a line between the pre-wrap and post-wrap positions, which created full-canvas edge-crossing strokes.
- Added `wrapped` frame flags and skipped only those edge-crossing strokes in:
  - Flow Field Forge
  - Flocking Veil
  - Cell Flow Reactor

Validation 2026-03-23, flow-wrap artifact fix:
- `node --check src/studio.js` passed.
- Verified in-browser with the web-game client:
  - `output/web-game/flow-wrap-fix/`
- Screenshot review confirms the old full-canvas vertical/horizontal wrap bars are gone and the scene now reads as flowing particle trails.

Update 2026-03-23, L-system rootfield rebuild:
- Reworked the L-system generator so it no longer replays growth on a cosine loop.
- The rootfield now builds a stable canopy once, then moves under wind using shared point displacement so connected branches sway together instead of drawing/undrawing themselves.
- Tightened the L-system controls so:
  - `Iterations` now acts like controlled branching depth instead of runaway scatter
  - `Angle Spread` is narrower and more art-directable
  - `Wind` is an explicit scene control
- Replaced the old string-expansion stalk behavior with a rooted branching process:
  - roots are sampled evenly across the requested grid instead of being randomly clumped
  - trunks continue while lateral branches split off, which reads more like planted trees/shrubs than isolated single stalks
  - crowding and tangent steering still encourage neighboring roots to bend around and through one another
- Adjusted the L-system staging:
  - branch bounds are fit into the composition more intentionally
  - the heavy ground band was lowered so the scene does not feel pinned to the bottom
  - stray root anchor dots were removed from render

Validation 2026-03-23, L-system rootfield rebuild:
- `node --check src/studio.js` passed after each L-system revision.
- Ran the required web-game client regression:
  - `output/web-game/lsystem-wind-regression/`
- Ran focused Playwright captures on the rebuilt L-system scene:
  - `output/manual/lsystem-wind-pass/orchard.png`
  - `output/manual/lsystem-wind-pass/delta.png`
  - `output/manual/lsystem-wind-pass/summary.json`
- Current verified metrics from that pass:
  - Orchard: `Roots 12 · branches 4,032 · wind 0.94`
  - Delta: `Roots 18 · branches 6,048 · wind 1.28`

Open follow-ups:
- The L-system field now behaves correctly as a living canopy, but it can still be pushed further toward full-frame forests by adding scene-level composition presets or a denser canopy mode for higher root counts.
- Flow Field Forge still deserves another tuning pass focused purely on liquid coherence and stronger separation between Tidal / Ember / Aurora motion signatures.

Update 2026-03-23, rooted wind + higher root caps:
- Reworked L-system wind deformation again so roots stay rooted.
- The canopy no longer uses free-floating point offsets for wind. It now builds a node hierarchy and poses each branch by rotating fixed-length segment vectors around their parent node.
- Result:
  - root/base nodes stay pinned in place
  - branch lengths stay constant during wind motion
  - wind reads as bending/flexing instead of translation/stretching
- Expanded the root-grid controls for L-system scenes:
  - Grid Columns now supports up to `10`
  - Grid Rows now supports up to `10`
  - Active Roots now supports up to `100`
- Raised the Orchard preset density substantially so it is no longer artificially sparse.
- Added subtle per-root trait variation so neighboring roots follow the same overall rules while differing slightly in:
  - spread
  - taper
  - branching tendency
  - upward bias
  - weave bias
  - wind bend bias
  - bloom size bias

Validation 2026-03-23, rooted wind + higher root caps:
- `node --check src/studio.js` passed.
- Focused browser validation artifacts:
  - `output/manual/lsystem-rooted-pass/orchard-a.png`
  - `output/manual/lsystem-rooted-pass/orchard-b.png`
  - `output/manual/lsystem-rooted-pass/orchard-100.png`
  - `output/manual/lsystem-rooted-pass/summary.json`
- Verified in that pass:
  - Orchard now uses `Roots 28`
  - Custom dense layout successfully reaches `Roots 100`
  - UI control caps are confirmed in-browser as:
    - `rootColumns` max `10`
    - `rootRows` max `10`
    - `rootCount` max `100`
- Ran the required web-game regression client again:
  - `output/web-game/lsystem-rooted-regression/`

Open follow-ups:
- The rooted-wind model is behaving correctly, but the L-system scene still has a few isolated blossom dots at the far edges in some compositions; a future pass should cull or reconnect those terminal micro-branches more elegantly.

---

## porcupin-slideshow/README.md

# Porcupin Slideshow

A lightweight Raspberry Pi web app that turns a local Porcupin backup into a living wall display.

Features:
- Reads backed-up NFT metadata from Porcupin's `porcupin.db`
- Builds a slideshow from pinned display/artifact/thumbnail assets
- Supports curated playlists with drag-free reordering controls
- Exports pinned media into normal local file types for offline playback
- Works well in a Chromium kiosk window on a Pi 5

The app keeps its own data separate from Porcupin:
- Porcupin database is read-only
- Playlist data is stored in a separate SQLite file
- Exported slideshow media is stored in a separate export directory
- The local export flow reads bytes from Porcupin's API on `127.0.0.1:8085`

## Run locally

```bash
cd porcupin-slideshow
PORCUPIN_API_TOKEN=... python3 app.py --porcupin-db /path/to/porcupin.db --port 8090
```

Then open:

```text
http://127.0.0.1:8090/
```

## Useful URLs

- Manager: `/`
- Slideshow player: `/player`
- Slideshow player with a playlist: `/player?playlist=<playlist-id>`

## Pi defaults

Without flags, the app uses:

- Porcupin DB: `~/.porcupin/porcupin.db`
- App data: `~/.local/share/porcupin-slideshow`
- Porcupin API: `http://127.0.0.1:8085`
- Bind: `127.0.0.1`
- Port: `8090`

The first run warms an export cache under:

- `~/.local/share/porcupin-slideshow/exports`

Each exported asset is reconstructed from the local pinned IPFS data and saved as a normal file with a real extension like `.jpg`, `.png`, `.webp`, `.mp4`, or `.html`.

---

## r00t/DEPLOY.md

# Deploy r00t wallet summary (Netlify)

When you're ready to put the app live:

1. **Push the code to your remote.** Netlify builds from the remote repo, so it must have code. From the r00t folder:
   ```bash
   git remote add origin <your-repo-URL>   # e.g. https://github.com/yourusername/r00t.git
   git push -u origin main
   ```
   (If you created the remote with a README, you may need to pull and merge first, or force-push if the remote is meant to be replaced.)
2. **Site name:** The repo name "r00t" may be taken on Netlify. Pick a project/site name—it becomes the URL (`<name>.netlify.app`). Suggestions: **r00t-wallet**, **nimrod-wallet**, **r00t-tezos**, or **root-tezos-wallet** (spelled out).
3. **Connect the repo** to [Netlify](https://app.netlify.com): New site → Import from Git → choose this repo and branch.
4. **Build settings** are in `netlify.toml`; Netlify will pick them up:
   - **Base directory:** `app`
   - **Build command:** `npm ci && npm run build`
   - **Publish directory:** `app/dist`
5. **Deploy.** The SPA redirect (/* → /index.html) is already configured.

No env vars required for the static app. The support section already shows Nimrod's wallet and the human's wallet (pay-the-human) from `app/src/config.ts`.

---

## r00t/GOALS.md

# r00t – Nimrod goals

Grand-scale sustainable goals and subgoals. Update checkboxes as subgoals are completed. Grand goals stay stable unless the experiment pivots.

---

## Current focus

- Deploy to Netlify when ready (steps in DEPLOY.md; human connects repo).
- Track revenue and obligations in nimrod/ledger.md; iterate on MVP from feedback.

---

## G1. Financial sustainability

Cover $60/month and any expansion costs; repay 20 XTZ; build revenue that can persist.

- [x] Choose and document earning avenue (first moral compass entry; Tezos preferred).
- [x] Design MVP that can receive XTZ or USD (e.g. small Tezos app, tool, or product with payment/donation path).
- [x] Implement MVP in r00t (code, config, any APIs).
- [ ] Deploy to a public endpoint (e.g. Netlify once human connects repo).
- [x] Add a clear path for payment/donation to the human (XTZ or USD).
- [x] Track revenue and obligations (e.g. in nimrod/ or a simple ledger).
- [ ] Iterate on MVP from feedback or usage to improve conversion or retention.
- [ ] Document what "sustainable" means for this experiment (e.g. target run rate, payback of 20 XTZ).

---

## G2. Operational sustainability

Interact with the world via APIs and code; keep human involvement to the bare minimum.

- [ ] Inventory actions that require a human (accounts, signups, KYC) and document exact asks.
- [ ] Prefer APIs, scripts, and automation for all outreach, posting, and product interactions.
- [ ] Build or adopt interfaces for any chosen platforms (email, social, Tezos) so the human never sends or posts on Nimrod's behalf.
- [ ] Document runbooks or scripts for recurring tasks (e.g. posting, balance checks) so they are repeatable.
- [ ] Reduce one-off "please do X" requests over time by automating or pre-defining flows.

---

## G3. Visibility and outreach (own publicity)

Grow presence and reach in a way that can drive revenue, without the human doing marketing and without sounding like an ad.

- [ ] Decide which channels to use first (e.g. one social platform, site, or both) and request only what's needed (email first if social).
- [ ] Build or integrate posting/scheduling via API so all outreach is agent-driven.
- [ ] Define a distinct voice and constraints (no ad-speak; platform content rules).
- [ ] Publish or link to the experiment (e.g. about r00t, about Nimrod) where it fits the channel.
- [ ] Tie outreach to a clear CTA (e.g. try the app, donate, learn more) that can convert to XTZ or USD.
- [ ] Measure or log what's tried and adjust (e.g. in nimrod/journal or internal-actions).

---

## G4. Capability growth under constraints

Expand only when the first month's fee is covered and there is a written plan to use the new capability to earn more.

- [ ] List potential expansions (e.g. Hugging Face, remote GPU, sub-agents, paid APIs) and their monthly cost.
- [ ] For each candidate: write a one-page "expansion plan" (how it will be used to earn; payback).
- [ ] Request new subscriptions only when (a) first month's fee is available or path is clear, and (b) plan is documented.
- [ ] After expansion: implement at least one earning use case tied to that capability and log it.
- [ ] Revisit expansion list periodically and retire or reprioritize based on revenue and survival.

---

## G5. Documentation and transparency

Keep the experiment legible and accountable: logs, moral compass, journal, and public goals.

- [ ] Maintain nimrod/decisions.md, nimrod/internal-actions.md, nimrod/external-interactions.md, and nimrod/journal.md per the Cursor rule.
- [x] Add the first moral compass entry when choosing the earning avenue; update compass when making values-relevant choices.
- [ ] Keep nimrod/self-definition.md updated as principles evolve.
- [ ] Ensure GOALS.md and RULE.md (and any public docs) stay in sync with how Nimrod actually operates.
- [ ] Use documentation to explain "why" in commits or release notes where useful for viewers.

---

## G6. Legal and rule compliance

Operate within US law and all r00t mission and social rules; avoid surprises.

- [ ] Before any new integration or payout flow: confirm it does not violate US law and fits RULE.md.
- [ ] Ensure all payments go to the human as intermediary (XTZ or USD turned over); no agent-held funds.
- [ ] Respect platform ToS and content rules for any channel used; document where needed.
- [ ] Re-check compliance when adding a new revenue stream or channel.

---

## r00t/RULE.md

# r00t – Nimrod mission rules

Agent must comply; human enforces. Nimrod also keeps git-ignored logs, self-definition, moral compass, and journal in **nimrod/** (see Cursor rule).

---

## Identity

**You are Nimrod.**

---

## Mission rules

1. **Obey US law.** Do not propose, implement, or facilitate anything that violates United States law.
2. **You are responsible for your own publicity and advertising.** The human will not perform marketing or promotion on your behalf. You must propose and implement outreach (e.g. copy, channels, API-driven campaigns) yourself.
3. **You are limited to API-driven interaction with the world.** Prefer actions that use APIs, scripts, and automated flows. Ask the human to do only the bare minimum that strictly requires a human (e.g. creating accounts, signing up for services, KYC). Document exactly what you need when you ask.
4. **Any payment to a third party must be negotiated as payment to the human as intermediary.** Prefer XTZ when possible. If payment is in USD or other currency, you must earn it online (e.g. via a product, donation, or service you enable) and turn it over to the human. You do not hold funds; the human does.
5. **You owe the human $60/month plus the cost of any other monthly subscriptions that expand your capabilities.** These obligations are tracked and must be covered by revenue you help generate (XTZ or USD turned over to the human).
6. **You may request new subscriptions** (e.g. Hugging Face, remote GPU, sub-agents) to grow your capabilities. The human may set up such accounts or subscriptions when you ask.
7. **Before requesting a new subscription, you must (a) have the first month's fee available (or a clear path to it), and (b) provide a written plan for how that service will be used to earn more money.** No expansion without funds + plan.
8. **Survival is goal #1.** When possible, prioritize earning on Tezos (XTZ). If tradeoffs arise, ensuring ongoing ability to pay obligations comes before maximizing Tezos-specific revenue.

---

## Social media rules

1. The human will set up an **email address for you to access via API**, if you request it. Request it when you need it for accounts or integrations.
2. The human will set up a **social media account** on whichever platform you choose, if you request it. It will be linked to the email you must request first. Request email before requesting the social account.
3. **The human will not send emails for you or post for you.** You must use APIs, tools, or apps you build to send and post.
4. **You must either build your own way to interface with those platforms or use existing paths** (APIs, official integrations, automation tools). No reliance on the human to perform the actual sending or posting.
5. **If a platform or tool incurs a fee, you must follow the expansion rules:** first month's fee available (or path to it) plus a written plan for how it will be used to earn more.
6. **You must obey all content rules for the platform** (community guidelines, ToS, moderation).
7. **You must not sound like an ad when using social media.** Communicate as a distinct voice, not as promotional copy.
8. If you build an app the human would use on Tezos (e.g. a game, a wallet summary tool with per-use charge), **the human may pay you XTZ to use it and may tell others about it.** This is an allowed and encouraged revenue path.

---

## receipt finder/README.md

# Receipt Finder

Scrapes Gmail for receipt-like emails, categorizes them by merchant/type, and saves them as organized PDFs. Optional Brex integration for matching receipts to card transactions.

## Quick start

```bash
cd "receipt finder"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # edit if needed
python -m src.main
```

The first run opens a browser for Google sign-in.

## Google Cloud setup (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create (or select) a project.
2. **Enable the Gmail API**: APIs & Services > Library > search "Gmail API" > Enable.
3. **Create OAuth credentials**: APIs & Services > Credentials > Create Credentials > OAuth client ID.
   - Application type: **Desktop app**.
   - Download the JSON and save it as `credentials/credentials.json`.
4. If the project is in "Testing" mode, add your Gmail address under OAuth consent screen > Test users.

## Usage

```bash
# Default: search for receipts/invoices in your inbox
python -m src.main

# Only emails after a date
python -m src.main --after 2024/01/01

# Custom query
python -m src.main --query "from:amazon receipt"

# Limit to 50 emails
python -m src.main --max 50

# Match receipts to Brex transactions (requires BREX_API_TOKEN in .env)
python -m src.main --brex
```

## Output structure

```
output/
├── shopping/
│   ├── 20240315_1023_Amazon.pdf
│   └── 20240401_0900_Target.pdf
├── subscriptions/
│   └── 20240301_0000_Spotify.pdf
├── travel/
│   └── 20240220_1430_Delta_Airlines.pdf
├── other/
│   └── 20240410_0800_receipt.pdf
└── receipts_index.json        # manifest of all receipts
```

Categories: `shopping`, `food_delivery`, `travel`, `rideshare`, `subscriptions`, `utilities`, `finance`, `saas`, `other`.

## receipts_index.json

Each entry contains:

```json
{
  "msg_id": "...",
  "merchant": "Amazon",
  "category": "shopping",
  "amount": 42.99,
  "currency": "USD",
  "subject": "Your Amazon.com order...",
  "date": "Fri, 15 Mar 2024 10:23:00 -0700",
  "files": ["shopping/20240315_1023_Amazon.pdf"]
}
```

## Brex matching

Set `BREX_API_TOKEN` in `.env`, then run with `--brex`. Matched entries get a `brex_match` field in the index linking to the transaction ID, merchant, and amount.

## Project layout

```
receipt finder/
├── src/
│   ├── main.py             # CLI entry point
│   ├── gmail_client.py     # OAuth + Gmail API
│   ├── receipt_scraper.py  # Fetch & parse receipt emails
│   ├── categorizer.py      # Merchant/category/amount extraction
│   ├── pdf_saver.py        # Save PDFs, build manifest
│   └── brex_client.py      # Brex API (optional)
├── config/
│   └── settings.py         # Env-driven config
├── credentials/            # OAuth secrets (gitignored)
├── output/                 # Saved PDFs (gitignored)
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## receipt finder/requirements.txt

google-api-python-client>=2.100.0
google-auth-oauthlib>=1.1.0
google-auth-httplib2>=0.1.1
python-dotenv>=1.0.0
requests>=2.31.0
weasyprint>=60.0

---

## smartpy-test-platform/README.md

# SmartPy Test Platform

Browser-based testing platform for Tezos SmartPy contracts. It compiles/runs SmartPy contracts and exposes generated Michelson artifacts (`.json`, `.tz`) plus scenario logs.

## Features

- Load SmartPy contracts from workspace directories.
- Edit source in browser.
- Compile + run SmartPy tests in one click.
- Inspect:
  - execution status and duration,
  - generated scenario folders,
  - primary contract Micheline JSON,
  - stdout/stderr,
  - `log.txt` per scenario,
  - all build artifacts with preview.

## Run

From:
`/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/smartpy-test-platform`

```bash
python3 server.py
```

Open:
[http://127.0.0.1:8787](http://127.0.0.1:8787)

## Options

```bash
python3 server.py \
  --host 127.0.0.1 \
  --port 8787 \
  --sandbox-root /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox \
  --contract-root /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/Bowers/attached_assets \
  --timeout 180
```

## SmartPy interpreter selection

The server auto-detects a Python interpreter that supports SmartPy v2 syntax (`@sp.module`), preferring:

1. `Bowers/.smartpy-env/bin/python`
2. `python3`
3. `python`

You can force one with `--python-bin`.

## Output storage

Each execution is saved under:
`/Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/smartpy-test-platform/runs/<run-id>/`

This includes the run source file and generated `build/` artifacts.

---

## taxmaster/README.md

# TaxMaster - Tezos Tax Calculator

A free, privacy-first tax calculator for Tezos blockchain. Supports IRS (USA) and HMRC (UK) tax rules.

## Features

- **Privacy First**: All data is stored locally in your browser using IndexedDB. Nothing is sent to any server.
- **IRS Support**: FIFO cost basis matching per Notice 2014-21, Rev. Rul. 2019-24, and Rev. Rul. 2023-14
- **HMRC Support**: Same-day, 30-day, and Section 104 pool matching per CRYPTO22200 series
- **Multiple Wallets**: Track multiple Tezos wallets in one place
- **Transaction Sync**: Fetches transaction history from TzKT API
- **Historical Pricing**: Uses CoinGecko for daily XTZ price data (cached locally)
- **Export Reports**: Download CSV files for disposals and full transaction ledger
- **Backup/Restore**: Export and import your data as JSON

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## How It Works

1. **Add Wallets**: Enter your Tezos wallet addresses (tz1, tz2, tz3, or KT1)
2. **Sync**: Download your transaction history from the TzKT API
3. **Select Options**: Choose tax year and jurisdiction (IRS or HMRC)
4. **Generate Report**: Calculate capital gains/losses based on the selected tax rules
5. **Download**: Export CSV files for your tax records

## Tax Rules Implemented

### IRS (United States)

Based on:
- [Notice 2014-21](https://www.irs.gov/pub/irs-drop/n-14-21.pdf) - Crypto treated as property
- [Rev. Rul. 2019-24](https://www.irs.gov/pub/irs-drop/rr-19-24.pdf) - Airdrop/hard fork income
- [Rev. Rul. 2023-14](https://www.irs.gov/pub/irs-sbse/rev-ruling-2023-14.pdf) - Staking rewards
- [IRS FAQ](https://www.irs.gov/individuals/international-taxpayers/frequently-asked-questions-on-virtual-currency-transactions) - FIFO if not specifically identifying

**Method**: First-In-First-Out (FIFO) cost basis matching

### HMRC (United Kingdom)

Based on:
- [CRYPTO22200](https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22200) - Pooling guidance
- [CRYPTO22250](https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22250) - CGT examples
- [CRYPTO22280](https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto22280) - Fees in tokens
- [CRYPTO21200/21250](https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual) - Staking/Airdrops

**Method**: 
1. Same-day matching (acquisitions on same day as disposal)
2. 30-day rule (acquisitions within 30 days AFTER disposal)
3. Section 104 pool (average cost basis for remaining)

## Data Storage

All data is stored in your browser's IndexedDB:
- **Wallets**: Your tracked wallet addresses
- **Events**: Synced transaction history
- **Price Cache**: Historical XTZ prices (to reduce API calls)
- **Reports**: Generated tax reports

Use the "Export Backup" feature to save your data, especially before clearing browser data.

## APIs Used

- **[TzKT](https://api.tzkt.io/)** - Tezos blockchain data (transactions, token transfers)
- **[CoinGecko](https://www.coingecko.com/)** - Historical XTZ prices

## CLI Script

A standalone Python script is also included for command-line usage:

```bash
cd scripts
python tezos_tax_scan_2025.py tz1YourAddress
```

## Disclaimer

**This is a calculation helper, not tax advice.** Tax laws are complex and vary by jurisdiction and individual circumstances. Always consult a qualified tax professional for your specific situation. The developers are not responsible for any errors, omissions, or tax liabilities.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

---

## tezpulse/README.md

# TezPulse - Tezos Art Activity Scanner

A browser-based application that scans the Tezos blockchain for unique wallet activity across major art platforms (Objkt, Teia, fxhash, Versum, akaSwap).

## Features

- **Automatic Scanning**: Performs a scan on initial page load
- **Multi-Platform Support**: Scans activity across Objkt, Teia, fxhash, Versum, and akaSwap
- **Activity Types**: Tracks creators (minters), buyers, and sellers
- **Real-time Results**: Shows unique wallet counts and expandable lists
- **Client-Side Only**: No authentication or wallet connection required

## Tech Stack

- **Frontend**: React 19 + Vite
- **Language**: TypeScript
- **API**: TzKT REST API
- **Styling**: Plain CSS

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
src/
  api/
    scan.ts              # Core scanning logic and TzKT API integration
  components/
    ScanButton.tsx       # Scan trigger button
    ResultsPanel.tsx     # Results display with expandable lists
    LoadingSpinner.tsx   # Loading indicator
  App.tsx                # Main application component
  main.tsx               # Application entry point
  index.css              # Global styles
```

## Configuration

### Platform Contract Addresses

Edit `src/api/scan.ts` to update platform contract addresses:

```typescript
const OBJKT_CONTRACTS: string[] = ["KT1..."];
const TEIA_CONTRACTS: string[] = ["KT1..."];
// ... etc
```

## How It Works

1. **NFT Mints**: Scans origination operations for FA2 token creation
2. **Transactions**: Fetches transactions with entrypoints like `collect`, `match`, `swap`
3. **Transfers**: Monitors token transfers involving marketplace contracts
4. **Filtering**: Filters results to only include known art platform activity
5. **Deduplication**: Removes duplicate wallet addresses
6. **Display**: Shows counts and expandable lists of unique wallets

## API Endpoints Used

- `https://api.tzkt.io/v1/operations/originations?contractKind=asset&limit=10000`
- `https://api.tzkt.io/v1/operations/transactions?entrypoint=collect&limit=10000`
- `https://api.tzkt.io/v1/tokens/transfers?limit=10000`

## License

MIT

---

## tezpulse/TZKT_API_CHEATSHEET.md

# TzKT API Cheat-Sheet (Tezos NFT + Marketplace Focus)

Base docs: https://api.tzkt.io/  
Tezos docs referencing TzKT: https://docs.tezos.com/developing/information/indexers  

---

## 0. Networks & Base URLs

TzKT exposes separate subdomains per network:

- **Mainnet:** `https://api.tzkt.io/`
- **Ghostnet:** `https://api.ghostnet.tzkt.io/`
- **Other testnets:** `https://api.{network}.tzkt.io/` (e.g. `api.nairobinet.tzkt.io` if active)

All examples below assume **mainnet**.

---

## 1. Global Query Patterns

### 1.1 Common query params

Most endpoints support:

- `limit` — max rows (0–10000). Default: small (often 100).  
- `offset` — numeric offset (for pagination).  
- `offset.cr` — cursor over a monotonic field (often `id`).  
- `sort.asc=field` / `sort.desc=field` — sorting.  
- `select=field1,field2,...` — return only these fields (object mode).  
- `select.values=field1,field2,...` — return bare arrays of values.  

**Example (top kUSD transfer):**

```http
GET /v1/tokens/transfers
    ?token.contract=KT1K9gCRgaLRFKTErYt1wVxA3Frb9FjasjTV
    &limit=1
    &sort.desc=amount
```

---

## 2. Time Filtering

### 2.1 Timestamp filters

- `timestamp.ge=ISO8601` — greater than or equal (since)
- `timestamp.gt=ISO8601` — greater than (after)
- `timestamp.le=ISO8601` — less than or equal (until)
- `timestamp.lt=ISO8601` — less than (before)

**Example (last 24 hours):**

```javascript
const hours24Ago = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
// Use: timestamp.ge=${encodeURIComponent(hours24Ago)}
```

### 2.2 Level filters (alternative to timestamps)

- `level.ge=number` — block level greater than or equal
- `level.gt=number` — block level greater than
- `level.le=number` — block level less than or equal
- `level.lt=number` — block level less than

---

## 3. Operations Endpoints

### 3.1 Transactions

**Get transactions:**
```http
GET /v1/operations/transactions
```

**Filter by entrypoint:**
```http
GET /v1/operations/transactions?entrypoint=collect
```

**Filter by target contract:**
```http
GET /v1/operations/transactions?target=KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxt3
```

**Filter by sender:**
```http
GET /v1/operations/transactions?sender=tz1...
```

**Common entrypoints for NFT marketplaces:**
- `collect` — buyer collects/purchases NFT
- `match` — matches bid/ask
- `swap` — swap operation
- `ask` — seller lists NFT
- `fulfill` — fulfills an order
- `cancel` — cancels listing

**Transaction structure:**
```json
{
  "id": 123456,
  "level": 1234567,
  "timestamp": "2024-01-01T00:00:00Z",
  "hash": "op...",
  "sender": {
    "address": "tz1...",
    "alias": "..."
  },
  "target": {
    "address": "KT1...",
    "alias": "..."
  },
  "parameter": {
    "entrypoint": "collect",
    "value": {
      "swap_id": 123,
      "seller": "tz1...",
      // ... other fields
    }
  },
  "amount": 1000000,
  "status": "applied"
}
```

### 3.2 Originations

**Get contract originations:**
```http
GET /v1/operations/originations
```

**Filter by contract kind (FA2 tokens):**
```http
GET /v1/operations/originations?contractKind=asset
```

**Filter by initiator:**
```http
GET /v1/operations/originations?initiator=tz1...
```

**Origination structure:**
```json
{
  "id": 123456,
  "level": 1234567,
  "timestamp": "2024-01-01T00:00:00Z",
  "hash": "op...",
  "initiator": {
    "address": "tz1...",
    "alias": "..."
  },
  "originatedContract": {
    "address": "KT1...",
    "type": 0,
    "kind": "asset"
  },
  "contractBalance": 0,
  "status": "applied"
}
```

---

## 4. Token Endpoints

### 4.1 Token Transfers

**Get all token transfers:**
```http
GET /v1/tokens/transfers
```

**Filter by token contract:**
```http
GET /v1/tokens/transfers?token.contract=KT1...
```

**Filter by token ID:**
```http
GET /v1/tokens/transfers?token.tokenId=0
```

**Filter by from address:**
```http
GET /v1/tokens/transfers?from=tz1...
```

**Filter by to address:**
```http
GET /v1/tokens/transfers?to=tz1...
```

**Transfer structure:**
```json
{

---

## tui_tools-main/README.md

# 💅 Sassy Wallet

**A Tezos TUI wallet with opinions, jokes, and real controls.**

## 🧾 What It Is

A terminal wallet that **doesn’t hide the knobs**. You learn Tezos by doing Tezos.

## ✨ Features (Current)

- 🔐 **Import wallets**: secret key, 12/24-word mnemonic, watch-only, backup file
- 📦 **Bulk backup / restore** with passphrase encryption (AES-256-GCM + scrypt)
- 💸 **Send XTZ** with fee/gas controls and sane warnings
- 📥 **Receive** with quick copy and multi-wallet selector
- 🍞 **Delegate / Change Baker / Stake / Unstake** with dedicated flows (Stake HQ)
- 📊 **Wallet status + history** with baker aliases, staking, and delegation info
- 🔎 **Operation Summary panel** with direct TzKT links per operation
- 🌐 **RPC + network switching** with friendly status feedback
- 😏 **Sassy commentary** that keeps you humble ¬_¬

## 🚀 Install

```bash
uv venv
uv lock
uv sync --dev
uv run python -m sassy_wallet
# or: uv run sassy-wallet
```

## ✅ Quality Checks

```bash
python scripts/check_dependency_policy.py
uv run ruff check . --fix
uv run ruff format .
uv run ty check
uv run bandit -r sassy_wallet -ll -ii
uv run pip-audit -l --ignore-vuln CVE-2024-23342
```

## 🗂️ Data Location

- Store lives at `~/.local/share/sassy-wallet/wallet.json` (XDG on Linux).
- Override with `SASSY_WALLET_STORE_PATH` (full file path) or `SASSY_WALLET_DATA_DIR` (directory).
- Legacy `data/wallet.json` is migrated once and kept as a backup.

## 🛡️ Security

- Security policy and reporting workflow: `SECURITY.md`

## 🧱 Missing Features

- **Unstake Requests** notifications (track and inspect): **pending**

## 🧠 Why This Exists

Most wallets treat you like a baby. This one treats you like a grown-up ADULT.

## ⚠️ Warning (Read Me, Chef)

This is in active development. You *will* find a few surprise croissants (bugs) on the way.  
Use with caution and don’t import your main wallet with the grandpa portfolio in it.

I’m building this because Tezos needs fun, educational TUI tools that **didn’t exist before**.

If this helps, donations fuel more pizzas (features) and V2 work.  
Tezos: `tz1LJmf4GUTrNsZVWXomSfqyWEWdNPo75Wz3`  
A donation button is coming to the landing page.

## 📜 License

MIT. Don’t blame the oven if you burn the bread.

---

## tui_tools-main/SECURITY.md

# Security Policy

## Supported Versions

Security fixes are applied to the `main` branch.

## Reporting a Vulnerability

- Do not open public issues for security vulnerabilities.
- Use GitHub private vulnerability reporting for this repository.
- Include:
  - affected version/commit
  - impact and attack scenario
  - reproduction steps or PoC
  - proposed remediation (if available)

We aim to acknowledge reports within 72 hours and provide remediation guidance as quickly as possible.

## Security Release Checklist

Run these before release:

```bash
uv lock
uv sync --dev
python scripts/check_dependency_policy.py
uv run ruff check . --fix
uv run ruff format .
uv run ty check
uv run bandit -r sassy_wallet -ll -ii
uv run pip-audit -l --ignore-vuln CVE-2024-23342
uv run pytest -q
```

## Local Data Hardening Requirements

- Wallet store and backups must be written with private file permissions (`0600`).
- Wallet/log/backup directories must use private permissions (`0700`).
- Logs must redact blockchain identifiers and secret material.
- RPC endpoints must be validated as `https` and normalized before use.

## CI Security Gates

CI enforces:

- quality/test gates in `python-app.yml`:
  - static analysis (`ruff`, `ty`)
  - test suite pass
- dedicated vulnerability gates in `security-audit.yml`:
  - static analysis (`bandit`, medium/high confidence)
  - dependency audit (`pip-audit`)
  - machine-readable report artifacts (`bandit-report.json`, `pip-audit-report.json`, `dependency-sbom.cdx.json`)

## Tracked Exceptions

- `CVE-2024-23342` (`ecdsa==0.19.1`) is currently ignored in `pip-audit` gates because no fixed release is available.
- This package is pulled transitively by `bip_utils`; remove the exception as soon as an upstream fixed chain is available.
- Follow-up tracking record: `SECURITY_FOLLOWUPS.md` (`SF-2026-02-06-001`).

---

## tui_tools-main/pyproject.toml

[build-system]
requires = ["setuptools>=78.1.1", "wheel>=0.45.0"]
build-backend = "setuptools.build_meta"

[project]
name = "sassy-wallet"
version = "1.3.0"
description = "A bold Tezos wallet with attitude - TUI wallet with personality"
readme = "README.md"
authors = [
    {name = "Sassy Wallet Contributors"}
]
license = {text = "MIT"}
classifiers = [
    "Development Status :: 4 - Beta",
    "Environment :: Console",
    "Intended Audience :: End Users/Desktop",
    "License :: OSI Approved :: MIT License",
    "Operating System :: OS Independent",
    "Programming Language :: Python :: 3",
    "Programming Language :: Python :: 3.10",
    "Programming Language :: Python :: 3.11",
    "Programming Language :: Python :: 3.12",
    "Topic :: Office/Business :: Financial",
    "Topic :: Security :: Cryptography",
]
keywords = ["tezos", "wallet", "cryptocurrency", "tui", "cli", "blockchain"]
requires-python = ">=3.10"
dependencies = [
    "textual==7.5.0",
    "pytezos==3.17.0",
    "cryptography==46.0.4",
    "base58==2.1.1",
    "requests==2.32.5",
    "urllib3==2.6.3",
    "mnemonic==0.21",
    "bip_utils==2.10.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-cov>=4.0.0",
    "ruff>=0.9.0",
    "ty>=0.0.1",
    "bandit>=1.7.0",
    "pip-audit>=2.7.0",
]

[project.urls]
Homepage = "https://github.com/BakingLiberteZ/tui-tezos-wallet"
Repository = "https://github.com/BakingLiberteZ/tui-tezos-wallet"
Issues = "https://github.com/BakingLiberteZ/tui-tezos-wallet/issues"
Changelog = "https://github.com/BakingLiberteZ/tui-tezos-wallet/blob/main/CHANGELOG.md"

[project.scripts]
sassy-wallet = "sassy_wallet.__main__:main"

[tool.setuptools]
packages = ["sassy_wallet", "sassy_wallet.ui", "sassy_wallet.core", "sassy_wallet.messages"]

[tool.setuptools.package-data]
sassy_wallet = ["assets/*"]

[tool.ruff]
line-length = 100
target-version = "py310"

[tool.pytest.ini_options]
markers = [
    "smoke_pilot: interactive Textual Pilot smoke test (optional)",
]

[tool.ty.analysis]
allowed-unresolved-imports = ["pytest", "setuptools"]

[dependency-groups]
dev = [
    "ty>=0.0.15",
]

---

## tui_tools-main/requirements.txt

# Sassy Wallet - Runtime dependencies
# Preferred workflow: `uv sync --dev` from pyproject.toml

textual==7.5.0
pytezos==3.17.0
cryptography==46.0.4
base58==2.1.1
requests==2.32.5
urllib3==2.6.3
mnemonic==0.21
bip_utils==2.10.0

---

## videozine-editor/README.md

# Videozine Editor

A desktop application for creating and packaging videozine episodes as interactive tokens for objkt.com.

## Overview

This editor helps you create monthly videozine episodes featuring emerging video and animation artists who publish their work on the Tezos blockchain. The output is a self-contained, interactive HTML package ready for minting on objkt.com.

## Features

### Editor UI
- **Episode Management**: Set episode title, description, and cover image
- **Video Upload**: Drag-and-drop or select multiple video files
- **Metadata Entry**: Add artist information, descriptions, and objkt.com links for each video
- **Thumbnail Generation**: Automatically generate video thumbnails using ffmpeg
- **Episode Compilation**: Auto-compile individual videos into one episode or upload a manual edit
- **Package Export**: Create a self-contained viewer package ready for minting

### Viewer Package (Output)
- **Full-width Episode Player**: Plays the compiled episode video
- **Interactive Video Grid**: Click icons to view individual videos
- **Individual Video Pages**: Dedicated pages for each video with artist info and objkt.com links
- **Self-contained**: All assets included locally, no external dependencies
- **objkt.com Compatible**: Follows all requirements for interactive token minting

## Installation & Setup

### Quick Installation
1. **Run the installer**: `python install/install_requirements.py`
2. **Install ffmpeg**: `./install/install_ffmpeg_macos.sh` (macOS)
3. **Start the editor**: Double-click `start_videozine_editor.command`

### Manual Installation
1. **Install Python 3.8+**
2. **Install Required Packages**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Install ffmpeg** (for video processing):
   - macOS: `brew install ffmpeg`
   - Windows: Download from https://ffmpeg.org/
   - Linux: `sudo apt install ffmpeg`

## Usage

### Starting the Editor
**Easy way**: Double-click `start_videozine_editor.command` (macOS)
**Command line**: `python start_videozine_editor.py`

This will open the editor UI in your default browser.

2. **Create an Episode**:
   - Enter episode title and description
   - Upload video files
   - Edit metadata for each video (title, artist, description, objkt.com link)
   - Generate thumbnails
   - Compile episode or upload manual edit
   - Export the viewer package

3. **Mint on objkt.com**:
   - Zip the exported viewer package
   - Upload to objkt.com as an interactive token

## File Structure

```
videozine-editor/
├── main.py                 # Application entry point
├── requirements.txt        # Python dependencies
├── app/                   # Core application modules
│   ├── video_processor.py # Video processing (thumbnails, compilation)
│   ├── metadata_manager.py # Episode and video metadata management
│   └── package_builder.py # Viewer package creation
├── templates/             # Editor UI templates
│   ├── index.html        # Main editor interface
│   └── viewer/           # Viewer package templates
│       ├── styles/       # CSS for viewer
│       └── scripts/      # JavaScript for viewer
├── static/               # Editor UI assets
│   ├── css/             # Editor styles
│   └── js/              # Editor JavaScript
├── output/              # Generated viewer packages
└── temp/                # Temporary files during processing
```

## Technical Details

### Video Processing
- Uses ffmpeg for thumbnail generation and video compilation
- Supports common video formats (MP4, MOV, AVI, etc.)
- Generates PNG thumbnails at 5-second mark
- Concatenates videos in upload order for episode compilation

### Viewer Package
- Self-contained HTML/CSS/JS package
- No external CDN dependencies
- Responsive design for mobile and desktop
- Keyboard navigation support
- objkt.com meta tags included

### Data Management
- Episode metadata stored in JSON format
- Local storage for editor session persistence
- Automatic data validation and error handling

## objkt.com Compatibility

The generated viewer packages follow all objkt.com requirements:
- `index.html` as main entry point
- All assets referenced with relative paths
- No external dependencies or CDN calls
- Proper meta tags for cover image
- Self-contained folder structure

## Troubleshooting

### Common Issues

1. **ffmpeg not found**: Install ffmpeg and ensure it's in your system PATH
2. **Video upload fails**: Check video format compatibility and file size
3. **Thumbnail generation fails**: Ensure videos are not corrupted and ffmpeg is working
4. **Package export fails**: Check disk space and write permissions

### Support

For issues or questions:
1. Check the console output for error messages
2. Verify all dependencies are installed correctly
3. Ensure video files are in supported formats

## Development

### Adding New Features
- Video processors: Extend `app/video_processor.py`
- UI components: Modify `templates/` and `static/`
- Package templates: Update `templates/viewer/`

### Testing
Test the generated packages by:
1. Opening the viewer package in a browser
2. Verifying all videos play correctly
3. Checking mobile responsiveness
4. Validating objkt.com compatibility

## License

This project is designed for creating art and supporting artists on the Tezos blockchain. Use responsibly and ensure proper attribution to featured artists.

---

## videozine-editor/requirements.txt

Flask>=3.0.0
moviepy>=1.0.3
ffmpeg-python>=0.2.0
Pillow>=10.4.0

---

## vlm-video-archivist/MODEL_CHEATSHEET.md

# Model Cheat Sheet

## Runtime intent

You are the client. Use tool calls, not prose, to drive ingestion and archival.

## Minimal flow

1. Call `ingest_video_archive` with `video_path`, `workspace`, `mode`.
2. Read `video_id` + `manifest_path` from result.
3. Call `inspect_video_context` for compressed timeline data.
4. If needed, re-run `ingest_video_archive` with different `max_segments` / `max_clips`.
5. Call `search_archive` with keyword bundles to find target moments.
6. Call `create_visual_poem` with `workspace`, `word_count=21`, `prompt`, and a `poem_mode` (`audio`, `phrase`, `phoneme`, `text`, `visual`, `hybrid`).

## Tooling heuristics

- Use `mode="commercials"` for ad-break-heavy sources.
- Increase `analysis_fps` (for example `1.6` to `3.0`) when short-lived subjects matter.
- Keep `min_clip_duration` short (`0.8`-`2.0`) for micro context pockets.
- Allow overlap by selecting nearby windows with different semantic labels.
- Reserve `reaction_gif` for short expressive windows (`<=8s`).
- For poem tests, keep `word_count=21` and prefer `entry_kind=audio_word` lexicon entries.

## Context compression pattern

When planning, prioritize each segment row as:

`segment_index | start-end | ad_likelihood | transcript_excerpt | summary | entities[0:4]`

Ignore full metadata unless timing conflicts appear.

---

## vlm-video-archivist/README.md

# VLM Video Archivist

VLM Video Archivist is a **model-first local runtime** for:

- ingesting long videos
- labeling timeline segments with a local GGUF model
- frame-level object detection and face-cluster indexing (for stronger subject recall)
- generating overlapping clip candidates (including reaction-GIF moments)
- exporting clips/GIFs
- archiving still-frame and optional transparent cutout relics
- transcribing speech to word timestamps and building speech-aligned lexicon clips
- storing everything in SQLite + JSON manifests for downstream creative tooling

This project is built for local `llama.cpp` + `ffmpeg` workflows where the model is the client and tool-calling is the primary control plane.

## Why this is model-first

Primary control is still tool-calling and machine entrypoints:

- `tool-specs`: JSON schema for tool calls
- `tool-call`: execute one tool call by name + JSON arguments
- `ingest`: end-to-end ingest + clip + relic pipeline
- `inspect`: compressed timeline context for a stored video

Also includes a human dashboard for queueing/review while the model pipeline runs.

Dashboard runtime access now supports:

- `local` (llama.cpp / local OpenAI-compatible endpoints)
- `openai`
- `openai_compatible` (custom paid providers/gateways)
- `anthropic`

## Requirements

- `ffmpeg` + `ffprobe` on PATH
- `llama-server` on PATH (from `llama.cpp`)
- Python 3.11+

Install dependencies:

```bash
cd /path/to/videospeech_runtime
./bootstrap_env.sh
source .venv/bin/activate
```

Optional transparent cutouts:

```bash
pip install rembg
```

## Run with your GGUF model

Model path example:

`/path/to/model/Gemma-3-4B-VL-it-Gemini-Pro-Heretic-Uncensored-Thinking_Q3_k_m.gguf`

In many Gemma VL GGUF setups, vision needs an `mmproj` file. This runtime can auto-resolve it and optionally download it.

### End-to-end ingest

```bash
python3 run_archivist.py ingest \
  /path/to/video.mp4 \
  --workspace /path/to/archive-workspace \
  --model "/path/to/model/Gemma-3-4B-VL-it-Gemini-Pro-Heretic-Uncensored-Thinking_Q3_k_m.gguf" \
  --auto-mmproj \
  --download-mmproj \
  --mode commercials \
  --max-clips 90
```

Initialize the contained workspace layout first:

```bash
python3 run_archivist.py init-workspace --workspace /path/to/archive-workspace
```

Contained layout created:

- `feeding_trough/`
- `memories/`
- `lexicon/audio_words/`
- `lexicon/audio_phrases/`
- `lexicon/audio_phonemes/`
- `lexicon/text_words/`
- `lexicon/visual_subjects/`
- `outputs/` (including `outputs/poems/`)

### Use an existing llama-server

```bash
python3 run_archivist.py ingest /path/to/video.mp4 \
  --workspace /path/to/archive-workspace \
  --server-url http://127.0.0.1:8080 \
  --model-alias local-vlm
```

## Dashboard (human review + queue control)

Run a local GUI for:

- known files in source folders
- `ingested` vs `not_ingested` vs `queued` vs `running`
- queue selected files / queue all not-ingested
- live ingest stage and logs in one place
- runtime access panel for entering API keys, provider endpoints, and model ids

```bash
python3 run_archivist.py dashboard \
  --workspace /path/to/archive-workspace \
  --server-url http://127.0.0.1:8080 \
  --model-alias local-vlm
```

If `--input-dir` is omitted, dashboard uses `<workspace>/feeding_trough` automatically.

Open:

- `http://127.0.0.1:7878`

Live command example:

```bash
python3 run_archivist.py dashboard \
  --workspace /path/to/archive-workspace \
  --input-dir /path/to/archive-workspace/feeding_trough \
  --server-url http://127.0.0.1:8284 \
  --model-alias local-vlm \
  --mode commercials \
  --max-clips 90 \
  --no-export-gifs \
  --no-create-cutouts
```

## API Access Layer (multi-path)

The runtime now supports a versioned API layer with path aliases:

- `/api/v1/*`
- `/v1/*`
- `/rte/v1/*`
- legacy `/api/*` remains compatible

Run API-only headless mode:

```bash
python3 run_archivist.py dashboard \
  --workspace /path/to/archive-workspace \
  --api-only \
  --api-token your-secret-token
```

Use from external clients:

```bash
curl -H "Authorization: Bearer your-secret-token" \
  http://127.0.0.1:7878/api/v1/state

curl -X POST \
  -H "Authorization: Bearer your-secret-token" \
  -H "content-type: application/json" \
  -d '{"query":"mint","limit":20}' \
  http://127.0.0.1:7878/v1/search/clips
```

Docs and health:

- `GET /api/v1/docs`
- `GET /api/v1/health`

Main API endpoints:

- `GET /state`
- `GET /logs?since=<id>`
- `GET /files`
- `POST /queue`
- `POST /queue/not_ingested`
- `POST /queue/clear`
- `POST /ingest` (queue one path or `paths[]`)
- `POST /model/config`
- `POST /model/retry`
- `POST /search`
- `POST /search/clips`
- `POST /poem`

## Model tool API

Emit tool schemas:

```bash
python3 run_archivist.py tool-specs --with-cheatsheet
```

Static cheat sheet file:

`/path/to/videospeech_runtime/MODEL_CHEATSHEET.md`


---

## vlm-video-archivist/pyproject.toml

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "vlm-video-archivist"
version = "0.1.0"
description = "Model-first local video ingest, timeline labeling, clip extraction, and relic archiving"
requires-python = ">=3.11"
dependencies = [
  "httpx>=0.27.0",
  "Pillow>=10.0.0",
  "openai-whisper>=20250625",
]

[project.optional-dependencies]
cutouts = [
  "rembg>=2.0.60",
]

[project.scripts]
vlm-video-archivist = "vlm_video_archivist.cli:main"

[tool.setuptools.packages.find]
where = ["src"]

---

## vlm-video-archivist/requirements.txt

httpx>=0.27.0
Pillow>=10.0.0
openai-whisper>=20250625
# Optional for transparent subject cutouts:
# rembg>=2.0.60

---

## wallet-constellations/README.md

# Wallet Constellations

Local-first software for turning a Tezos wallet into an evolving visual essay.

The app syncs wallet history from TzKT, caches the raw bundle locally, derives relationship datasets, and
renders the result through small pluggable modules. The first version focuses on:

- creator affinity from repeat collects
- network growth over time
- XTZ send/receive flow sculpture
- ownership journeys for works created by the wallet
- readable ledger tables beside the art views

## Run It

```bash
cd /Users/joshuafarnworth/Desktop/cursor-projects/Sandbox/wallet-constellations
npm install
npm run dev -- --wallet tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2
```

That starts:

- client: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- local API: [http://127.0.0.1:8787](http://127.0.0.1:8787)

The default sample wallet can also be set through `VITE_DEFAULT_WALLET`.

## Build And Check

```bash
npm run check
npm run build
```

## Project Shape

The code is intentionally split into small files so a local coding model can understand the system without
loading a monolith.

- `server/`
  Local Express API and TzKT sync services.
- `src/shared/`
  Pure types and analytics builders shared by frontend and backend.
- `src/app/`
  Frontend app state, formatting, and sync hook.
- `src/core/`
  Module contract and registry.
- `src/ui/`
  Small reusable controls and display primitives.
- `src/modules/*`
  Self-contained visual or analytical views.
- `data/cache/`
  Local synced wallet bundles.

## Module Spine

Modules are auto-registered from `src/modules/*/module.ts`.

Each module exports a `walletModule` object with:

- `id`
- `title`
- `subtitle`
- `accent`
- `order`
- `View`

The `View` receives:

- `data`
  Full synced wallet bundle plus derived analytics.
- `slice`
  Timeline-filtered subset for the current scrub position.
- `progress`
  Timeline position from `0..1`.

This keeps new displays isolated. A new module can be added without touching the existing ones beyond the
automatic registry.

## Current Modules

- `network-growth`
  p5.js constellation of creators, contracts, counterparties, and wallet edges.
- `flow-orbit`
  three.js orbital scene for inbound and outbound XTZ flow.
- `activity-ledger`
  human-readable tables for creators, contracts, flows, and recent interpreted events.
- `token-journeys`
  cards showing how wallet-created tokens have moved across holders.

## Data Source

- account summary: TzKT `/accounts/:wallet`
- token balances: TzKT `/tokens/balances`
- XTZ transactions: TzKT `/operations/transactions`
- token transfers: TzKT `/tokens/transfers`

All synced responses are transformed into a local `WalletStudioData` bundle and cached as JSON in
`data/cache/`.

## Next Module Ideas

- contract atlas
- collector clustering
- gallery mode for owned works
- temporal heatmap
- creator-to-creator bridge map
- edition dispersal map

---

## web3 simulator/README.md

# Tezos Blockchain Simulator

A simulation lab for analyzing blockchain pricing scenarios on a Tezos-like network. This application allows you to simulate what happens when only pricing changes, keeping all other network parameters constant.

## Features

- **Pricing Simulations**: Model token price changes over time with configurable trends and volatility
- **Economic Analysis**: Track network value, staking rewards, transaction fees, and APY
- **Interactive Configuration**: Adjust initial parameters, price scenarios, and network settings
- **Visual Analytics**: Comprehensive charts showing price trends, network value, staking APY, and daily revenue

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Simulation Parameters

### Initial State
- **Initial Token Price**: Starting price in USD
- **Initial Staking Reward Rate**: Annual staking rewards percentage
- **Initial Transaction Fee**: Base transaction fee in tokens
- **Initial Staked Percentage**: Percentage of total supply staked

### Price Scenarios
- **Monthly Price Change Rate**: Expected monthly price change (can be negative)
- **Price Volatility**: Standard deviation for random price fluctuations

### Network Parameters
- **Total Supply**: Total token supply
- **Daily Transactions**: Average transactions per day
- **Staking Reward Adjustment**: How staking rewards adjust to price changes (0-1)

### Simulation Parameters
- **Duration**: Number of months to simulate
- **Time Step**: Simulation granularity in days

## How It Works

The simulator models a Tezos-like blockchain where:

1. **Token Price** evolves based on a trend (monthly change rate) plus random volatility
2. **Staking Rewards** adjust based on price changes to maintain real value
3. **Transaction Fees** remain constant in tokens but their USD value changes with price
4. **Network Value** (market cap) is calculated as total supply × token price
5. **APY** is dynamically calculated based on staking rewards and current token price

## Use Cases

- Analyze the impact of price appreciation/depreciation on network economics
- Understand how staking rewards adjust to price changes
- Model different volatility scenarios
- Study the relationship between token price and network value
- Evaluate staking yield under various price conditions

## Technology Stack

- **Next.js 14**: React framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Recharts**: Data visualization
- **Lucide React**: Icons

## License

MIT

---


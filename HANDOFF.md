# HANDOFF — read this first

For whoever picks this up next (a new Claude chat, Deejah, or Findy). It says what exists, what is verified, what is not, and what to do next. Written 2026-11-10; hackathon submission is due around **2026-11-14**.

---

## 1. What this is

A standalone Next.js app: **buy Nigerian airtime with NEAR.**

- **"Easiest" goal (pay with NEAR):** built.
- **"Medium" goal (sign in with a NEAR wallet):** built.
- **"Bigger" goal (settle on NEAR):** built by default. USDC lands in a SliqPay NEAR account, because `SETTLEMENT_ASSET` defaults to USDC on NEAR.

It is a **separate public repo** on purpose. The production SliqPay backend and frontend are private and **nothing was copied from them** except:
- design tokens and the network picker component (from `sliqpay-frontend`)
- the shape of the 1Click client and the VTPass response rules (from `sliqpay-backend`, Deejah's original integration). Both are rewritten here.

**No contract is deployed.** That is a deliberate SliqPay rule. NEAR Intents' own Verifier contract does the settlement.

---

## 2. Files

| File | What it does |
|---|---|
| `app/page.tsx` | The whole user flow: form → review → tracking. Same look as SliqPay's airtime page. |
| `components/NearWalletProvider.tsx` | NEAR wallet sign-in via `@hot-labs/near-connect` (mainnet). `send()` signs a transaction. |
| `components/OrderTracker.tsx` | Polls `/api/orders/:id` every 4s and shows progress plus nearblocks links. |
| `components/NetworkPickerSheet.tsx` | Copied from `sliqpay-frontend`. |
| `lib/near-deposit.ts` | The one payment transaction: 4 function calls on `wrap.near` (register payer, register deposit address, wrap NEAR, `ft_transfer`). |
| `lib/fee.ts` | Fee "option B" (₦20 under ₦1k, ₦100 to ₦4,999, then 1.5% with a ₦250 floor). |
| `lib/networks.ts` | MTN / Airtel / Glo / 9mobile and their VTPass serviceIDs. |
| `lib/order-types.ts` | Order states, shared by server and page. |
| `lib/server/env.ts` | All settings, zod-validated. **The only file that reads `process.env`.** |
| `lib/server/oneclick.ts` | 1Click API: tokens, quote (`EXACT_OUTPUT`), status, deposit submit. |
| `lib/server/vtpass.ts` | VTPass `/pay` and `/requery`, `request_id` in VTPass's required Lagos-time format. |
| `lib/server/orders.ts` | **The core.** `createOrder` → `recordDeposit` → `advance` (check swap → deliver exactly once). |
| `lib/server/store.ts` | Upstash Redis, or memory for local dev. `claim()` is the atomic set-if-absent that stops double delivery. |
| `lib/server/rate.ts` | NGN per USDC from CoinGecko, or the fixed `NGN_PER_USDC`. |
| `app/api/quote` | `POST`: price, plus a 1Click deposit address. Creates the order. |
| `app/api/orders/[id]` | `GET`: advance the order and return it. |
| `app/api/orders/[id]/deposit` | `POST {txHash}`: record the hash and forward it to 1Click (a hint, never proof). |
| `app/api/config` | `GET`: min/max amounts for the form. |

## 3. Order states

```
AWAITING_DEPOSIT → SWAPPING → PAID → DELIVERING → DELIVERED ✅
        │              │         └→ UNDERPAID (settled short: human)
        │              ├→ INCOMPLETE_DEPOSIT (less NEAR than quoted)
        │              ├→ REFUNDED (NEAR Intents returned the NEAR)
        │              └→ FAILED
        └──────────────────────────── DELIVERING → DELIVERY_FAILED (paid, VTPass refused: human refund)
```

## 4. Verified vs not verified

✅ **Verified here:**
- `npm run typecheck`, `npm run build` and `npm test` pass: 12 tests, including three polls racing to deliver the same order, where VTPass is called exactly once.
- 1Click request and response shapes match the SliqPay backend's 1Click integration (on **staging**, untested live; see the 2026-11-12 correction) and the [1Click docs](https://docs.near-intents.org/getting-started/first-api-swap).
- The VTPass `request_id` format follows [VTPass's rule](https://vtpass.com/documentation/how-to-generate-request-id/).

❓ **Not yet run against the real thing.** The build session's network could not reach 1Click. **Do these first, in order:**
1. **Native USDC on NEAR is in 1Click's token list.** Check `GET https://1click.chaindefuser.com/v0/tokens` for `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`. If it's missing, set `SETTLEMENT_ASSET` to an asset that is listed.
2. **A quote works for ₦500.** 1Click may refuse very small amounts. If it says the amount is too low, raise `MIN_AMOUNT_NGN`.
3. **The `SETTLEMENT_RECIPIENT` account can hold USDC.** NEAR tokens need the receiving account registered once. Easiest fix: send yourself a little USDC on NEAR (for example, buy some in the wallet). The other way is to call `storage_deposit` on the USDC contract for your account with 0.00125 NEAR.
4. **Your wallet approves the 4-action `wrap.near` transaction.** If a wallet refuses batched actions, split it with `signAndSendTransactions` (see §7).
5. **One live ₦500 MTN top-up, end to end.** Watch the order go through every state.

## 5. Setting it up (Findy)

1. **Get a NEAR wallet:** [Meteor](https://meteorwallet.app) or [MyNearWallet](https://app.mynearwallet.com). Create an account; a named one like `sliqpay.near` looks better in a demo. Fund it with a few dollars of NEAR. Use this account as `SETTLEMENT_RECIPIENT`. For the payer, a second account is more convincing in the demo.
2. **Create the env file:** `cp .env.example .env.local`, then fill in `SETTLEMENT_RECIPIENT`, `VTPASS_API_KEY` and `VTPASS_SECRET_KEY` (live).
3. **Run it:** `npm install && npm run dev`, then open http://localhost:3000.
4. **Optional: network logos.** Copy `sliqpay-frontend/public/product-logos/{mtn,airtel,glo}.jpg` into `public/product-logos/`. Without them the app shows the network's initial letter.
5. **Deploy:**
   - Push the repo, import it into Vercel and add every variable from `.env.example`.
   - Add a free [Upstash Redis](https://upstash.com) database and set its REST URL and token. **Required on Vercel.**

**Live money:** keep test amounts small (₦500) and keep the VTPass wallet funded only for the demo.

## 6. Deejah's task (deliberately left for her)

**Add data bundles alongside airtime.** It is a real feature and follows the existing pattern:
- VTPass data needs a `variation_code`. List the plans with `GET {VTPASS_BASE_URL}/service-variations?serviceID=mtn-data` (serviceIDs: `mtn-data`, `airtel-data`, `glo-data`, `etisalat-data`).
- Add a plan picker to the form, and price the order from the plan's `variation_amount`.
- In `lib/server/vtpass.ts`, add `buyData({ requestId, serviceID, billersCode: phone, variation_code, amount, phone })` posting to `/pay`.
- Add `service: 'airtime' | 'data'` and `variationCode?` to `Order`. In `orders.ts` `deliver()`, call `buyData` for data.
- The existing tracker, claim and requery logic need no changes.

## 7. Known gaps (fine for a demo, write them down for judges if asked)

- **Arrival is confirmed through 1Click's status** (`SUCCESS` plus `amountOut` ≥ 99.5% of required), not by reading NEAR RPC ourselves. Production SliqPay verifies every arrival on-chain with its own RPC. Adding a NEAR RPC check of the destination transaction is the next hardening step.
- **A crash between claiming delivery and calling VTPass** leaves the order `DELIVERING`, and the requery may then never find the request. It needs a human. This is very unlikely.
- **No refunds UI.** `DELIVERY_FAILED` and `UNDERPAID` are handled by a person (send USDC or NEAR back to `order.accountId`).
- **No rate limiting** on `/api/quote`. Fine for judging. Add it before any real traffic.
- **Wallets that reject batched actions:** fall back to `signAndSendTransactions` with the four calls as separate transactions to `wrap.near`.

## 8. If we win: merging into SliqPay

The repo name doesn't matter. Port the pieces into `sliqpay-backend` through a normal PR to `staging`, never straight to `main`:
- `originAsset = nep141:wrap.near` as a new origin in the existing 1Click flow (`src/modules/payment/services/oneclick.service.ts`).
- NEAR wallet sign-in in `sliqpay-frontend`.
- A NEAR settlement target next to Avalanche and Stellar (`ONECLICK_SETTLEMENT_CHAIN`). This needs a NEAR RPC verifier first; see §7.

---

## 9. Live testing log (2026-11-10)

- **Fixed:** empty lines in `.env.local` (e.g. `NGN_PER_USDC=`) were rejected as invalid. They now mean "not set" (`lib/server/env.ts`, tested in `env.test.ts`).
- **Fixed:** the 1Click `/status` reply has `null` fields while a swap is in progress, and the strict schema rejected it ("unexpected shape"). The schema is now tolerant, and any mismatch logs the raw reply in the terminal (`lib/server/oneclick.ts`).
- **Changed:** minimum is ₦100, presets ₦100–₦5,000. Tracker labels no longer say "USDC".
- **Settlement asset in use:** `nep141:usdt.tether-token.near` (Findy's `sliqpay.near` already holds USDT, so it is registered for it).
- **OPEN, the current blocker:** two live orders (₦100 and ₦500) reached 1Click `PROCESSING` (NEAR received, `nearTxHashes` present) but never `SUCCESS`, so VTPass was never called. Not yet known whether 1Click is waiting on a solver (tiny amounts) or failing to deliver to `sliqpay.near`. **Next step:** get the raw `GET https://1click.chaindefuser.com/v0/status?depositAddress=<addr>` JSON for the ₦500 order, and check its `nearTxHashes` on nearblocks.io for failed receipts. Suspects in our quote: `EXACT_OUTPUT` on tiny amounts, `recipientType`, settlement token registration.
- Orders live in memory during `npm run dev`; restarting the server forgets them (the swap still completes or refunds on 1Click's side).

### 2026-11-11: blocker diagnosed and fixed (not yet re-tested live)

Both test orders were **REFUNDED in full** by 1Click (`refundFee: 0`): the ₦500 one with `NO_LIQUIDITY`, the ₦100 one with `QUOTE_EXPIRED`. No market maker filled a few-cent `EXACT_OUTPUT` wNEAR→USDT swap. The app now uses **`EXACT_INPUT`** by default (`ONECLICK_SWAP_TYPE`): it sizes the NEAR from 1Click's own token prices and accepts the quote only if `minAmountOut` (the guaranteed amount after slippage) covers the bill, retrying once with a larger input. Tested with stubs, 15 tests pass. **Next:** a live ₦1,000 test.

### 2026-11-11, later: EXACT_INPUT ran, still not filled (OPEN)

- A ₦1,000 order (deposit address `d3826ea5440e02f0d023dc41cea2e6cbfebb32558e56f3b0d5571c831c7c788d`, 1Click correlationId `814086c3-c3fb-4f47-a6b1-9a25eb87da39`) used `swapType: EXACT_INPUT`, so the fix **did** run. 1Click received 0.235 wNEAR (~$0.84) and quoted 0.8397 USDT out (min 0.8313), then sat at `PROCESSING` with **`intentHashes: []`**: no market maker executed it. The earlier refunded orders did have intent hashes.
- Every attempt so far: wNEAR → `nep141:usdt.tether-token.near`, $0.09–$0.84, recipient `sliqpay.near`. All were quoted and none were filled.
- **Next experiments, in order:**
  1. Read this order's final `refundReason` (the quote deadline passed 09:59 UTC).
  2. Ask NEAR Intents support (dev Telegram/Discord) with the correlationIds above: is there a minimum notional, and is wNEAR → USDT on NEAR solver-supported?
  3. Switch `SETTLEMENT_ASSET` to native USDC on NEAR (register `sliqpay.near` for USDC first by swapping ~$0.50 into it in the wallet), and retest at ~$1–2.
  4. If NEAR-side settlement keeps failing, settle to USDC on another chain such as Avalanche, where SliqPay's treasury already receives USDC. That is an env change plus a recipient address.
- Planned after the first success: **electricity** (VTPass merchant-verify for meter number → pay → show token), then an end-to-end error report for Findy.

### Plan B: settle in USDC on Avalanche (use this if USDC on NEAR also does not fill)

Status as of 2026-11-11 afternoon: Findy has swapped her USDT to USDC in `sliqpay.near`, so the account is registered for USDC, and she is testing `SETTLEMENT_ASSET="nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"`. If that is also left unfilled, switch the destination to USDC on Avalanche. ⚠️ Corrected 2026-11-12: the `sliqpay-backend` 1Click flow (`oneclick.service.ts`, `ONECLICK_SETTLEMENT_CHAIN=avalanche`) is on **staging and untested**, so it has no track record. Production uses Dextopus.

What it takes:
1. **The asset id.** Do not hardcode it from memory. Open `https://1click.chaindefuser.com/v0/tokens`, find the entry with `"blockchain":"avax"`, `"symbol":"USDC"` and `"contractAddress":"0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e"` (native Circle USDC on Avalanche, the same contract sliqpay-backend uses), and copy its `assetId`. 🔶 It is expected to look like `nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omft.near`.
2. **`.env.local`:**
   ```
   SETTLEMENT_ASSET="<that assetId>"
   SETTLEMENT_DECIMALS=6
   SETTLEMENT_RECIPIENT="<SliqPay's Avalanche USDC wallet address, 0x…>"
   ```
   The recipient is an EVM address, not a NEAR account. Use the settlement wallet SliqPay already controls on Avalanche (the one the production bill flow receives into). **Never** use an address whose keys nobody holds.
3. **No code change needed for the quote:** `recipientType: DESTINATION_CHAIN` already delivers on the destination chain, and `refundTo` stays the payer's NEAR account (refunds go back on NEAR).
4. **Small code follow-ups:**
   - `components/OrderTracker.tsx`: the step labelled "Stablecoin settled to SliqPay on NEAR" should read "…on Avalanche" when the destination is not NEAR. Expose the chain from `/api/config` and label from it.
   - The destination link should use snowtrace (`https://snowtrace.io/tx/<hash>`) for `destinationTxHashes`.
5. **Demo story:** the user still pays with NEAR and signs in with a NEAR wallet, and NEAR Intents still does the swap and cross-chain settlement. Only the place SliqPay receives the stablecoin changes. Say so in the README.
6. **Then:** one live ₦1,000 test → electricity (VTPass `merchant-verify` for the meter number, then `/pay` with `variation_code` prepaid/postpaid, then show `purchased_code`/token) → the end-to-end error report for Findy (every failure in this log, its cause and its fix).

### 2026-11-11, evening: Plan B code is in (switched off until `.env.local` changes)

- **Done (step 4 of Plan B):** new `lib/settlement-chain.ts` works out the settlement chain from `SETTLEMENT_ASSET` (`nep141:avax-0x….omft.near` → Avalanche, anything else that isn't `.omft.near` → NEAR). Each order now stores `settlementChain`, and `/api/config` returns it. The tracker says "Stablecoin settled to SliqPay on Avalanche" and links the destination tx on snowtrace when the chain isn't NEAR.
- **Safety check:** the server refuses to start if `SETTLEMENT_RECIPIENT` doesn't match the chain (a 0x… address is required for Avalanche, a NEAR account for NEAR). This stops a quote from ever pointing at the wrong kind of address.
- Verified on a clean Linux copy: typecheck, `next build`, **16 tests pass** (one new). `npm test` can't run in the Cowork Linux VM against the Mac `node_modules` (esbuild is darwin-only there), so run it on the Mac.
- **Still needed from Findy:** (a) the result of the USDC-on-NEAR test, (b) if switching: the Avalanche USDC `assetId` from `https://1click.chaindefuser.com/v0/tokens` (this session's network can't reach 1Click) and SliqPay's Avalanche settlement wallet address. Then the three `.env.local` lines from Plan B step 2, and restart `npm run dev`.

### 2026-11-12: switched to Plan B (USDC on Avalanche)

- **USDC on NEAR also failed to fill** (Findy, 2026-11-11). NEAR-side settlement is parked.
- **Real asset id** from 1Click's token list: `nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omdep.near` (symbol USDC, 6 decimals, Circle contract `0xb97e…a6e`). Note **`.omdep.near`**, not `.omft.near` as guessed above. Ignore the `nep245:v2_1.omni.hot.tg:43114_…` entries; 1Click labels them `(DEPRECATED)`.
- `lib/settlement-chain.ts` now recognises `.omdep.near` and `.omft.near` bridged tokens, native coins (`nep141:avax.omdep.near`) and HOT `nep245` ids (by EVM chain id).
- **`.env.local` switched:** `SETTLEMENT_ASSET` above, `SETTLEMENT_RECIPIENT="0x6AfAdc99a7552d37546A4a90A03aefC52c86bA88"` (SliqPay treasury, same as production). The old NEAR values are left as comments, and a full copy is in `.env.local.bak-near` (git-ignored).
- README "How it works" and `.env.example` updated to the Avalanche route, with the reason (no fills on NEAR).
- Verified: typecheck, 16 tests, and the real asset/recipient pair passes env validation.
- **Next:** restart `npm run dev`, then a live ₦1,000 MTN order. Watch for `SUCCESS`, a Snowtrace link in the tracker, USDC arriving at the treasury, then VTPass delivery. If this one is also left unfilled, get its correlationId and `refundReason` and go to NEAR Intents support (experiment 2 above).

### 2026-11-12, later: correction and the likely real cause

- **Correction (Findy):** production SliqPay does **not** use 1Click. It uses **Dextopus**, which swaps to USDC on Avalanche. 1Click exists only on `sliqpay-backend` staging and hasn't been tested live. Earlier lines here that called 1Click "production" were wrong and have been fixed.
- **Production's rule:** paying directly on Avalanche settles with no swap, so any amount works (₦100+). Paying from another chain goes through Dextopus and needs **≥ $1** on most EVM chains, about **$2** from Ethereum, Solana or Tron. The checkout button stays greyed out below that.
- **Likely real cause of every unfilled order:** all of them were $0.09–$0.84, below that floor. The asset ids were fine (1Click quoted them all).
- **Done:** `MIN_ORDER_USD` (default 2). `lib/server/limits.ts` turns it into a naira floor at the live rate (rounded up to ₦50). `/api/config` returns it, the form greys out the button and explains below the floor, and `createOrder` enforces it on the server too. New test `limits.test.ts`.
- **Next live test:** ₦3,000 MTN (≈ $2), not ₦1,000.
- **Idea for after the hackathon, matching production:** direct NEAR payments for small amounts (`ft_transfer` wNEAR to `sliqpay.near`, verify on chain, deliver, then convert to USDC in batches through NEAR Intents), with the per-order Intents swap for orders over the floor.
- **Findy's choice:** `MIN_ORDER_USD=1` in `.env.local` (her production floor for EVM chains). Next live test: **₦1,500 MTN airtime** (≈ $1.1 including fee and buffer). If it fills, try the same size settling on NEAR (restore `.env.local.bak-near`'s two SETTLEMENT lines). If that fills too, size was the only problem, and settling on NEAR (the hackathon's "bigger" goal) is back on.

### 2026-11-12, 05:30: $1.17 order to Avalanche, also not executed (OPEN)

- Order `8619ab72-…`, deposit address `8f6ed956…4b87`, **correlationId `4b2e3094-a024-43d7-b9e3-37dbc0bbeefb`**. EXACT_INPUT 0.3293 wNEAR ($1.17) → USDC on Avalanche, quoted 1.149 out (min 1.1376), so the bill was covered.
- On chain, everything on our side worked (checked on nearblocks):
  - Our tx `4m6cSGw…` (sliqpay.near → wrap.near): register, wrap, `ft_transfer` of the exact amount to the deposit address. Succeeded.
  - 1Click's tx `9x7jGiV…` (signer `bridge-mng.near`), 9 seconds later: forwarded the full amount with `ft_transfer_call` into `intents.near`. Succeeded.
  - Then nothing. `intentHashes: []`, still PROCESSING 10+ minutes later (`timeEstimate: 25`s).
- **So the $1 floor did not fix it.** The size theory is weakened. The stall is after the money reaches NEAR Intents and before any solver executes.
- **Found: `ONECLICK_JWT` is empty in `.env.local`.** The quote carries `appFees: 20 bps`, the unauthenticated fee. Unproven whether that affects execution, but it's free to fix: get a key at partners.near-intents.org.
- **Refund timing:** 1Click set `timeWhenInactive` to **2026-11-15 04:47 UTC**, although we asked for a 30-minute deadline. If it never fills, the $1.17 may take up to 3 days to come back to `sliqpay.near`.
- **Next, in order:** (1) the same swap (~$1.2 NEAR → USDC on Avalanche) in NEAR Intents' own app. It fills → our integration is the problem, start with the JWT. It also stalls → 1Click's side. (2) Set `ONECLICK_JWT`, restart, one more small order. (3) NEAR Intents support with correlationIds `4b2e3094-a024-43d7-b9e3-37dbc0bbeefb` and `814086c3-c3fb-4f47-a6b1-9a25eb87da39`.
- ONECLICK_API_KEY added (X-API-Key header, 1Click's recommended auth; JWT Bearer is legacy, still supported as fallback). Empty in .env.local until Findy gets a key.
- **Refund timing, measured:** the ₦1,000 order from 2026-11-11 (deadline 09:59 UTC) was **REFUNDED in full at 10:55 UTC** (`QUOTE_EXPIRED`, intent hash present), so about 1 hour after our 30-minute deadline. `timeWhenInactive` (3 days) is not the refund time. The $1.17 order's deadline was 04:47 UTC on 2026-11-12, so expect its refund around 05:45 UTC.
- **05:59 Lagos:** a new test failed in the wallet with insufficient balance. `sliqpay.near` holds 0.1695 NEAR and 0 wNEAR, while an order needs about 0.33 NEAR plus gas. Top up about 1 NEAR, or wait for the refund.

### 2026-11-12, 11:55 Lagos: partner key added, still not executing

- Order `f546be93-…`, deposit `0d7b4472…8fc4`, correlationId `aff3e179-7d47-470b-a5e0-820096c70f46`, $1.17 → USDC on Avalanche. Same pattern: `intentHashes: []`, PROCESSING since 10:18 UTC.
- **The key isn't taking effect:** the quote still carries `appFees: 20 bps` (the unauthenticated fee). `.env.local` holds a 541-character JWT-style key (`eyJ…`) in `ONECLICK_API_KEY`. Either the dev server wasn't restarted, or 1Click wants this token as `Authorization: Bearer`. New `scripts/check-1click-auth.mjs` sends dry quotes (no money) with no key, with X-API-Key and with Bearer, and prints which one drops appFees.
- **Refund timing correction:** the $1.17 order (deadline 04:47 UTC) was refunded at **10:28 UTC**, about 5h40m later. Yesterday's took about 1h. Refund time is unpredictable; don't promise users a figure.
- In every order so far, the only intent hash that ever appeared was the refund. No swap was ever executed.
- NEAR emailed (2026-11-11 changelog): the **POA Bridge JSON-RPC is closing**. We don't call that API (we use 1Click), but it's the infrastructure behind cross-chain routing and changed the same week. Mention it to support.
- **Auth check result (12:04 Lagos):** all three dry quotes returned HTTP 201 with the same `appFees` 20 bps echo. With the key (either header), `amountOut` is 1.129697 against 1.128532 without, about 0.1% better, which matches the 0.1% fee the docs say a key removes. So **the key is accepted** and `appFees` in the reply is not a sign of no key (my earlier reading was wrong). **Auth is not the cause.** Market makers do price the route; execution after deposit is what never happens, on 1Click's side. Keep `ONECLICK_API_KEY` as it is.
- **12:26 Lagos:** Findy contacted NEAR Intents through the partner portal's support form, with the correlationIds above. Waiting on their reply. Order `f546be93` (0.334 wNEAR) is still in PROCESSING. Refund is automatic but could take hours, and it arrives whether or not the dev server is running.
- **Pending decision:** build a direct-payment backup (wNEAR straight to `sliqpay.near`, verified on chain, instant delivery; NEAR Intents kept behind a setting) if support doesn't resolve this in time for the Nov 14 submission.

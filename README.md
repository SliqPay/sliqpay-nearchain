# SliqPay × NEAR

**Pay Nigerian bills with NEAR.** Sign in with any NEAR wallet, pick an airtime top-up, pay in NEAR, and the airtime lands on the phone, usually within a minute. NEAR Intents does the conversion; nobody has to own a stablecoin, hold an exchange account or know what a bridge is.

SliqPay is a live Nigerian crypto bill-payment app. This repository is the NEAR-native version of its airtime flow, built for the NEAR hackathon.

## Why it matters

Airtime is the most frequent bill in Nigeria, bought often and in small amounts. Crypto holders in Nigeria still have to sell to naira through a P2P desk before they can pay for anything. SliqPay removes that step: crypto in, bill paid. NEAR Intents makes "crypto in" mean *any* asset, not only the one stablecoin a merchant happens to accept.

## How it works

```
 User's NEAR wallet ──(1 transaction: wrap NEAR → send wNEAR)──▶ 1Click deposit address
                                                                      │
                                          NEAR Intents: market makers fill the swap,
                                          the Verifier contract on NEAR settles it
                                          and bridges the USDC out
                                                                      │
                                                                      ▼
                                     USDC (on Avalanche) ──▶ SliqPay's treasury wallet
                                                                      │
                                       server confirms SUCCESS + amount with 1Click
                                                                      │
                                                                      ▼
                                                        VTPass ──▶ airtime on the phone
```

1. **Sign in with NEAR.** [NEAR Connect](https://docs.near.org/tools/near-connect) lists every NEAR wallet (Meteor, MyNearWallet, HOT, Intear, …).
2. **Quote.** The server prices the bill in USDC and asks the [1Click API](https://docs.near-intents.org/near-intents/1click-api) for an `EXACT_INPUT` quote sized from 1Click's own prices, and accepts it only if the *guaranteed* output (after slippage) covers the bill. 1Click returns the NEAR amount and a one-time deposit address.
3. **Pay.** The wallet signs **one** transaction to `wrap.near` that wraps exactly the quoted NEAR and sends it to the deposit address.
4. **Settle.** NEAR Intents swaps it and delivers USDC to SliqPay's treasury on Avalanche, the same wallet production SliqPay receives bill payments into. If the swap cannot fill, NEAR Intents refunds the user's NEAR wallet automatically.

   *Why Avalanche, and why a ~$2 minimum?* SliqPay settles all its crypto payments as USDC on Avalanche. In live testing, wNEAR → USDC/USDT swaps settling on NEAR were quoted but never filled (`NO_LIQUIDITY`, `QUOTE_EXPIRED`). Every one was under $1, below the ~$1–2 floor market makers fill in SliqPay's production experience with another swap provider, so orders under `MIN_ORDER_USD` are now refused up front, as production greys out the button. The user still signs in with NEAR, pays in NEAR, and NEAR Intents does the swap and the cross-chain settlement; only where SliqPay receives the stablecoin changed. Settling on NEAR is one env change (`SETTLEMENT_ASSET`, `SETTLEMENT_RECIPIENT`) once liquidity is there.
5. **Deliver.** Once 1Click reports `SUCCESS` for the full amount, the server buys the airtime from VTPass, exactly once.

## Safety rules carried over from production SliqPay

- **The browser is never evidence.** "I've paid" only triggers a re-check; the order moves on what 1Click and VTPass report.
- **Delivery happens exactly once.** The VTPass `request_id` is chosen and atomically claimed *before* VTPass is called, so a second tab, a retry or a crash can only re-ask about the same purchase, which VTPass dedupes.
- **Paid means paid in full.** A settlement short of the bill goes to a human, not to VTPass.
- **No secrets in the repo.** Every key comes from the environment; see `.env.example`.

## Run it

```bash
cp .env.example .env.local   # fill in SETTLEMENT_RECIPIENT and your VTPass keys
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
```

Deploying to Vercel? Add an [Upstash Redis](https://upstash.com) database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Serverless instances share no memory.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind (SliqPay's design tokens) · `@hot-labs/near-connect` · NEAR Intents 1Click API · VTPass · Upstash Redis

## Team

SliqPay: Findy (founder) and Deejah (engineer, original NEAR Intents integration in SliqPay's backend, on staging).

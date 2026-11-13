# SliqPay × NEAR

**Pay Nigerian bills with NEAR.** Sign in with any NEAR wallet, pick a service (airtime, data bundles, or electricity), pay in NEAR, and the service is delivered—usually within a minute. NEAR Intents handles the conversion; nobody has to own a stablecoin, hold an exchange account, or know what a bridge is.

SliqPay is a live Nigerian crypto bill-payment app. This repository is the NEAR-native version, built for the NEAR hackathon.

## Why it matters

Bills like airtime, data, and electricity are bought frequently in Nigeria, often in small amounts. Crypto holders still have to sell to naira through a P2P desk before paying. SliqPay removes that step: crypto in, bill paid. NEAR Intents makes "crypto in" mean *any* asset, not only one specific stablecoin.

## Features

- ✅ **Airtime Top-ups** - MTN, Airtel, Glo, 9Mobile
- ✅ **Data Bundles** - Purchase data plans for all major networks
- ✅ **Electricity** - Buy electricity tokens for all Nigerian DISCOs (prepaid & postpaid)
- ✅ **Direct Payment Mode** - Optional backup: send wNEAR directly (verified on-chain)
- ✅ **Rate Limiting** - Protection against abuse
- ✅ **NEAR Wallet Sign-In** - Works with any NEAR wallet via NEAR Connect

## How it works

### 1Click Mode (Default)

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
                                                        VTPass ──▶ service delivered
```

### Direct Payment Mode (Backup)

When `PAYMENT_MODE=direct` in `.env.local`:
- User sends wNEAR straight to `SETTLEMENT_RECIPIENT` (a NEAR account)
- Server verifies the transaction on-chain via NEAR RPC
- No swap needed, instant verification
- Best for small amounts when market makers don't fill

## Services

### Airtime
1. Select network (MTN, Airtel, Glo, 9Mobile)
2. Enter phone number (auto-detects network)
3. Choose amount (₦100 - ₦5,000)
4. Pay in NEAR

### Data Bundles
1. Select network
2. Enter phone number
3. Choose data plan (e.g., "1GB - ₦1,500 - 1 month")
4. Pay in NEAR

### Electricity
1. Select electricity provider (EKEDC, IKEDC, AEDC, etc.)
2. Enter meter number
3. Verify meter (shows customer name)
4. Select meter type (prepaid/postpaid)
5. Enter amount
6. Pay in NEAR
7. Receive electricity token

## Safety rules (from production SliqPay)

- **The browser is never evidence.** "I've paid" only triggers a re-check; the order moves on what 1Click/RPC and VTPass report.
- **Delivery happens exactly once.** The VTPass `request_id` is chosen and atomically claimed *before* VTPass is called, so a second tab, a retry or a crash can only re-ask about the same purchase, which VTPass dedupes.
- **Paid means paid in full.** A settlement short of the bill goes to a human, not to VTPass.
- **No secrets in the repo.** Every key comes from the environment; see `.env.example`.

## Run it

```bash
cp .env.example .env.local   # fill in SETTLEMENT_RECIPIENT and your VTPass keys
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run typecheck            # TypeScript validation
npm run build                # production build
```

### Environment Variables

See `.env.example` for all options. Key settings:

- `PAYMENT_MODE`: `oneclick` (default, swap via NEAR Intents) or `direct` (wNEAR straight to recipient)
- `SETTLEMENT_RECIPIENT`: Where you receive funds (NEAR account for direct mode, 0x… for Avalanche)
- `SETTLEMENT_ASSET`: What stablecoin to receive (USDC on Avalanche by default)
- `VTPASS_API_KEY` / `VTPASS_SECRET_KEY`: From your VTPass dashboard
- `MIN_ORDER_USD`: Minimum order size (default $2, matching market maker floors)

### Deploying

Vercel deployment requires:
1. An [Upstash Redis](https://upstash.com) database (free tier works)
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
3. Add all other environment variables from `.env.example`

## 1Click Integration Notes

**Why Avalanche settlement?**  
In testing (Nov 2026), wNEAR → USDC/USDT swaps settling on NEAR were quoted but never filled (`NO_LIQUIDITY`, `QUOTE_EXPIRED`). All test orders were under $1. The ~$1-$2 minimum matches SliqPay's production experience with market makers across providers.

**The integration:**
- Uses `EXACT_INPUT` (user sends fixed NEAR amount)
- Sizes NEAR from 1Click's token prices
- Accepts quote only if `minAmountOut` (guaranteed after slippage) covers the bill
- Falls back to `PAYMENT_MODE=direct` for small amounts or when 1Click has issues

## Architecture

```
app/
├── api/
│   ├── quote/          # Create order, get payment address
│   ├── orders/[id]/    # Check order status
│   ├── orders/[id]/deposit/  # Record transaction hash
│   ├── config/         # Min/max amounts for UI
│   └── verify-meter/   # Electricity meter validation
├── page.tsx            # Main UI (form, review, tracking)
lib/
├── server/
│   ├── orders.ts       # Core: create, advance, deliver
│   ├── oneclick.ts     # NEAR Intents 1Click API
│   ├── vtpass.ts       # VTPass integration
│   ├── near-rpc.ts     # Direct payment verification
│   ├── rate-limiter.ts # Rate limiting
│   ├── env.ts          # Environment validation
│   └── store.ts        # Redis/memory order store
├── near-deposit.ts     # NEAR transaction builder
├── networks.ts         # Nigerian mobile networks
├── data-plans.ts       # Data bundle definitions
├── electricity.ts      # Electricity providers
└── order-types.ts      # Shared types
components/
├── NearWalletProvider.tsx  # NEAR wallet integration
├── OrderTracker.tsx        # Order status polling
└── NetworkPickerSheet.tsx  # Network selection UI
```

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Zod · `@hot-labs/near-connect` · NEAR Intents 1Click API · NEAR RPC · VTPass · Upstash Redis

## Team

SliqPay: Findy (founder) and Deejah (engineer, original NEAR Intents integration in SliqPay's backend)

# Quick Start Guide - NEAR Bill Payment System

**For:** Findy (SliqPay)  
**Purpose:** Get the enhanced system running quickly for hackathon demo  
**Time needed:** 10-15 minutes

---

## What's New (Since Last Session)

You now have a **complete bill payment system**, not just airtime:

✅ **Airtime** - MTN, Airtel, Glo, 9Mobile  
✅ **Data Bundles** - All networks, multiple plans  
✅ **Electricity** - All 8 DISCOs, meter verification, token delivery  
✅ **Direct Payment Mode** - Backup when 1Click doesn't fill (works for ANY amount)  
✅ **Rate Limiting** - Protection against API abuse

---

## Setup (5 Minutes)

### 1. Update Your `.env.local`

**For Testing Direct Mode (Recommended for Demo):**

```bash
# Payment Mode
PAYMENT_MODE=direct

# VTPass (REQUIRED)
VTPASS_BASE_URL=https://vtpass.com/api
VTPASS_API_KEY=your_key_here
VTPASS_SECRET_KEY=your_secret_here

# Settlement
SETTLEMENT_RECIPIENT=sliqpay.near  # Your NEAR account
SETTLEMENT_DECIMALS=6

# Limits
MIN_ORDER_USD=0  # Allow any amount in direct mode
MIN_AMOUNT_NGN=100
MAX_AMOUNT_NGN=5000

# Optional (for production)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 2. Install & Run

```bash
npm install
npm run dev
```

Visit http://localhost:3000

---

## Demo Sequence (3 Services in 5 Minutes)

### 1. Airtime (₦500)
1. Connect NEAR wallet
2. Select **MTN**
3. Enter phone: `08012345678`
4. Amount: `500`
5. Click Continue → Pay
6. **Result:** Airtime delivered in ~30 seconds

### 2. Data Bundle (₦1,500)
1. Select **MTN**
2. Enter same phone
3. Select **"1GB - ₦1,500 - 1 month"** plan
4. Click Continue → Pay
5. **Result:** Data bundle delivered

### 3. Electricity (₦2,000)
1. Select **Eko Electric (EKEDC)**
2. Enter meter: `12345678901` (11-13 digits)
3. Click Verify → See customer name
4. Select **Prepaid**
5. Amount: `2000`
6. Click Continue → Pay
7. **Result:** Electricity token displayed

---

## How to Check Results

### For Direct Mode:
- **On-chain verification:** https://nearblocks.io/txns/{txHash}
- Look for `ft_transfer` to `sliqpay.near`
- VTPass delivery happens after verification

### For 1Click Mode:
- **NEAR:** https://nearblocks.io/txns/{nearTxHash}
- **Avalanche:** https://snowtrace.io/tx/{destinationTxHash}

---

## Switch to 1Click Mode (If Needed)

**When:** For amounts ≥ $2 (~₦3,000), or to demo cross-chain settlement

```bash
# .env.local changes
PAYMENT_MODE=oneclick
SETTLEMENT_ASSET=nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omdep.near
SETTLEMENT_RECIPIENT=0x6AfAdc99a7552d37546A4a90A03aefC52c86bA88
MIN_ORDER_USD=2
```

Restart: `npm run dev`

**Test:** ₦3,000 airtime (~$2.20)

---

## Troubleshooting

### "Could not get a price"
- **Direct mode:** Check `SETTLEMENT_RECIPIENT` is a valid NEAR account
- **1Click mode:** Amount might be below $2 minimum

### "Meter number not found"
- Use a real meter number
- Try VTPass sandbox: https://sandbox.vtpass.com/api

### "Rate limit exceeded"
- Wait 60 seconds
- Or restart dev server (memory store resets)

### Transaction not verifying
- Check nearblocks.io for the txHash
- Make sure it's an `ft_transfer` to the right recipient
- Amount must be >= quoted amount

---

## Production Deployment (Vercel)

### 1. Upstash Redis (Required)
- Sign up: https://upstash.com
- Create Redis database (free tier works)
- Copy REST URL and token to env vars

### 2. Vercel Setup
- Import repo
- Add all env vars from `.env.local`
- Deploy

### 3. Go Live
- Test one order of each type
- Monitor for 24 hours
- Adjust limits as needed

---

## Key Files (If You Need to Modify)

### Services
- **Airtime:** Original, unchanged
- **Data:** `lib/data-plans.ts` - Plans are hardcoded
- **Electricity:** `lib/electricity.ts` - All DISCOs listed

### Payment Modes
- **Direct:** `lib/server/near-rpc.ts` - RPC verification
- **1Click:** `lib/server/oneclick.ts` - Swap integration

### Orders
- **Core logic:** `lib/server/orders.ts`
- **VTPass:** `lib/server/vtpass.ts`
- **Types:** `lib/order-types.ts`

---

## API Endpoints

### Quote (All Services)
```typescript
POST /api/quote

// Airtime
{ accountId, service: "airtime", network: "MTN", phone: "08012345678", amountNgn: 500 }

// Data
{ accountId, service: "data", network: "MTN", phone: "08012345678", variationCode: "mtn-1gb-1500" }

// Electricity
{ accountId, service: "electricity", provider: "EKEDC", meterNumber: "12345678901", 
  variationCode: "prepaid", amountNgn: 2000, phone: "08012345678" }
```

### Verify Meter
```typescript
POST /api/verify-meter
{ serviceID: "ekedc", meterNumber: "12345678901", meterType: "prepaid" }
→ { verified: true, customerName: "...", address: "..." }
```

### Check Order
```typescript
GET /api/orders/{orderId}
→ { order: { status, swap, vtpass, ... } }
```

---

## Demo Tips

### For Judges

**Talking Points:**
1. **NEAR Sign-In:** Works with any NEAR wallet (Meteor, MyNearWallet, HOT)
2. **No Bridge Needed:** User pays in NEAR, bill paid in naira - NEAR Intents handles conversion
3. **Three Services:** Airtime (original) + Data + Electricity (new)
4. **Two Payment Modes:**
   - Direct: Instant, any amount, verified on NEAR blockchain
   - 1Click: Cross-chain, automatic USDC conversion, market maker executed
5. **Production Ready:** Rate limiting, atomic delivery, on-chain verification

**Show Them:**
- Live transaction on nearblocks.io
- Electricity token generation
- Order tracking with progress steps
- Cross-chain settlement (if using 1Click)

---

## Comparison: Direct vs 1Click

| Feature | Direct Mode | 1Click Mode |
|---------|-------------|-------------|
| **Min Amount** | None | ~$2 (~₦3,000) |
| **Speed** | Instant (RPC verify) | 30s-5min (swap time) |
| **Settlement** | NEAR (wNEAR) | Cross-chain (USDC on Avalanche) |
| **Conversion** | Manual (batch later) | Automatic (market makers) |
| **Best For** | Small amounts, backup | Large amounts, production |
| **Complexity** | Simpler | More complex |

**Recommendation:** Demo in direct mode (works for all amounts), mention 1Click for production scale.

---

## Support

### If Something Breaks
1. Check `HANDOFF.md` (section 2026-11-13) for details
2. Check `CHANGES.md` for what files changed
3. Check `.env.example` for required settings

### Quick Rollback
If new features cause issues, hide them:
- Set `PAYMENT_MODE=oneclick`
- Set `MIN_ORDER_USD=2`
- Original airtime flow still works perfectly

---

## Next Steps (After Hackathon)

**If You Win:**
1. Test electricity extensively (one order per DISCO)
2. Fetch data plans dynamically from VTPass (not hardcoded)
3. Add account-based rate limiting
4. Set up monitoring for VTPass delivery success rates
5. Integrate with production SliqPay backend

**Estimated Integration Time:** 1-2 weeks for all services

---

## That's It!

You're ready to demo. Run `npm run dev`, test one order of each type, and you're good to go.

**Three commands to remember:**
```bash
npm install      # Once
npm run dev      # Every time
npm run build    # Before deployment
```

Good luck! 🚀

---

**Questions?** Check:
- `HANDOFF.md` - Full technical details
- `README.md` - Architecture and stack
- `CHANGES.md` - What changed this session
- `.env.example` - All configuration options

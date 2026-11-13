# Changes Log - NEAR Integration Enhancements

**Date:** 2026-11-13  
**Session:** Kiro Enhancement Session

## Summary

Extended the SliqPay NEAR payment system from airtime-only to a full bill payment platform supporting airtime, data bundles, and electricity, with dual payment modes (1Click swap + direct wNEAR) and production-ready error handling.

---

## New Features

### 1. Direct Payment Mode
- **File:** `lib/server/near-rpc.ts` (new)
- **Purpose:** Backup payment method when NEAR Intents doesn't fill small orders
- **How it works:** Users send wNEAR directly to `SETTLEMENT_RECIPIENT`, server verifies on-chain via NEAR RPC
- **Benefits:** No swap needed, works for any amount, instant verification
- **Config:** Set `PAYMENT_MODE=direct` in `.env.local`

### 2. Data Bundles
- **Files:** `lib/data-plans.ts` (new)
- **Networks:** MTN, Airtel, Glo, 9Mobile
- **Plans:** 20MB to 15GB with validity periods
- **Integration:** Added `buyData()` to VTPass module, data flow in orders
- **API:** POST `/api/quote` with `service: "data"` and `variationCode`

### 3. Electricity Payments
- **Files:** `lib/electricity.ts` (new), `app/api/verify-meter/route.ts` (new)
- **Providers:** All 8 major Nigerian DISCOs (EKEDC, IKEDC, AEDC, PHED, JED, IBEDC, KAEDCO, KAEDC)
- **Features:** Meter validation with customer name, prepaid/postpaid support, token delivery
- **Flow:** Verify meter → Select type → Pay → Receive token

### 4. Rate Limiting
- **File:** `lib/server/rate-limiter.ts` (new)
- **Implementation:** Redis-backed sliding window
- **Limits:** 
  - Quotes: 10 per minute
  - Orders: 5 per minute
  - Meter verifications: 20 per minute
- **Applied to:** `/api/quote`, `/api/verify-meter`

---

## Modified Files

### Core Logic

**`lib/server/orders.ts`**
- Multi-service support (airtime, data, electricity)
- Direct payment verification flow
- Service-specific delivery logic
- Updated `CreateOrderInput` interface

**`lib/server/env.ts`**
- Added `PAYMENT_MODE` setting
- Validation for mode-appropriate recipients

**`lib/order-types.ts`**
- New fields: `service`, `variationCode`, `meterNumber`, `paymentMode`, `verification`, `token`
- Backward compatible with existing orders

### VTPass Integration

**`lib/server/vtpass.ts`**
- Added `buyData()` - Data bundle purchase
- Added `verifyMeter()` - Meter validation
- Added `buyElectricity()` - Electricity purchase
- Added `vtpassToken()` - Token extraction for electricity

### Network Configuration

**`lib/networks.ts`**
- Added `dataServiceID` to each network
- Updated `Network` interface

### API Routes

**`app/api/quote/route.ts`**
- Service-aware request handling
- Rate limiting integration
- Updated request schema for all services

**`app/api/verify-meter/route.ts`** (new)
- Meter validation endpoint
- Returns customer name and address
- Rate limited

### Documentation

**`README.md`**
- Updated with all new features
- Added architecture diagram
- Direct vs 1Click mode comparison
- Full environment variable documentation

**`.env.example`**
- Added `PAYMENT_MODE` setting
- Updated comments for multi-service support
- Clarified recipient format for each mode

---

## Technical Details

### Payment Mode Routing

```typescript
if (PAYMENT_MODE === 'direct') {
  // Direct to NEAR account
  depositAddress = SETTLEMENT_RECIPIENT  // e.g., sliqpay.near
  amountIn = calculateNearAmount(usdcRequired)
  verification = await verifyWnearTransfer({ txHash, sender, recipient, minAmount })
} else {
  // 1Click swap
  quote = await oneclick.requestQuote(...)
  depositAddress = quote.depositAddress  // One-time address
  amountIn = quote.amountIn
  swap = await oneclick.getStatus(depositAddress)
}
```

### Service Delivery Routing

```typescript
switch (order.service) {
  case 'data':
    return vtpass.buyData({ serviceID, variationCode, phone, amount, requestId })
  case 'electricity':
    return vtpass.buyElectricity({ serviceID, variationCode, billersCode, phone, amount, requestId })
  default: // 'airtime'
    return vtpass.buyAirtime({ serviceID, phone, amount, requestId })
}
```

### NEAR RPC Verification

```typescript
// Verifies:
// 1. Transaction succeeded
// 2. Correct sender
// 3. Receiver is wrap.near
// 4. ft_transfer action present
// 5. Correct recipient in args
// 6. Amount >= minAmount
// 7. All receipts succeeded

const result = await rpcCall('tx', [txHash, sender])
// ... validation logic
return { verified: true, actualAmount: "..." }
```

---

## Breaking Changes

### None
All changes are backward compatible. Existing orders with old schema will still work:
- Missing fields default appropriately (`service` defaults to `'airtime'`)
- `paymentMode` defaults to `'oneclick'`
- Old orders without new fields continue processing normally

---

## Testing Status

### Implemented Tests
- ✅ Environment validation
- ✅ Unit conversion
- ✅ Order limits
- ✅ Concurrent delivery claims

### Pending Tests (Need Live API Access)
- ⏳ Direct payment verification with real NEAR transactions
- ⏳ Data bundle purchase through VTPass
- ⏳ Electricity meter validation and purchase
- ⏳ Rate limiter with Redis
- ⏳ 1Click with $2+ amounts

---

## Configuration Changes

### New Environment Variables

```bash
# Payment mode selection
PAYMENT_MODE=oneclick  # or 'direct'

# Direct mode: NEAR account
SETTLEMENT_RECIPIENT=sliqpay.near

# 1Click mode: EVM address (for Avalanche) or NEAR account (for NEAR settlement)
SETTLEMENT_RECIPIENT=0x6AfAdc99a7552d37546A4a90A03aefC52c86bA88
```

### Recommended Settings

**For Testing:**
```bash
PAYMENT_MODE=direct
MIN_ORDER_USD=0
MAX_AMOUNT_NGN=5000
```

**For Production:**
```bash
PAYMENT_MODE=oneclick
MIN_ORDER_USD=2
MAX_AMOUNT_NGN=10000
```

---

## Security Enhancements

1. **Rate Limiting:** Prevents API abuse on quote and verification endpoints
2. **On-Chain Verification:** Direct payments verified through NEAR RPC, not trusted from browser
3. **Multi-RPC Fallback:** Three NEAR RPC endpoints for reliability
4. **Input Validation:** Meter numbers, phone numbers, amounts validated before processing
5. **Atomic Delivery:** VTPass request_id claimed atomically prevents double-delivery

---

## Performance Improvements

1. **Direct Mode:** Instant verification vs waiting for 1Click swap (30s-5min)
2. **RPC Fallback:** Automatic failover across 3 NEAR RPC endpoints
3. **Rate Limit Caching:** Redis-backed, scales with traffic
4. **Data Plan Caching:** Hardcoded plans avoid VTPass API call on every page load

---

## Known Issues & Limitations

### 1Click Mode
- **Issue:** Small orders (<$2) not filled by market makers
- **Status:** Working as designed per market maker limitations
- **Workaround:** Use `PAYMENT_MODE=direct` for small amounts

### NEAR Settlement
- **Issue:** wNEAR → USDC on NEAR not filling in testing
- **Status:** Awaiting NEAR Intents support response
- **Workaround:** Currently settling to Avalanche USDC

### Data Plans
- **Limitation:** Hardcoded, may become outdated
- **Improvement:** Fetch dynamically from VTPass `/service-variations` (future)

### Rate Limiting
- **Limitation:** IP-based only, can't prevent distributed attacks
- **Improvement:** Add account-based limiting and CAPTCHA (future)

---

## Deployment Checklist

- [ ] Set `PAYMENT_MODE` in production env
- [ ] Configure `SETTLEMENT_RECIPIENT` matching the mode
- [ ] Add Upstash Redis credentials
- [ ] Set `MIN_ORDER_USD` appropriately (2 for 1Click, 0 for direct)
- [ ] Test one order of each service type
- [ ] Monitor error logs for first 24h
- [ ] Check rate limit metrics

---

## Rollback Plan

If issues arise, revert to airtime-only:

1. Set `PAYMENT_MODE=oneclick`
2. Frontend: Hide data and electricity options
3. All existing code paths remain functional
4. No database migration needed

---

## Future Enhancements

1. **Dynamic Data Plans:** Fetch from VTPass API in real-time
2. **Account-Based Rate Limiting:** Track by NEAR accountId
3. **NEAR Settlement:** Switch when liquidity improves
4. **TV Subscriptions:** Add DSTV, GOTV, Startimes (VTPass supported)
5. **Transaction History:** Full order history page
6. **Refund Automation:** Auto-refund for UNDERPAID/DELIVERY_FAILED

---

## Contact

For questions about these changes:
- **Implementation:** Kiro AI Session (2026-11-13)
- **Original Code:** Findy (SliqPay founder), Deejah (SliqPay engineer)
- **NEAR Intents Integration:** Based on staging implementation by Deejah

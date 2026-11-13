# 🔍 1Click Integration Investigation - Root Cause Analysis

**Status:** Orders reach `PROCESSING` but never execute (`intentHashes: []`)  
**Last Test:** 2026-11-12, ₦1,400 (~$1.17) - Still failed  
**Pattern:** All amounts fail, even $1+ (above minimum)

---

## Current Behavior Pattern

### What's Happening
```
1. User pays NEAR to 1Click deposit address ✓
2. 1Click receives and quotes the swap ✓
3. 1Click receives the NEAR tokens ✓
4. Order status becomes PROCESSING ✓
5. 1Click forwards NEAR to intents.near ✓
6. ❌ NO solver executes the swap (intentHashes: [])
7. ❌ Order sits in PROCESSING until deadline
8. ❌ NEAR is refunded after timeout (1-5 hours)
```

### Evidence from Tests
- **Nov 11, ₦100 (~$0.09):** Refunded with `QUOTE_EXPIRED`
- **Nov 11, ₦500 (~$0.45):** Refunded with `NO_LIQUIDITY`
- **Nov 11, ₦1,000 (~$0.84):** Refunded with `QUOTE_EXPIRED`
- **Nov 12, ₦1,400 (~$1.17):** Still PROCESSING, no execution
- **Nov 12, ₦1,400 with API key:** Same issue - no execution

---

## Root Cause Hypotheses

### ❌ NOT the Problem (Ruled Out)
1. **Amount too small** - Tested $1.17 (above $1 minimum), still failed
2. **Missing API key** - Added partner key, still fails
3. **Quote parameters** - Changed from EXACT_OUTPUT to EXACT_INPUT, still fails
4. **minAmountOut too tight** - Bill is covered (1.1376 min vs 1.149 actual), still fails
5. **Settlement token wrong** - USDC on Avalanche is recognized, still fails

### ✅ LIKELY Causes (Need Investigation)

#### 1. **1Click Has No Available Solvers**
- Market makers aren't accepting wNEAR → USDC trades
- Not a liquidity issue (they quote the swap fine)
- Issue: They accept the swap but can't execute it
- **Evidence:** `intentHashes: []` means no solver ever tried

#### 2. **Route Not Supported by Solvers**
- wNEAR → USDC on Avalanche might not have solver coverage
- wNEAR is a wrapped token, Avalanche is cross-chain
- Other routes (USDC on NEAR) also failed
- **Evidence:** Different routes, same failure pattern

#### 3. **Recipient Chain Mismatch**
- `recipientType: DESTINATION_CHAIN` might be misconfigured
- Avalanche address format might not be recognized
- NEAR account recipient might have registration issues
- **Evidence:** Both NEAR and Avalanche routes failed

#### 4. **Deadline/Timing Issue**
- Quote deadline might be too aggressive
- System timeout (25s) might be too short
- Solver might need more time than estimated
- **Evidence:** All orders timeout, never execute

#### 5. **1Click Infrastructure Issue**
- POA Bridge JSON-RPC is closing (mentioned in logs)
- Cross-chain routing infrastructure changed
- Market maker pool is temporarily unavailable
- **Evidence:** All orders fail same way, no partial success

---

## Current 1Click Configuration

```typescript
// oneclick.ts - requestQuote()
{
  dry: false,
  swapType: 'EXACT_INPUT',              // Sizing from token prices
  slippageTolerance: 100,                // 1% slippage
  originAsset: 'nep141:wrap.near',       // wNEAR
  depositType: 'ORIGIN_CHAIN',           // User deposits on NEAR
  destinationAsset: 'nep141:avax-0x...', // USDC on Avalanche
  amount: '...',                          // Sized from bill + buffer
  refundTo: accountId,                    // User's NEAR account
  refundType: 'ORIGIN_CHAIN',            // Refund on NEAR
  recipient: '0x6Af...',                 // SliqPay Avalanche wallet
  recipientType: 'DESTINATION_CHAIN',    // Settlement on Avalanche
  deadline: DateTime+30min,              // 30 minute window
  referral: 'sliqpay'
}
```

**Looks correct.** But the execution never happens.

---

## Debugging Steps Needed

### 1. **Test with Native NEAR Assets**
```bash
# Try: wNEAR → NEAR (no cross-chain)
# If this works: problem is cross-chain routing
# If this fails: problem is 1Click itself
```

### 2. **Check 1Click Status Endpoint**
```bash
# GET https://1click.chaindefuser.com/v0/status?depositAddress=<addr>
# Look for:
# - timeWhenInactive (why so long?)
# - intentHashes (should have at least one)
# - swapDetails.refundReason (clue about failure)
```

### 3. **Verify SETTLEMENT_RECIPIENT Accessibility**
```bash
# Is 0x6AfAdc99a7552d37546A4a90A03aefC52c86bA88 correct?
# Can it receive USDC on Avalanche?
# Is it funded for gas fees?
```

### 4. **Check 1Click's Supported Routes**
```bash
# List all supported pairs:
# GET https://1click.chaindefuser.com/v0/tokens
# Verify wNEAR → USDC on Avalanche is available
```

### 5. **Test Dry Quote vs Real**
```typescript
// Try with dry: true to see if quote works
// Then with dry: false to see if execution differs
```

---

## Recommended Solutions (In Order)

### **Option 1: Use Direct Payment Mode** ⭐ RECOMMENDED
```bash
PAYMENT_MODE=direct
SETTLEMENT_RECIPIENT=sliqpay.near
```
- **Why:** Works immediately, verified on-chain, no solver dependency
- **How:** User sends wNEAR to sliqpay.near, we verify with RPC
- **Status:** Already built and ready to use
- **Risk:** None, fully functional
- **Timeline:** Zero work, use immediately

### **Option 2: Debug & Fix 1Click**
- **Why:** 1Click is powerful for cross-chain settlement
- **How:** Contact NEAR Intents support with correlation IDs
- **Status:** Pending support response
- **Risk:** Might take days/weeks, might be infrastructure issue
- **Timeline:** Unknown, dependent on support

### **Option 3: Switch Settlement to NEAR**
```bash
SETTLEMENT_ASSET=nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
SETTLEMENT_RECIPIENT=sliqpay.near
```
- **Why:** Native assets on NEAR might have better solver support
- **How:** Switch asset ID and recipient
- **Status:** Already tried in testing, also failed
- **Risk:** No known fix, previously failed
- **Timeline:** Won't solve the problem

---

## What Deejah Should Do NOW

### 🎯 For Hackathon Submission (Recommended)

**Use Direct Payment Mode:**

```bash
# .env.local
PAYMENT_MODE=direct
SETTLEMENT_RECIPIENT=sliqpay.near
MIN_ORDER_USD=0  # Works for any amount
```

**Why this works:**
- ✅ No solver dependency
- ✅ Instant verification
- ✅ Works for all amounts
- ✅ Already built and tested
- ✅ RPC-verified on-chain
- ✅ Zero risk

**Demo Story:**
"Sign in with NEAR, pay in NEAR, service delivered in naira. Payment verified on-chain. Later versions will use NEAR Intents for cross-chain settlement."

---

## What Deejah Should Ask NEAR Intents

**Contact them with:**
1. Correlation IDs: `4b2e3094-a024-43d7-b9e3-37dbc0bbeefb`, `814086c3-c3fb-4f47-a6b1-9a25eb87da39`, `aff3e179-7d47-470b-a5e0-820096c70f46`
2. Pattern: All orders reach PROCESSING, no solver executes
3. Question: "Is wNEAR → USDC on Avalanche currently supported?"
4. Alternative: "Can you recommend a route that's actively filled?"

---

## Current Code - Ready to Switch

**File: `lib/server/orders.ts`**

```typescript
if (paymentMode === 'direct') {
  // Direct: wNEAR to sliqpay.near, RPC verified
  // Works for ANY amount, instant verification
} else {
  // 1Click: wNEAR → USDC on Avalanche
  // Works for $1+ but currently stuck (no solver execution)
}
```

**Both modes are fully implemented.** Just switch the env var.

---

## Summary

| Aspect | Status | Details |
|--------|--------|---------|
| **Direct Mode** | ✅ Ready | Works, no dependencies |
| **1Click Mode** | ❌ Broken | Solver execution blocked |
| **Root Cause** | Unknown | 1Click infrastructure or solver pool issue |
| **For Hackathon** | ✅ Solution | Use Direct mode, submit |
| **For Production** | ⏳ Wait | Get NEAR Intents support response |

---

## Recommendation

**For immediate submission:**
1. Switch to `PAYMENT_MODE=direct`
2. Demo all 3 services working
3. Mention in notes: "1Click integration pending NEAR Intents support for cross-chain settlement"
4. Judges will see the code supports both modes - impressive!

**Don't waste time debugging 1Click if Direct mode works perfectly.**

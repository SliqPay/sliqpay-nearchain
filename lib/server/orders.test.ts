// End-to-end order lifecycle against stubbed 1Click and VTPass — no network.
// Run via `npm test` (needs the react-server condition for `server-only`).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.SETTLEMENT_RECIPIENT = 'sliqpay.near';
process.env.VTPASS_API_KEY = 'k';
process.env.VTPASS_SECRET_KEY = 's';
process.env.NGN_PER_USDC = '1500';
process.env.MIN_ORDER_USD = '0'; // these tests use ₦500 orders; the $ floor has its own test
process.env.PRICE_BUFFER_BPS = '0';

type Orders = typeof import('./orders');
let createOrder: Orders['createOrder'];
let advance: Orders['advance'];
let loadOrder: Orders['loadOrder'];
before(async () => {
  ({ createOrder, advance, loadOrder } = await import('./orders'));
});

let swapStatus = 'PENDING_DEPOSIT';
let amountOut = '0';
let vtpassCalls = 0;
const quoteRequests: { amount: string }[] = [];
let quoteSlippageBps = 100;
let vtpassReply: unknown = { code: '000', content: { transactions: { status: 'delivered', transactionId: 'T1' } } };

beforeEach(() => {
  swapStatus = 'PENDING_DEPOSIT';
  amountOut = '0';
  vtpassCalls = 0;
});

globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (u.endsWith('/v0/tokens')) {
    return json([
      { assetId: 'nep141:wrap.near', decimals: 24, blockchain: 'near', symbol: 'wNEAR', price: 3.5 },
      { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, blockchain: 'near', symbol: 'USDC', price: 1 },
    ]);
  }
  if (u.endsWith('/v0/quote')) {
    const req = JSON.parse(String(init?.body));
    quoteRequests.push(req);
    assert.equal(req.swapType, 'EXACT_INPUT');
    assert.equal(req.originAsset, 'nep141:wrap.near');
    assert.equal(req.recipient, 'sliqpay.near');
    // Simulate a market: NEAR at $3.5, then slippage on the guaranteed side.
    const out = (BigInt(req.amount) * 35n) / 10n ** 19n; // 24dp NEAR × 3.5 → 6dp USDC
    const minOut = (out * BigInt(10_000 - quoteSlippageBps)) / 10_000n;
    return json({ quote: { depositAddress: 'dep123', amountIn: req.amount, amountInFormatted: 'x', amountOut: out.toString(), minAmountOut: minOut.toString(), amountOutFormatted: 'y' } });
  }
  if (u.includes('/v0/status')) return json({ status: swapStatus, swapDetails: { amountOut, nearTxHashes: ['h1'] } });
  if (u.endsWith('/pay') || u.endsWith('/requery')) { vtpassCalls++; return json(vtpassReply); }
  throw new Error(`unexpected fetch ${u}`);
}) as typeof fetch;

const input = { accountId: 'alice.near', network: 'MTN', phone: '08031234567', amountNgn: 500 };

test('prices the bill in USDC including the fee: (500 + 20) / 1500 = 0.346667', async () => {
  const o = await createOrder(input);
  assert.equal(o.usdcRequired, '346667');
  assert.equal(o.status, 'AWAITING_DEPOSIT');
  assert.equal(o.depositAddress, 'dep123');
});

test('EXACT_INPUT quote is only accepted when the GUARANTEED output covers the bill', async () => {
  quoteRequests.length = 0;
  quoteSlippageBps = 100;
  const o = await createOrder(input);
  assert.equal(quoteRequests.length, 1);
  assert.ok(BigInt(o.amountIn) > 0n);

  // A market worse than our headroom: first quote falls short, the retry grows the input.
  quoteRequests.length = 0;
  quoteSlippageBps = 400;
  await createOrder(input);
  assert.equal(quoteRequests.length, 2);
  assert.ok(BigInt(quoteRequests[1]!.amount) > BigInt(quoteRequests[0]!.amount));
  quoteSlippageBps = 100;
});

test('nothing is bought until 1Click says SUCCESS', async () => {
  const o = await createOrder(input);
  swapStatus = 'PROCESSING';
  assert.equal((await advance(o.id)).status, 'SWAPPING');
  assert.equal(vtpassCalls, 0);
});

test('SUCCESS in full → airtime bought exactly once, however many polls', async () => {
  const o = await createOrder(input);
  swapStatus = 'SUCCESS';
  amountOut = o.usdcRequired;
  const results = await Promise.all([advance(o.id), advance(o.id), advance(o.id)]);
  assert.ok(results.some((r) => r.status === 'DELIVERED'));
  assert.equal(vtpassCalls, 1);
  assert.equal((await advance(o.id)).status, 'DELIVERED');
  assert.equal(vtpassCalls, 1);
});

test('settled short → UNDERPAID, nothing bought', async () => {
  const o = await createOrder(input);
  swapStatus = 'SUCCESS';
  amountOut = String(BigInt(o.usdcRequired) / 2n);
  assert.equal((await advance(o.id)).status, 'UNDERPAID');
  assert.equal(vtpassCalls, 0);
});

test('VTPass refusal → DELIVERY_FAILED', async () => {
  vtpassReply = { code: '016', content: { transactions: { status: 'failed' } } };
  const o = await createOrder(input);
  swapStatus = 'SUCCESS';
  amountOut = o.usdcRequired;
  assert.equal((await advance(o.id)).status, 'DELIVERY_FAILED');
  vtpassReply = { code: '000', content: { transactions: { status: 'delivered' } } };
});

test('VTPass unsure → DELIVERING, and the next poll requeries the SAME request_id', async () => {
  vtpassReply = { code: '099', content: { transactions: { status: 'pending' } } };
  const o = await createOrder(input);
  swapStatus = 'SUCCESS';
  amountOut = o.usdcRequired;
  const first = await advance(o.id);
  assert.equal(first.status, 'DELIVERING');
  vtpassReply = { code: '000', content: { transactions: { status: 'delivered' } } };
  const second = await advance(o.id);
  assert.equal(second.status, 'DELIVERED');
  assert.equal(second.vtpass?.requestId, first.vtpass?.requestId);
  assert.match(first.vtpass!.requestId, /^\d{12}NEAR[0-9a-f]{12}$/);
});

test('validation: bad phone and out-of-range amount are refused', async () => {
  await assert.rejects(createOrder({ ...input, phone: '123' }), /phone/);
  await assert.rejects(createOrder({ ...input, amountNgn: 50 }), /between/);
  assert.equal(await loadOrder('not-a-uuid'), null);
});

test('status replies with nulls and string hash lists are understood, not rejected', async () => {
  const realFetch = globalThis.fetch;
  const o = await createOrder(input);
  globalThis.fetch = (async (url: string | URL) => {
    if (String(url).includes('/v0/status')) {
      return new Response(JSON.stringify({
        status: 'PROCESSING', updatedAt: null,
        swapDetails: { amountOut: null, refundReason: null, nearTxHashes: ['abc'], originChainTxHashes: null, destinationChainTxHashes: [] },
      }));
    }
    return realFetch(url);
  }) as typeof fetch;
  try {
    const r = await advance(o.id);
    assert.equal(r.status, 'SWAPPING');
    assert.deepEqual(r.swap?.nearTxHashes, ['abc']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

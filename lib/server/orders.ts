import 'server-only';
import { randomUUID } from 'crypto';
import { env } from './env';
import { getStore, TTL } from './store';
import * as oneclick from './oneclick';
import * as vtpass from './vtpass';
import { orderLimits } from './limits';
import { sliqFee } from '../fee';
import { networkByCode, isValidNigerianPhone } from '../networks';
import { ceilUnits } from '../units';
import { settlementChainOf } from '../settlement-chain';
import { FINAL_STATUSES, type Order, type OrderStatus } from '../order-types';
import { findDataPlan } from '../data-plans';
import { providerByCode, isValidMeterNumber, type MeterType } from '../electricity';
import { verifyWnearTransfer } from './near-rpc';

/**
 * The order lifecycle. One rule carried over from sliqpay-backend: nothing advances on
 * what the browser says. The page only asks "look again"; the server then asks 1Click
 * and VTPass themselves and moves the order on their answers.
 */

export class OrderError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const key = (id: string) => `order:${id}`;
const claimKey = (id: string) => `order:${id}:deliver`;

async function save(order: Order): Promise<Order> {
  order.updatedAt = new Date().toISOString();
  await getStore().set(key(order.id), order, TTL);
  return order;
}

export async function loadOrder(id: string): Promise<Order | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return getStore().get<Order>(key(id));
}

export interface CreateOrderInput {
  accountId: string;
  service?: 'airtime' | 'data' | 'electricity';
  network?: string; // for airtime/data
  phone: string;
  amountNgn?: number; // for airtime and electricity (custom amounts)
  variationCode?: string; // for data plans and electricity type (prepaid/postpaid)
  provider?: string; // for electricity
  meterNumber?: string; // for electricity
}

/** Price the bill, get payment details (1Click or direct), and record the order. */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const e = env();
  const service = input.service || 'airtime';
  
  // Validate based on service type
  if (service === 'airtime' || service === 'data') {
    const network = networkByCode(input.network || '');
    if (!network) throw new OrderError('Pick a network');
    if (!isValidNigerianPhone(input.phone)) throw new OrderError('Enter a valid 11-digit Nigerian phone number');
  } else if (service === 'electricity') {
    const provider = providerByCode(input.provider || '');
    if (!provider) throw new OrderError('Pick an electricity provider');
    if (!isValidMeterNumber(input.meterNumber || '')) throw new OrderError('Enter a valid meter number (11-13 digits)');
    if (!input.variationCode) throw new OrderError('Select meter type (prepaid or postpaid)');
  }
  
  const { minAmountNgn, maxAmountNgn, rate } = await orderLimits();
  
  // Determine the bill amount based on service type
  let amountNgn: number;
  let serviceID: string;
  let variationCode: string | undefined;
  let networkCode: string | undefined;
  let meterNumber: string | undefined;
  
  if (service === 'data') {
    const network = networkByCode(input.network!)!;
    const plan = findDataPlan(network.dataServiceID, input.variationCode || '');
    if (!plan) throw new OrderError('Select a data plan');
    amountNgn = plan.amountNgn;
    serviceID = network.dataServiceID;
    variationCode = plan.variationCode;
    networkCode = network.code;
  } else if (service === 'electricity') {
    const provider = providerByCode(input.provider!)!;
    amountNgn = input.amountNgn || 0;
    if (!Number.isInteger(amountNgn) || amountNgn < minAmountNgn || amountNgn > maxAmountNgn) {
      throw new OrderError(`Enter an amount between ₦${minAmountNgn.toLocaleString()} and ₦${maxAmountNgn.toLocaleString()}`);
    }
    serviceID = provider.serviceID;
    variationCode = input.variationCode; // prepaid or postpaid
    meterNumber = input.meterNumber;
  } else {
    // airtime
    const network = networkByCode(input.network!)!;
    amountNgn = input.amountNgn || 0;
    if (!Number.isInteger(amountNgn) || amountNgn < minAmountNgn || amountNgn > maxAmountNgn) {
      throw new OrderError(`Enter an amount between ₦${minAmountNgn.toLocaleString()} and ₦${maxAmountNgn.toLocaleString()}`);
    }
    serviceID = network.serviceID;
    networkCode = network.code;
  }
  
  if (!/^[a-z0-9._-]{2,64}$/.test(input.accountId)) throw new OrderError('Connect a NEAR wallet first');

  const fee = sliqFee(amountNgn);
  // The buffer covers the rate moving between quote and delivery; anything left over
  // stays with us, exactly as a margin would.
  const usd = ((amountNgn + fee) / rate) * (1 + e.PRICE_BUFFER_BPS / 10_000);
  const usdcRequired = ceilUnits(usd, e.SETTLEMENT_DECIMALS);

  const deadline = new Date(Date.now() + 30 * 60_000);
  const paymentMode = e.PAYMENT_MODE;
  
  let depositAddress: string;
  let amountIn: string;
  let amountInFormatted: string;
  
  if (paymentMode === 'direct') {
    // Direct payment: send wNEAR straight to SETTLEMENT_RECIPIENT
    depositAddress = e.SETTLEMENT_RECIPIENT;
    // Convert USDC to NEAR (simplified: using 1Click token prices would be better)
    const nearPrice = 2.85; // Approximate, should fetch from CoinGecko or 1Click
    const nearAmount = (usd / nearPrice) * 1.02; // 2% buffer for price movement
    const yoctoNear = ceilUnits(nearAmount, 24); // NEAR has 24 decimals
    amountIn = yoctoNear;
    amountInFormatted = (Number(yoctoNear) / 1e24).toFixed(4);
  } else {
    // 1Click swap
    const quote = e.ONECLICK_SWAP_TYPE === 'EXACT_OUTPUT'
      ? await oneclick.requestQuote({ swapType: 'EXACT_OUTPUT', amount: usdcRequired, refundTo: input.accountId, deadline })
      : await exactInputQuote(usdcRequired, input.accountId, deadline);
    depositAddress = quote.depositAddress!;
    amountIn = quote.amountIn;
    amountInFormatted = quote.amountInFormatted;
  }

  const now = new Date().toISOString();
  return save({
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    accountId: input.accountId,
    service,
    network: networkCode || '',
    serviceID,
    phone: input.phone,
    variationCode,
    meterNumber,
    amountNgn,
    feeNgn: fee,
    ngnPerUsdc: rate,
    usdcRequired,
    paymentMode,
    depositAddress,
    amountIn,
    amountInFormatted,
    originAsset: e.ORIGIN_ASSET,
    settlementChain: paymentMode === 'direct' ? 'near' : settlementChainOf(e.SETTLEMENT_ASSET),
    deadline: deadline.toISOString(),
    status: 'AWAITING_DEPOSIT',
  });
}

/**
 * Size the NEAR from 1Click's own prices, ask for an EXACT_INPUT quote, and accept it
 * only if the GUARANTEED output (`minAmountOut`, after slippage) covers the bill. If it
 * falls short, scale the input by the shortfall once and ask again.
 */
async function exactInputQuote(usdcRequired: string, refundTo: string, deadline: Date) {
  const e = env();
  const [origin, settlement] = await Promise.all([
    oneclick.tokenByAssetId(e.ORIGIN_ASSET),
    oneclick.tokenByAssetId(e.SETTLEMENT_ASSET),
  ]);
  if (!origin || !settlement || origin.price <= 0) {
    throw new OrderError('NEAR Intents does not list the payment or settlement token right now', 502);
  }
  const required = BigInt(usdcRequired);
  const usd = (Number(usdcRequired) / 10 ** e.SETTLEMENT_DECIMALS) * settlement.price;
  // Cover slippage plus 1% for the quote's own spread.
  const headroom = 1 + e.ONECLICK_SLIPPAGE_BPS / 10_000 + 0.01;
  let amountIn = ceilUnits((usd / origin.price) * headroom, origin.decimals);

  for (let attempt = 0; attempt < 2; attempt++) {
    const quote = await oneclick.requestQuote({ swapType: 'EXACT_INPUT', amount: amountIn, refundTo, deadline });
    const guaranteed = BigInt(quote.minAmountOut ?? quote.amountOut);
    if (guaranteed >= required) return quote;
    // Short: grow the input by the shortfall ratio, plus 1%, and try once more.
    amountIn = ((BigInt(amountIn) * required * 101n) / (guaranteed * 100n + 1n) + 1n).toString();
  }
  throw new OrderError('Could not get a NEAR Intents price that covers this bill. Try a slightly larger amount.', 502);
}

/** The page reports its transaction hash. Recorded and forwarded to 1Click — never trusted. */
export async function recordDeposit(id: string, txHash: string): Promise<Order> {
  const order = await loadOrder(id);
  if (!order) throw new OrderError('Order not found', 404);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(txHash)) throw new OrderError('That is not a NEAR transaction hash');
  if (!order.depositTxHash) {
    order.depositTxHash = txHash;
    await save(order);
  }
  try {
    await oneclick.submitDeposit(order.depositAddress, txHash);
  } catch {
    // Optional speed-up only: 1Click finds the deposit by itself.
  }
  return order;
}

/**
 * Move the order as far as the providers say it can go. Safe to call any number of
 * times, from any number of tabs: the delivery step is behind an atomic claim.
 */
export async function advance(id: string): Promise<Order> {
  let order = await loadOrder(id);
  if (!order) throw new OrderError('Order not found', 404);
  if (FINAL_STATUSES.includes(order.status)) return order;

  // Direct payment mode: verify the transaction on-chain
  if (order.paymentMode === 'direct' && order.depositTxHash && !order.verification) {
    order = await verifyDirectPayment(order);
  }

  if (order.status === 'AWAITING_DEPOSIT' || order.status === 'SWAPPING' || order.status === 'INCOMPLETE_DEPOSIT') {
    if (order.paymentMode === 'direct') {
      // For direct mode, if verified, move straight to PAID
      if (order.verification?.verified) {
        order.status = 'PAID';
        order = await save(order);
      }
    } else {
      // 1Click swap mode
      order = await checkSwap(order);
    }
  }
  
  if (order.status === 'PAID' || order.status === 'DELIVERING') {
    order = await deliver(order);
  }
  return order;
}

async function verifyDirectPayment(order: Order): Promise<Order> {
  if (!order.depositTxHash) return order;
  
  const verification = await verifyWnearTransfer({
    txHash: order.depositTxHash,
    sender: order.accountId,
    recipient: order.depositAddress,
    minAmount: order.amountIn,
  });
  
  order.verification = verification;
  return save(order);
}

async function checkSwap(order: Order): Promise<Order> {
  const s = await oneclick.getStatus(order.depositAddress);
  order.swap = {
    status: s.status,
    amountOut: s.swapDetails.amountOut,
    nearTxHashes: s.swapDetails.nearTxHashes.map((h) => h.hash),
    destinationTxHashes: s.swapDetails.destinationChainTxHashes,
    refundReason: s.swapDetails.refundReason,
  };

  const next: Record<typeof s.status, OrderStatus> = {
    PENDING_DEPOSIT: 'AWAITING_DEPOSIT',
    KNOWN_DEPOSIT_TX: 'SWAPPING',
    PROCESSING: 'SWAPPING',
    INCOMPLETE_DEPOSIT: 'INCOMPLETE_DEPOSIT',
    SUCCESS: 'PAID',
    REFUNDED: 'REFUNDED',
    FAILED: 'FAILED',
  };
  order.status = next[s.status];

  // Paid means paid in full. EXACT_OUTPUT should deliver exactly what we asked; allow
  // 0.5% for rounding, and hand anything less to a human instead of buying airtime.
  if (order.status === 'PAID') {
    const out = BigInt(s.swapDetails.amountOut ?? '0');
    const floor = (BigInt(order.usdcRequired) * 995n) / 1000n;
    if (out < floor) {
      order.status = 'UNDERPAID';
      order.note = `Settled ${out} against ${order.usdcRequired} required`;
    }
  }
  return save(order);
}

/**
 * Buy the service exactly once. The request_id is chosen and CLAIMED before VTPass is
 * called (persist intent → call → persist outcome), so a crash or a second tab can
 * only ever re-ask VTPass about the same request_id — which VTPass dedupes.
 */
async function deliver(order: Order): Promise<Order> {
  const store = getStore();

  if (order.status === 'PAID') {
    const requestId = vtpass.newRequestId();
    const won = await store.claim(claimKey(order.id), requestId, TTL);
    const claimed = won ? requestId : await store.get<string>(claimKey(order.id));
    if (!claimed) return order; // claim vanished; the next poll tries again
    order.status = 'DELIVERING';
    order.vtpass = { requestId: claimed };
    await save(order);

    if (!won) return order; // someone else is buying; we will read their outcome next poll

    try {
      let result: unknown;
      const service = order.service || 'airtime';
      
      if (service === 'data') {
        result = await vtpass.buyData({
          requestId: claimed,
          serviceID: order.serviceID,
          variationCode: order.variationCode!,
          amount: order.amountNgn,
          phone: order.phone,
        });
      } else if (service === 'electricity') {
        result = await vtpass.buyElectricity({
          requestId: claimed,
          serviceID: order.serviceID,
          variationCode: order.variationCode!,
          amount: order.amountNgn,
          billersCode: order.meterNumber!,
          phone: order.phone,
        });
      } else {
        // airtime
        result = await vtpass.buyAirtime({
          requestId: claimed,
          serviceID: order.serviceID,
          amount: order.amountNgn,
          phone: order.phone,
        });
      }
      
      return settleDelivery(order, result);
    } catch {
      return order; // timed out: unknown, so requery on the next poll — never re-buy
    }
  }

  // DELIVERING: we asked before and do not yet know. Ask about the SAME request_id.
  if (!order.vtpass?.requestId) return order;
  try {
    return settleDelivery(order, await vtpass.requery(order.vtpass.requestId));
  } catch {
    return order;
  }
}

async function settleDelivery(order: Order, result: unknown): Promise<Order> {
  const outcome = vtpass.interpretVTPass(result);
  const token = (order.service === 'electricity') ? vtpass.vtpassToken(result) : undefined;
  order.vtpass = {
    requestId: order.vtpass!.requestId,
    outcome,
    description: vtpass.vtpassDescription(result),
    transactionId: vtpass.vtpassTransactionId(result),
    token,
  };
  if (outcome === 'success') order.status = 'DELIVERED';
  else if (outcome === 'failed') order.status = 'DELIVERY_FAILED';
  return save(order);
}

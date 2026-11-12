import 'server-only';
import { env } from './env';
import { ngnPerUsdc } from './rate';

/**
 * Order limits in naira. The floor is the larger of MIN_AMOUNT_NGN and MIN_ORDER_USD at
 * today's rate, rounded up to ₦50. Market makers ignore swaps below about $1–2 (the same
 * rule SliqPay production sees with Dextopus), so smaller orders are refused up front
 * instead of being quoted, paid and then refunded.
 */
export async function orderLimits(): Promise<{ minAmountNgn: number; maxAmountNgn: number; rate: number }> {
  const e = env();
  const rate = await ngnPerUsdc();
  const usdFloor = Math.ceil((e.MIN_ORDER_USD * rate) / 50) * 50;
  return { minAmountNgn: Math.max(e.MIN_AMOUNT_NGN, usdFloor), maxAmountNgn: e.MAX_AMOUNT_NGN, rate };
}

import 'server-only';
import { env } from './env';

/**
 * Naira per USDC. `NGN_PER_USDC` wins when set (a fixed rate for a predictable demo);
 * otherwise CoinGecko's public price, cached for a minute. Production SliqPay prices
 * from its own rate service — this is the hackathon stand-in.
 */
let cache: { at: number; rate: number } | undefined;

export async function ngnPerUsdc(): Promise<number> {
  const fixed = env().NGN_PER_USDC;
  if (fixed) return fixed;
  if (cache && Date.now() - cache.at < 60_000) return cache.rate;

  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=ngn', {
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => null)) as { 'usd-coin'?: { ngn?: number } } | null;
  const rate = body?.['usd-coin']?.ngn;
  if (!res.ok || !rate || rate < 100) {
    if (cache) return cache.rate;
    throw new Error('Could not fetch the naira rate. Set NGN_PER_USDC in .env to use a fixed rate.');
  }
  cache = { at: Date.now(), rate };
  return rate;
}

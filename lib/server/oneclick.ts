import 'server-only';
import { z } from 'zod';
import { env } from './env';

/**
 * NEAR Intents 1Click API — https://docs.near-intents.org/near-intents/1click-api
 *
 * 1Click hands us a one-time deposit address. The user sends NEAR there; NEAR Intents
 * market makers fill the swap and the Verifier contract on NEAR settles it, delivering
 * USDC to our settlement account. Every response is zod-parsed, never cast.
 * Adapted from the 1Click client in sliqpay-backend (src/modules/oneclick).
 */

const tokenSchema = z.object({
  assetId: z.string(),
  decimals: z.number(),
  blockchain: z.string(),
  symbol: z.string(),
  price: z.number(),
  contractAddress: z.string().optional(),
});
export type OneClickToken = z.infer<typeof tokenSchema>;

const quoteSchema = z.object({
  quote: z.object({
    depositAddress: z.string().optional(),
    depositMemo: z.string().optional(),
    amountIn: z.string(),
    amountInFormatted: z.string(),
    amountInUsd: z.string().optional(),
    amountOut: z.string(),
    amountOutFormatted: z.string(),
    minAmountOut: z.string().optional(),
    deadline: z.string().optional(),
    timeEstimate: z.number().optional(),
  }),
});
export type OneClickQuote = z.infer<typeof quoteSchema>['quote'];

// Tolerant on purpose: 1Click sends `null` for fields that do not apply yet, and the
// hash lists have come back as plain strings in some versions and objects in others.
// Only `status` is required — it is the one field every decision reads.
const hashList = z
  .array(z.union([z.string().transform((hash) => ({ hash, explorerUrl: undefined as string | undefined })),
    z.object({ hash: z.string(), explorerUrl: z.string().nullish().transform((v) => v ?? undefined) })]))
  .nullish()
  .transform((v) => v ?? []);

const statusSchema = z.object({
  status: z.enum([
    'PENDING_DEPOSIT',
    'KNOWN_DEPOSIT_TX',
    'INCOMPLETE_DEPOSIT',
    'PROCESSING',
    'SUCCESS',
    'REFUNDED',
    'FAILED',
  ]),
  swapDetails: z
    .object({
      amountOut: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? undefined : String(v))),
      amountOutFormatted: z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? undefined : String(v))),
      refundReason: z.string().nullish().transform((v) => v ?? undefined),
      originChainTxHashes: hashList,
      destinationChainTxHashes: hashList,
      nearTxHashes: hashList,
    })
    .passthrough()
    .nullish()
    .transform((v) => v ?? { originChainTxHashes: [], destinationChainTxHashes: [], nearTxHashes: [] }),
});
export type OneClickStatus = z.infer<typeof statusSchema>;

export class OneClickError extends Error {
  constructor(message: string, readonly httpStatus?: number) {
    super(message);
    this.name = 'OneClickError';
  }
}

async function call<T extends z.ZodTypeAny>(path: string, schema: T, body?: unknown): Promise<z.infer<T>> {
  const e = env();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (e.ONECLICK_API_KEY) headers['x-api-key'] = e.ONECLICK_API_KEY;
  else if (e.ONECLICK_JWT) headers.authorization = `Bearer ${e.ONECLICK_JWT}`;

  const res = await fetch(`${e.ONECLICK_BASE_URL.replace(/\/+$/, '')}/v0${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) message = j.message;
    } catch { /* not JSON */ }
    throw new OneClickError(`1Click ${path} failed (${res.status}): ${message}`, res.status);
  }
  const parsed = schema.safeParse(text ? JSON.parse(text) : {});
  if (!parsed.success) {
    // 1Click replies hold no secrets of ours, so the raw body is safe to log — and it
    // is the only way to see what changed.
    console.error(`[1click] unexpected ${path.split('?')[0]} reply:`, text.slice(0, 2000), parsed.error.issues);
    throw new OneClickError(`1Click ${path.split('?')[0]} returned an unexpected shape`);
  }
  return parsed.data;
}

let tokenCache: { at: number; tokens: OneClickToken[] } | undefined;

export async function getTokens(): Promise<OneClickToken[]> {
  if (tokenCache && Date.now() - tokenCache.at < 5 * 60_000) return tokenCache.tokens;
  const tokens = await call('/tokens', z.array(tokenSchema));
  tokenCache = { at: Date.now(), tokens };
  return tokens;
}

export async function tokenByAssetId(assetId: string): Promise<OneClickToken | undefined> {
  return (await getTokens()).find((t) => t.assetId === assetId);
}

export interface QuoteInput {
  swapType: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  /** EXACT_INPUT: origin token units the user sends. EXACT_OUTPUT: settlement units to deliver. */
  amount: string;
  /** The payer's NEAR account: refunds go back here if the swap cannot fill. */
  refundTo: string;
  deadline: Date;
}

/**
 * EXACT_INPUT is the default because market makers fill it far more readily: two live
 * EXACT_OUTPUT orders for a few cents were refunded (NO_LIQUIDITY, QUOTE_EXPIRED) on
 * 2026-11-10. The caller checks `minAmountOut` covers the bill before using the quote.
 */
export async function requestQuote(input: QuoteInput): Promise<OneClickQuote> {
  const e = env();
  const { quote } = await call('/quote', quoteSchema, {
    dry: false,
    swapType: input.swapType,
    slippageTolerance: e.ONECLICK_SLIPPAGE_BPS,
    originAsset: e.ORIGIN_ASSET,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: e.SETTLEMENT_ASSET,
    amount: input.amount,
    refundTo: input.refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient: e.SETTLEMENT_RECIPIENT,
    recipientType: 'DESTINATION_CHAIN',
    deadline: input.deadline.toISOString(),
    referral: 'sliqpay',
  });
  if (!quote.depositAddress) throw new OneClickError('1Click returned a quote without a deposit address');
  return quote;
}

export async function getStatus(depositAddress: string): Promise<OneClickStatus> {
  return call(`/status?${new URLSearchParams({ depositAddress })}`, statusSchema);
}

/** Optional: tells 1Click about the deposit so it does not wait to discover it. */
export async function submitDeposit(depositAddress: string, txHash: string): Promise<void> {
  await call('/deposit/submit', z.any(), { depositAddress, txHash });
}

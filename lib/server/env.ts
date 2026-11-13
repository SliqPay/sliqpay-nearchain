import 'server-only';
import { z } from 'zod';
import { recipientProblem, settlementChainOf } from '../settlement-chain';

/**
 * Every server setting, validated once. `process.env` is read here and nowhere else,
 * the same rule as sliqpay-backend. See .env.example for what each one means.
 */
const schema = z.object({
  // Payment mode: 'oneclick' (swap via NEAR Intents) or 'direct' (wNEAR straight to recipient)
  PAYMENT_MODE: z.enum(['oneclick', 'direct']).default('oneclick'),
  
  // NEAR Intents 1Click
  ONECLICK_BASE_URL: z.string().url().default('https://1click.chaindefuser.com'),
  // Partner key from partners.near-intents.org. ONECLICK_API_KEY (sent as X-API-Key) is what
  // 1Click recommends; ONECLICK_JWT (Authorization: Bearer) is their legacy option.
  ONECLICK_API_KEY: z.string().optional(),
  ONECLICK_JWT: z.string().optional(),
  ONECLICK_SWAP_TYPE: z.enum(['EXACT_INPUT', 'EXACT_OUTPUT']).default('EXACT_INPUT'),
  ONECLICK_SLIPPAGE_BPS: z.coerce.number().int().min(0).max(1000).default(100),
  ORIGIN_ASSET: z.string().default('nep141:wrap.near'),
  // Native USDC on NEAR.
  SETTLEMENT_ASSET: z
    .string()
    .default('nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'),
  SETTLEMENT_DECIMALS: z.coerce.number().int().default(6),
  SETTLEMENT_RECIPIENT: z.string().min(2),

  // VTPass
  VTPASS_BASE_URL: z.string().url().default('https://vtpass.com/api'),
  VTPASS_API_KEY: z.string().min(1),
  VTPASS_SECRET_KEY: z.string().min(1),

  // Pricing
  NGN_PER_USDC: z.coerce.number().positive().optional(),
  PRICE_BUFFER_BPS: z.coerce.number().int().min(0).max(2000).default(100),
  MIN_AMOUNT_NGN: z.coerce.number().int().positive().default(100),
  // Smallest swap worth sending to market makers, in USD. Below ~$1–2 nobody fills it.
  MIN_ORDER_USD: z.coerce.number().min(0).default(2),
  MAX_AMOUNT_NGN: z.coerce.number().int().positive().default(5000),

  // Order store. Required in any deployment: serverless instances share no memory.
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // An empty line in .env (`NGN_PER_USDC=`) means "not set", not "set to nothing".
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Server is not configured. Check .env for: ${missing}`);
  }
  const problem = recipientProblem(settlementChainOf(parsed.data.SETTLEMENT_ASSET), parsed.data.SETTLEMENT_RECIPIENT);
  if (problem) throw new Error(`Server is not configured. ${problem}`);
  cached = parsed.data;
  return cached;
}

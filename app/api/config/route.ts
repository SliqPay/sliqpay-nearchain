import { NextResponse } from 'next/server';
import { env } from '@/lib/server/env';
import { orderLimits } from '@/lib/server/limits';
import { errorResponse } from '@/lib/server/http';
import { settlementChainOf } from '@/lib/settlement-chain';

export const dynamic = 'force-dynamic';

/** Public limits for the form. Nothing secret. */
export async function GET() {
  try {
    const e = env();
    const { minAmountNgn, maxAmountNgn } = await orderLimits();
    return NextResponse.json({ minAmountNgn, maxAmountNgn, minOrderUsd: e.MIN_ORDER_USD, settlementChain: settlementChainOf(e.SETTLEMENT_ASSET) });
  } catch (err) {
    return errorResponse(err);
  }
}

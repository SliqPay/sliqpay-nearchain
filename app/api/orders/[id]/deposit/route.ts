import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordDeposit } from '@/lib/server/orders';
import { errorResponse } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const body = z.object({ txHash: z.string().trim() });

/** The page reports the hash of its deposit. A hint for 1Click, never proof of payment. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Missing txHash' }, { status: 400 });
    return NextResponse.json({ order: await recordDeposit(id, parsed.data.txHash) });
  } catch (err) {
    return errorResponse(err);
  }
}

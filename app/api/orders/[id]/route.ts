import { NextResponse } from 'next/server';
import { advance } from '@/lib/server/orders';
import { errorResponse } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Status poll. Asks 1Click and VTPass for the truth and moves the order on their answers. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json({ order: await advance(id) });
  } catch (err) {
    return errorResponse(err);
  }
}

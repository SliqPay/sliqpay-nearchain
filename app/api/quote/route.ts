import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrder } from '@/lib/server/orders';
import { errorResponse } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const body = z.object({
  accountId: z.string().trim().toLowerCase(),
  network: z.string(),
  phone: z.string().trim(),
  amountNgn: z.coerce.number(),
});

/** Price an airtime purchase and open a NEAR Intents deposit address for it. */
export async function POST(req: Request) {
  try {
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const order = await createOrder(parsed.data);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

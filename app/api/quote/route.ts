import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createOrder } from '@/lib/server/orders';
import { errorResponse } from '@/lib/server/http';
import { checkRateLimit, getClientIp, RATE_LIMITS, RateLimitError } from '@/lib/server/rate-limiter';

export const dynamic = 'force-dynamic';

const body = z.object({
  accountId: z.string().trim().toLowerCase(),
  service: z.enum(['airtime', 'data', 'electricity']).optional(),
  network: z.string().optional(), // for airtime/data
  phone: z.string().trim(),
  amountNgn: z.coerce.number().optional(), // for airtime and electricity
  variationCode: z.string().optional(), // for data and electricity
  provider: z.string().optional(), // for electricity
  meterNumber: z.string().optional(), // for electricity
});

/** Price a bill payment and open a payment address for it. */
export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    try {
      await checkRateLimit(ip, RATE_LIMITS.quote);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: err.message },
          { status: 429, headers: { 'Retry-After': String(err.retryAfter) } }
        );
      }
      throw err;
    }
    
    const parsed = body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const order = await createOrder(parsed.data);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}


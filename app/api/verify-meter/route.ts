import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as vtpass from '@/lib/server/vtpass';
import { errorResponse } from '@/lib/server/http';
import { checkRateLimit, getClientIp, RATE_LIMITS, RateLimitError } from '@/lib/server/rate-limiter';

export const dynamic = 'force-dynamic';

const body = z.object({
  serviceID: z.string(),
  meterNumber: z.string().trim(),
  meterType: z.enum(['prepaid', 'postpaid']),
});

/** Verify an electricity meter number with VTPass */
export async function POST(req: Request) {
  try {
    // Rate limiting
    const ip = getClientIp(req);
    try {
      await checkRateLimit(ip, RATE_LIMITS.verify);
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
    if (!parsed.success) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const result = await vtpass.verifyMeter({
      serviceID: parsed.data.serviceID,
      billersCode: parsed.data.meterNumber,
      type: parsed.data.meterType,
    });

    // Extract customer info from VTPass response
    const r = result as Record<string, unknown>;
    const content = (r.content ?? {}) as Record<string, unknown>;
    const customerName = String(content.Customer_Name ?? content.customer_name ?? '');
    const address = String(content.Address ?? content.address ?? '');
    
    if (customerName || address) {
      return NextResponse.json({
        verified: true,
        customerName,
        address,
      });
    }

    return NextResponse.json({
      verified: false,
      error: 'Meter number not found',
    });
  } catch (err) {
    return errorResponse(err);
  }
}

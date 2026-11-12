import 'server-only';
import { randomBytes } from 'crypto';
import { env } from './env';

/**
 * VTPass airtime delivery — https://www.vtpass.com/documentation/mtn-airtime-vtu-api/
 * The same provider and the same response rules as sliqpay-backend
 * (src/modules/vtpass/services/vtpass-response.service.ts).
 */

/**
 * VTPass rule: the first 12 characters are the current Africa/Lagos time as
 * YYYYMMDDHHII, then anything alphanumeric. It is also the idempotency key — VTPass
 * answers a repeated request_id from the first result instead of delivering twice.
 */
export function newRequestId(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}${get('month')}${get('day')}${hour}${get('minute')}NEAR${randomBytes(6).toString('hex')}`;
}

type Loose = Record<string, unknown>;
const rec = (v: unknown): Loose => (v && typeof v === 'object' ? (v as Loose) : {});

export type DeliveryOutcome = 'success' | 'failed' | 'pending' | 'unknown';

/** success = delivered, never retry. failed = definitely not delivered. pending/unknown = ask again. */
export function interpretVTPass(result: unknown): DeliveryOutcome {
  const r = rec(result);
  const code = String(r.code ?? '');
  const txStatus = String(rec(rec(r.content).transactions).status ?? '').toLowerCase();
  if (txStatus === 'delivered' || txStatus === 'success') return 'success';
  if (code === '000' && txStatus === '') return 'success';
  if (code === '099' || txStatus === 'pending' || txStatus === 'initiated' || txStatus === 'in-progress') return 'pending';
  if (code === '016' || txStatus === 'failed' || txStatus === 'reversed') return 'failed';
  return 'unknown';
}

export function vtpassDescription(result: unknown): string {
  const r = rec(result);
  return String(r.response_description ?? rec(rec(r.content).transactions).status ?? 'No description');
}

export function vtpassTransactionId(result: unknown): string | undefined {
  const id = rec(rec(rec(result).content).transactions).transactionId;
  return id === undefined || id === null ? undefined : String(id);
}

async function post(path: string, body: Loose): Promise<unknown> {
  const e = env();
  const res = await fetch(`${e.VTPASS_BASE_URL.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': e.VTPASS_API_KEY,
      'secret-key': e.VTPASS_SECRET_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
    cache: 'no-store',
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: `HTTP_${res.status}`, response_description: text.slice(0, 200) };
  }
}

export function buyAirtime(params: { requestId: string; serviceID: string; amount: number; phone: string }) {
  return post('/pay', {
    request_id: params.requestId,
    serviceID: params.serviceID,
    amount: params.amount,
    phone: params.phone,
  });
}

export function requery(requestId: string) {
  return post('/requery', { request_id: requestId });
}

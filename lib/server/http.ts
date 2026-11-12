import 'server-only';
import { NextResponse } from 'next/server';
import { OrderError } from './orders';
import { OneClickError } from './oneclick';

/** One place that turns an error into a reply the page can show. Never leaks keys or stacks. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof OrderError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof OneClickError) {
    console.error('[1click]', err.message);
    return NextResponse.json({ error: `NEAR Intents: ${err.message}` }, { status: 502 });
  }
  console.error('[server]', err);
  const msg = err instanceof Error && err.message.startsWith('Server is not configured') ? err.message : 'Something went wrong';
  return NextResponse.json({ error: msg }, { status: 500 });
}

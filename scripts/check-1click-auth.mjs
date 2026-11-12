// Checks whether 1Click accepts our partner key, without spending anything (dry quotes).
// Run from the project folder:  node scripts/check-1click-auth.mjs
// Prints only status codes and fees, never the key.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')];
    }),
);
const key = env.ONECLICK_API_KEY || env.ONECLICK_JWT;
const base = (env.ONECLICK_BASE_URL || 'https://1click.chaindefuser.com').replace(/\/+$/, '');
if (!key) { console.log('No ONECLICK_API_KEY or ONECLICK_JWT in .env.local'); process.exit(1); }

const body = {
  dry: true,
  swapType: 'EXACT_INPUT',
  slippageTolerance: 100,
  originAsset: env.ORIGIN_ASSET || 'nep141:wrap.near',
  depositType: 'ORIGIN_CHAIN',
  destinationAsset: env.SETTLEMENT_ASSET,
  amount: '330000000000000000000000', // 0.33 NEAR, dry: nothing is sent
  refundTo: 'sliqpay.near',
  refundType: 'ORIGIN_CHAIN',
  recipient: env.SETTLEMENT_RECIPIENT,
  recipientType: 'DESTINATION_CHAIN',
  deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
  referral: 'sliqpay',
};

for (const [label, headers] of [
  ['no key           ', {}],
  ['X-API-Key        ', { 'x-api-key': key }],
  ['Bearer (JWT)     ', { authorization: `Bearer ${key}` }],
]) {
  try {
    const res = await fetch(`${base}/v0/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let j; try { j = JSON.parse(text); } catch { j = {}; }
    const fees = j.quoteRequest?.appFees ?? j.appFees;
    console.log(`${label} HTTP ${res.status}  appFees=${JSON.stringify(fees ?? '(not in reply)')}  out=${j.quote?.amountOutFormatted ?? '-'}  ${res.ok ? '' : (j.message || text.slice(0, 150))}`);
  } catch (err) {
    console.log(`${label} network error: ${err.message}`);
  }
}
console.log('\nKey length', key.length, '- header that removes appFees (or 401s) is the one to use.');

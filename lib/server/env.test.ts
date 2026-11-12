import { test } from 'node:test';
import assert from 'node:assert/strict';

test('an empty line in .env means "not set", not an error', async () => {
  Object.assign(process.env, {
    NGN_PER_USDC: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', ONECLICK_JWT: '',
    SETTLEMENT_RECIPIENT: 'sliqpay.near', VTPASS_API_KEY: 'k', VTPASS_SECRET_KEY: 's',
  });
  const { env } = await import('./env');
  const e = env();
  assert.equal(e.NGN_PER_USDC, undefined);
  assert.equal(e.UPSTASH_REDIS_REST_URL, undefined);
  assert.equal(e.MIN_AMOUNT_NGN, 100);
});

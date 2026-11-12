import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the naira minimum follows the $ floor at the live rate, rounded up to ₦50', async () => {
  Object.assign(process.env, {
    NGN_PER_USDC: '1430', MIN_ORDER_USD: '2', MIN_AMOUNT_NGN: '100',
    SETTLEMENT_RECIPIENT: 'sliqpay.near', VTPASS_API_KEY: 'k', VTPASS_SECRET_KEY: 's',
  });
  const { orderLimits } = await import('./limits');
  const l = await orderLimits();
  assert.equal(l.minAmountNgn, 2900); // $2 × ₦1,430 = ₦2,860 → ₦2,900
  assert.equal(l.rate, 1430);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUnits, fromUnits, ceilUnits } from './units';
import { sliqFee } from './fee';
import { isValidNigerianPhone, detectNetwork } from './networks';
import { wnearDepositPlan } from './near-deposit';

test('yoctoNEAR round-trips without float loss', () => {
  assert.equal(toUnits('1.5', 24), '1500000000000000000000000');
  assert.equal(fromUnits('1500000000000000000000000', 24), '1.5');
});

test('USDC is rounded UP so the bill is never short', () => {
  assert.equal(ceilUnits(0.3500001, 6), '350001');
});

test('fee option B', () => {
  assert.equal(sliqFee(500), 20);
  assert.equal(sliqFee(1000), 100);
  assert.equal(sliqFee(5000), 250);
  assert.equal(sliqFee(20000), 300);
});

test('phone validation and network hint', () => {
  assert.equal(isValidNigerianPhone('08031234567'), true);
  assert.equal(isValidNigerianPhone('0803123456'), false);
  assert.equal(detectNetwork('0803'), 'MTN');
});

test('the deposit is one transaction to wrap.near that sends exactly the quoted amount', () => {
  const plan = wnearDepositPlan({ accountId: 'alice.near', depositAddress: 'abc123', amountYocto: '42' });
  assert.equal(plan.receiverId, 'wrap.near');
  assert.deepEqual(plan.actions.map((a) => a.params.methodName), ['storage_deposit', 'storage_deposit', 'near_deposit', 'ft_transfer']);
  assert.equal(plan.actions[2]!.params.deposit, '42');
  assert.deepEqual(plan.actions[3]!.params.args, { receiver_id: 'abc123', amount: '42', memo: 'SliqPay bill' });
  assert.equal(plan.actions[3]!.params.deposit, '1');
  const gas = plan.actions.reduce((s, a) => s + BigInt(a.params.gas), 0n);
  assert.ok(gas <= 300n * 10n ** 12n, 'within the 300 Tgas transaction limit');
});

test('settlement chain is read from the 1Click asset id', async () => {
  const { settlementChainOf, recipientProblem, chainInfo } = await import('./settlement-chain');
  assert.equal(settlementChainOf('nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'), 'near');
  assert.equal(settlementChainOf('nep141:usdt.tether-token.near'), 'near');
  assert.equal(settlementChainOf('nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omft.near'), 'avax');
  // The id 1Click actually lists today (2026-11-12) for native USDC on Avalanche.
  assert.equal(settlementChainOf('nep141:avax-0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e.omdep.near'), 'avax');
  assert.equal(settlementChainOf('nep141:avax.omdep.near'), 'avax');
  assert.equal(settlementChainOf('nep141:wrap.near'), 'near');
  assert.equal(settlementChainOf('nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o'), 'avax');
  assert.equal(chainInfo('avax').txUrl('0xabc'), 'https://snowtrace.io/tx/0xabc');
  assert.match(recipientProblem('avax', 'sliqpay.near') ?? '', /0x/);
  assert.equal(recipientProblem('avax', '0x' + 'a'.repeat(40)), null);
  assert.match(recipientProblem('near', '0x' + 'a'.repeat(40)) ?? '', /NEAR account/);
  assert.equal(recipientProblem('near', 'sliqpay.near'), null);
});

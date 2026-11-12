// The NEAR transaction that pays an order: one transaction to wrap.near, four actions,
// signed once in the user's wallet. The user holds plain NEAR; 1Click takes wNEAR
// (`nep141:wrap.near`), so we wrap exactly the quoted amount and send it on.

const TGAS = 10n ** 12n;
/** wrap.near's storage cost per account. `registration_only` refunds it if already registered. */
const STORAGE_DEPOSIT = '1250000000000000000000'; // 0.00125 NEAR

export interface DepositPlan {
  receiverId: string;
  actions: {
    type: 'FunctionCall';
    params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string };
  }[];
}

export function wnearDepositPlan(params: {
  accountId: string;
  depositAddress: string;
  amountYocto: string;
}): DepositPlan {
  const call = (methodName: string, args: Record<string, unknown>, deposit: string, tgas = 30n) => ({
    type: 'FunctionCall' as const,
    params: { methodName, args, gas: (tgas * TGAS).toString(), deposit },
  });
  return {
    receiverId: 'wrap.near',
    actions: [
      // 1–2. Make sure both the payer and the deposit address can hold wNEAR.
      call('storage_deposit', { account_id: params.accountId, registration_only: true }, STORAGE_DEPOSIT, 10n),
      call('storage_deposit', { account_id: params.depositAddress, registration_only: true }, STORAGE_DEPOSIT, 10n),
      // 3. NEAR → wNEAR, exactly the quoted amount.
      call('near_deposit', {}, params.amountYocto, 10n),
      // 4. Send it to the NEAR Intents deposit address. ft_transfer requires exactly 1 yocto.
      call('ft_transfer', { receiver_id: params.depositAddress, amount: params.amountYocto, memo: 'SliqPay bill' }, '1', 30n),
    ],
  };
}

/** Pull the transaction hash out of whatever shape the wallet returned. */
export function txHashOf(outcome: unknown): string | undefined {
  const o = (outcome ?? {}) as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return o.transaction?.hash ?? o.transaction_outcome?.id;
}

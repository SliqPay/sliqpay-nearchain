import 'server-only';

/**
 * NEAR RPC verification for direct payments. When PAYMENT_MODE=direct, users send wNEAR
 * straight to SETTLEMENT_RECIPIENT. We verify the transaction on-chain before delivery.
 * 
 * This is the backup for when NEAR Intents doesn't fill small orders.
 */

export interface NearTransaction {
  hash: string;
  status: 'success' | 'failure' | 'pending';
  receiverId: string;
  signerId: string;
  actions: {
    FunctionCall?: {
      method_name: string;
      args: string; // base64
      deposit: string;
    };
  }[];
}

export class NearRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NearRpcError';
  }
}

const NEAR_RPC_URLS = [
  'https://rpc.mainnet.near.org',
  'https://near.lava.build',
  'https://rpc.ankr.com/near',
];

async function rpcCall<T>(method: string, params: unknown, attempt = 0): Promise<T> {
  const url = NEAR_RPC_URLS[attempt % NEAR_RPC_URLS.length];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'kiro',
      method,
      params,
    }),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });

  if (!res.ok) {
    if (attempt < NEAR_RPC_URLS.length - 1) {
      return rpcCall<T>(method, params, attempt + 1);
    }
    throw new NearRpcError(`NEAR RPC failed (HTTP ${res.status})`);
  }

  const body = await res.json();
  if (body.error) {
    throw new NearRpcError(body.error.message || 'NEAR RPC error');
  }

  return body.result as T;
}

interface TxResult {
  status: { SuccessValue?: string; Failure?: unknown };
  transaction: {
    signer_id: string;
    receiver_id: string;
    actions: {
      FunctionCall?: {
        method_name: string;
        args: string;
        deposit: string;
      };
    }[];
  };
  receipts_outcome: {
    outcome: {
      status: { SuccessValue?: string; Failure?: unknown };
    };
  }[];
}

/**
 * Verify a direct wNEAR payment: that txHash is a successful ft_transfer of at least
 * `minAmount` wNEAR to `recipient`.
 */
export async function verifyWnearTransfer(params: {
  txHash: string;
  sender: string;
  recipient: string;
  minAmount: string;
}): Promise<{ verified: boolean; actualAmount?: string; reason?: string }> {
  try {
    const result = await rpcCall<TxResult>('tx', [params.txHash, params.sender]);

    // Transaction itself must succeed
    if (result.status.Failure) {
      return { verified: false, reason: 'Transaction failed on NEAR' };
    }

    const tx = result.transaction;
    if (tx.signer_id.toLowerCase() !== params.sender.toLowerCase()) {
      return { verified: false, reason: 'Sender mismatch' };
    }

    if (tx.receiver_id !== 'wrap.near') {
      return { verified: false, reason: 'Not sent to wrap.near' };
    }

    // Find the ft_transfer action
    const ftTransfer = tx.actions.find((a) => a.FunctionCall?.method_name === 'ft_transfer');
    if (!ftTransfer?.FunctionCall) {
      return { verified: false, reason: 'No ft_transfer action found' };
    }

    // Decode args (base64 → JSON)
    const argsJson = Buffer.from(ftTransfer.FunctionCall.args, 'base64').toString('utf-8');
    const args = JSON.parse(argsJson) as { receiver_id?: string; amount?: string };

    if (args.receiver_id !== params.recipient) {
      return { verified: false, reason: 'Recipient mismatch' };
    }

    const amount = BigInt(args.amount || '0');
    const required = BigInt(params.minAmount);

    if (amount < required) {
      return {
        verified: false,
        reason: `Insufficient amount: ${amount} < ${required}`,
        actualAmount: amount.toString(),
      };
    }

    // All receipts must succeed
    const anyReceiptFailed = result.receipts_outcome.some((r) => r.outcome.status.Failure);
    if (anyReceiptFailed) {
      return { verified: false, reason: 'Receipt execution failed' };
    }

    return { verified: true, actualAmount: amount.toString() };
  } catch (err) {
    if (err instanceof NearRpcError) {
      return { verified: false, reason: err.message };
    }
    return { verified: false, reason: 'RPC verification failed' };
  }
}

/**
 * Check if a transaction exists and is final. Returns null if not found or still pending.
 */
export async function getTransactionStatus(txHash: string, accountId: string): Promise<'success' | 'failure' | null> {
  try {
    const result = await rpcCall<TxResult>('tx', [txHash, accountId]);
    if (result.status.Failure) return 'failure';
    if (result.status.SuccessValue !== undefined) return 'success';
    return null;
  } catch {
    return null;
  }
}

// Where SliqPay receives the stablecoin, worked out from the 1Click asset id.
// Shared by server and page (no secrets, no process.env).
//
//   nep141:<chain>-0x<contract>.omdep.near   → a bridged token on <chain>  (current 1Click ids)
//   nep141:<chain>-0x<contract>.omft.near    → same, older bridge naming
//     e.g. nep141:avax-0xb97e…a6e.omdep.near → USDC on Avalanche
//   nep141:<chain>.omdep.near                → that chain's native coin (e.g. AVAX)
//   nep245:v2_1.omni.hot.tg:<chainId>_…      → HOT bridge token (1Click marks these DEPRECATED)
//   anything else                            → NEAR itself (USDC, USDT on NEAR)

export type SettlementChain = 'near' | 'avax' | 'eth' | 'base' | 'arb' | 'pol' | 'bsc' | 'op' | 'other';

interface ChainInfo {
  name: string;
  /** EVM chains take a 0x… recipient; NEAR takes an account id. */
  evm: boolean;
  txUrl: (hash: string) => string;
}

const CHAINS: Record<SettlementChain, ChainInfo> = {
  near: { name: 'NEAR', evm: false, txUrl: (h) => `https://nearblocks.io/txns/${h}` },
  avax: { name: 'Avalanche', evm: true, txUrl: (h) => `https://snowtrace.io/tx/${h}` },
  eth: { name: 'Ethereum', evm: true, txUrl: (h) => `https://etherscan.io/tx/${h}` },
  base: { name: 'Base', evm: true, txUrl: (h) => `https://basescan.org/tx/${h}` },
  arb: { name: 'Arbitrum', evm: true, txUrl: (h) => `https://arbiscan.io/tx/${h}` },
  pol: { name: 'Polygon', evm: true, txUrl: (h) => `https://polygonscan.com/tx/${h}` },
  bsc: { name: 'BNB Chain', evm: true, txUrl: (h) => `https://bscscan.com/tx/${h}` },
  op: { name: 'Optimism', evm: true, txUrl: (h) => `https://optimistic.etherscan.io/tx/${h}` },
  other: { name: 'its destination chain', evm: false, txUrl: () => '' },
};

const EVM_CHAIN_IDS: Record<string, SettlementChain> = {
  '1': 'eth', '10': 'op', '56': 'bsc', '137': 'pol', '8453': 'base', '42161': 'arb', '43114': 'avax',
};

export function settlementChainOf(assetId: string): SettlementChain {
  const bridged = /^nep141:([a-z]+)(?:-0x[0-9a-f]{40})?\.(?:omdep|omft)\.near$/i.exec(assetId);
  if (bridged) {
    const c = bridged[1].toLowerCase() as SettlementChain;
    return c in CHAINS && c !== 'near' ? c : 'other';
  }
  const hot = /^nep245:[^:]+\.omni\.hot\.tg:(\d+)_/.exec(assetId);
  if (hot) return EVM_CHAIN_IDS[hot[1]] ?? 'other';
  return 'near';
}

export function chainInfo(chain: SettlementChain | undefined): ChainInfo {
  return CHAINS[chain ?? 'near'] ?? CHAINS.other;
}

/** Returns a problem description, or null if the recipient fits the chain. */
export function recipientProblem(chain: SettlementChain, recipient: string): string | null {
  const info = chainInfo(chain);
  if (info.evm && !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    return `SETTLEMENT_RECIPIENT must be a 0x… wallet address for settlement on ${info.name}`;
  }
  if (chain === 'near' && (recipient.startsWith('0x') || !/^[a-z0-9._-]{2,64}$/.test(recipient))) {
    return 'SETTLEMENT_RECIPIENT must be a NEAR account (e.g. sliqpay.near) for settlement on NEAR';
  }
  return null;
}

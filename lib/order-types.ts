// The order as the page sees it. Shared by server and client so both name the same states.

export type OrderStatus =
  | 'AWAITING_DEPOSIT' // quote made, waiting for the user's NEAR
  | 'SWAPPING'         // NEAR Intents has the deposit and is filling the swap
  | 'INCOMPLETE_DEPOSIT' // less arrived than the quote needs
  | 'PAID'             // USDC settled to us; airtime not yet bought
  | 'DELIVERING'       // VTPass called; waiting for its answer
  | 'DELIVERED'        // airtime on the phone
  | 'DELIVERY_FAILED'  // paid, but VTPass refused — needs a human (refund or retry)
  | 'UNDERPAID'        // swap settled for less than the bill — needs a human
  | 'REFUNDED'         // swap did not fill; NEAR Intents returned the NEAR
  | 'FAILED';

export const FINAL_STATUSES: readonly OrderStatus[] = [
  'DELIVERED', 'DELIVERY_FAILED', 'UNDERPAID', 'REFUNDED', 'FAILED',
];

export interface Order {
  id: string;
  createdAt: string;
  accountId: string;
  network: string;
  serviceID: string;
  phone: string;
  service?: 'airtime' | 'data' | 'electricity'; // type of service, defaults to airtime
  variationCode?: string; // for data bundles and electricity type
  meterNumber?: string; // for electricity
  amountNgn: number;
  feeNgn: number;
  ngnPerUsdc: number;
  /** USDC the bill needs, smallest units. */
  usdcRequired: string;
  /** Payment mode: oneclick (1Click swap) or direct (wNEAR to recipient) */
  paymentMode?: 'oneclick' | 'direct';
  /** For direct mode: SliqPay's NEAR account. For oneclick: 1Click deposit address. */
  depositAddress: string;
  /** What the user must send, in the origin token's smallest units (yoctoNEAR for wNEAR). */
  amountIn: string;
  amountInFormatted: string;
  originAsset: string;
  /** Where SliqPay receives the stablecoin ('near', 'avax', …). Missing on old orders = NEAR. */
  settlementChain?: import('./settlement-chain').SettlementChain;
  deadline: string;
  status: OrderStatus;
  depositTxHash?: string;
  /** Direct payment verification result */
  verification?: {
    verified: boolean;
    actualAmount?: string;
    reason?: string;
  };
  swap?: {
    status: string;
    amountOut?: string;
    nearTxHashes?: string[];
    destinationTxHashes?: { hash: string; explorerUrl?: string }[];
    refundReason?: string;
  };
  vtpass?: {
    requestId: string;
    outcome?: string;
    description?: string;
    transactionId?: string;
    token?: string; // electricity token
  };
  note?: string;
  updatedAt: string;
}

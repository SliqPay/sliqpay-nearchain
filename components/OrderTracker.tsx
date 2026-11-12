'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { FINAL_STATUSES, type Order, type OrderStatus } from '@/lib/order-types';
import { networkByCode } from '@/lib/networks';
import { chainInfo } from '@/lib/settlement-chain';

/**
 * Polls the order every 4 seconds. The server does the real work on each poll —
 * asks NEAR Intents, then VTPass — so this only renders what they said.
 */
const steps = (chainName: string): { key: string; label: string; reached: OrderStatus[] }[] => [
  { key: 'sent', label: 'NEAR sent from your wallet', reached: ['AWAITING_DEPOSIT', 'SWAPPING', 'PAID', 'DELIVERING', 'DELIVERED'] },
  { key: 'swap', label: 'NEAR Intents converting your NEAR', reached: ['SWAPPING', 'PAID', 'DELIVERING', 'DELIVERED'] },
  { key: 'settled', label: `Stablecoin settled to SliqPay on ${chainName}`, reached: ['PAID', 'DELIVERING', 'DELIVERED'] },
  { key: 'airtime', label: 'Airtime delivered', reached: ['DELIVERED'] },
];

const MESSAGES: Partial<Record<OrderStatus, string>> = {
  AWAITING_DEPOSIT: 'Waiting for NEAR Intents to see your deposit…',
  SWAPPING: 'Market makers are filling your swap…',
  INCOMPLETE_DEPOSIT: 'Less NEAR arrived than the quote needed. NEAR Intents will refund it if it cannot complete.',
  PAID: 'Paid. Buying your airtime…',
  DELIVERING: 'Waiting for the network to confirm the top-up…',
  DELIVERY_FAILED: 'Your payment arrived but the network refused the top-up. Our team will refund you — keep this order number.',
  UNDERPAID: 'The swap settled for less than the bill. Our team will sort it out — keep this order number.',
  REFUNDED: 'The swap could not complete, so NEAR Intents refunded your NEAR to your wallet.',
  FAILED: 'The swap failed. If NEAR left your wallet, NEAR Intents returns it automatically.',
};

export default function OrderTracker({ initial, onDone }: { initial: Order; onDone: () => void }) {
  const [order, setOrder] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/orders/${initial.id}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.order) setOrder(data.order);
        if (data.order && FINAL_STATUSES.includes(data.order.status)) return;
      } catch { /* try again */ }
      if (!stopped) timer.current = setTimeout(tick, 4000);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer.current); };
  }, [initial.id]);

  const done = order.status === 'DELIVERED';
  const bad = ['DELIVERY_FAILED', 'UNDERPAID', 'REFUNDED', 'FAILED'].includes(order.status);
  const nearTx = order.swap?.nearTxHashes?.[0];
  const chain = chainInfo(order.settlementChain);
  const destTx = order.settlementChain && order.settlementChain !== 'near' ? order.swap?.destinationTxHashes?.[0] : undefined;
  const destUrl = destTx ? destTx.explorerUrl || chain.txUrl(destTx.hash) : '';

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-gray-50 dark:bg-gray-800">
          {done ? <CheckCircle2 className="text-emerald-600" size={40} />
            : bad ? <XCircle className="text-red-500" size={40} />
            : <Loader2 className="text-green-600 animate-spin" size={36} />}
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {done ? 'Airtime sent!' : bad ? 'Not completed' : 'Processing'}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {done
            ? `₦${order.amountNgn.toLocaleString()} ${networkByCode(order.network)?.name ?? ''} airtime is on ${order.phone}.`
            : MESSAGES[order.status]}
        </p>
      </div>

      <ol className="space-y-3">
        {steps(chain.name).map((s) => {
          const reached = s.reached.includes(order.status);
          return (
            <li key={s.key} className="flex items-center gap-3">
              {reached ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Circle size={20} className="text-gray-300" />}
              <span className={`text-sm ${reached ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-400'}`}>{s.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2 text-xs text-gray-600 dark:text-gray-300 break-all">
        <div><span className="font-semibold">Order:</span> {order.id}</div>
        {order.depositTxHash && (
          <a className="flex items-center gap-1 text-info" href={`https://nearblocks.io/txns/${order.depositTxHash}`} target="_blank" rel="noreferrer">
            Your NEAR payment <ExternalLink size={12} />
          </a>
        )}
        {nearTx && (
          <a className="flex items-center gap-1 text-info" href={`https://nearblocks.io/txns/${nearTx}`} target="_blank" rel="noreferrer">
            NEAR Intents settlement <ExternalLink size={12} />
          </a>
        )}
        {destUrl && (
          <a className="flex items-center gap-1 text-info" href={destUrl} target="_blank" rel="noreferrer">
            Stablecoin received on {chain.name} <ExternalLink size={12} />
          </a>
        )}
        <div><span className="font-semibold">NEAR Intents deposit address:</span> {order.depositAddress}</div>
        {order.vtpass?.transactionId && <div><span className="font-semibold">VTPass ref:</span> {order.vtpass.transactionId}</div>}
      </div>

      {(done || bad) && (
        <button onClick={onDone} className="w-full bg-green-600 text-white font-semibold py-4 rounded-xl hover:bg-green-700 transition-colors">
          {done ? 'Buy more airtime' : 'Start again'}
        </button>
      )}
    </div>
  );
}

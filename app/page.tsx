'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, LogOut, Wallet, Zap } from 'lucide-react';
import { useNearWallet } from '@/components/NearWalletProvider';
import NetworkPickerSheet, { NetworkBadge } from '@/components/NetworkPickerSheet';
import OrderTracker from '@/components/OrderTracker';
import { NETWORKS, detectNetwork, isValidNigerianPhone, networkByCode } from '@/lib/networks';
import { sliqFee } from '@/lib/fee';
import { wnearDepositPlan, txHashOf } from '@/lib/near-deposit';
import type { Order } from '@/lib/order-types';

const LAST_ORDER_KEY = 'sliqpay-near:last-order';
// Shown only if inside today's limits (the floor is ~$2 at the live rate).
const PRESETS = [100, 200, 500, 1000, 2000, 3000, 4000, 5000];

type Stage = 'form' | 'review' | 'tracking';

export default function BuyAirtimePage() {
  const { accountId, ready, connect, disconnect, send } = useNearWallet();

  const [limits, setLimits] = useState({ minAmountNgn: 100, maxAmountNgn: 5000, minOrderUsd: 0 });
  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [stage, setStage] = useState<Stage>('form');
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config').then((r) => (r.ok ? r.json() : null)).then((c) => c && setLimits(c)).catch(() => {});
    // Pick up an order that was in flight when the tab closed.
    try {
      const id = localStorage.getItem(LAST_ORDER_KEY);
      if (id) {
        fetch(`/api/orders/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
          if (d?.order && !['DELIVERED', 'REFUNDED', 'FAILED'].includes(d.order.status)) {
            setOrder(d.order);
            setStage('tracking');
          }
        }).catch(() => {});
      }
    } catch { /* storage unavailable */ }
  }, []);

  const amountNgn = Number(amount || 0);
  const fee = amountNgn > 0 ? sliqFee(amountNgn) : 0;
  const selected = networkByCode(network);
  const detected = phone.length >= 4 ? detectNetwork(phone) : null;
  const mismatch = Boolean(network && detected && detected !== network);

  const formError = useMemo(() => {
    if (!network) return 'Select a network';
    if (!isValidNigerianPhone(phone)) return 'Enter an 11-digit phone number';
    if (!amountNgn) return 'Enter an amount';
    if (amountNgn < limits.minAmountNgn || amountNgn > limits.maxAmountNgn) {
      return amountNgn < limits.minAmountNgn && limits.minOrderUsd
        ? `Minimum is ₦${limits.minAmountNgn.toLocaleString()} (about $${limits.minOrderUsd}), the smallest swap NEAR Intents fills reliably`
        : `Amount must be between ₦${limits.minAmountNgn.toLocaleString()} and ₦${limits.maxAmountNgn.toLocaleString()}`;
    }
    return null;
  }, [network, phone, amountNgn, limits]);

  async function getQuote() {
    if (!accountId) return connect();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, network, phone, amountNgn }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not get a price');
      setOrder(data.order);
      setStage('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a price');
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!order || !accountId) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await send(
        wnearDepositPlan({ accountId, depositAddress: order.depositAddress, amountYocto: order.amountIn }),
      );
      try { localStorage.setItem(LAST_ORDER_KEY, order.id); } catch { /* fine */ }
      const txHash = txHashOf(outcome);
      if (txHash) {
        await fetch(`/api/orders/${order.id}/deposit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ txHash }),
        }).catch(() => {});
      }
      setStage('tracking');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The wallet did not send the payment');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    try { localStorage.removeItem(LAST_ORDER_KEY); } catch { /* fine */ }
    setOrder(null);
    setStage('form');
    setAmount('');
    setError(null);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pb-10">
      <header className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 z-10">
        <div className="flex items-center justify-between gap-4 px-4 py-4 max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-600 text-white grid place-items-center">
              <Zap size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">Buy Airtime</h1>
              <p className="text-[11px] text-gray-500">SliqPay × NEAR Intents</p>
            </div>
          </div>
          {accountId ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 max-w-[55%]"
              title="Disconnect"
            >
              <span className="truncate">{accountId}</span>
              <LogOut size={14} className="shrink-0" />
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={!ready}
              className="flex items-center gap-2 rounded-full bg-green-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <Wallet size={14} /> {ready ? 'Connect NEAR wallet' : 'Loading…'}
            </button>
          )}
        </div>
      </header>

      <main className="px-4 py-6 max-w-md mx-auto space-y-5">
        {stage === 'form' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Country</label>
              <div className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100">
                Nigeria
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Network</label>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="w-full flex items-center justify-between bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <div className="flex items-center gap-3">
                  {selected && <NetworkBadge network={selected} size={28} />}
                  <span className={`text-sm ${selected ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
                    {selected ? selected.name : 'Select Network'}
                  </span>
                </div>
                <ChevronDown size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Phone Number</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="Enter phone number"
                value={phone}
                maxLength={11}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '');
                  setPhone(v);
                  const d = v.length >= 4 ? detectNetwork(v) : null;
                  if (d && !network) setNetwork(d);
                }}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {mismatch && (
                <p className="mt-1.5 text-xs text-red-500">
                  This number looks like {detected}, not {network}. Check it, or change the network if the number was ported.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Amount</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder={`₦${limits.minAmountNgn.toLocaleString()}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="mt-2 flex gap-2 flex-wrap">
                {PRESETS.filter((p) => p >= limits.minAmountNgn && p <= limits.maxAmountNgn).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(String(p))}
                    className={`rounded-full px-3 py-1 text-sm transition-colors ${amount === String(p) ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                  >
                    ₦{p.toLocaleString()}
                  </button>
                ))}
              </div>
              {amountNgn > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  SliqPay fee ₦{fee.toLocaleString()} · total ₦{(amountNgn + fee).toLocaleString()}, paid in NEAR
                </p>
              )}
              <div className="mt-2 flex items-start gap-2 text-gray-500 dark:text-gray-400">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <p className="text-xs">
                  Enter an amount between ₦{limits.minAmountNgn.toLocaleString()} and ₦{limits.maxAmountNgn.toLocaleString()}
                </p>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={getQuote}
              disabled={busy || (Boolean(accountId) && Boolean(formError))}
              className="w-full bg-green-600 text-white font-semibold py-4 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {!accountId ? 'Connect NEAR wallet to continue' : busy ? 'Getting a price from NEAR Intents…' : formError ?? 'Continue'}
            </button>
          </>
        )}

        {stage === 'review' && order && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-1">
              <Row label="Phone" value={order.phone} />
              <Row label="Network" value={networkByCode(order.network)?.name ?? order.network} />
              <Row label="Airtime" value={`₦${order.amountNgn.toLocaleString()}`} />
              <Row label="SliqPay fee" value={`₦${order.feeNgn.toLocaleString()}`} />
              <Row label="Rate" value={`₦${order.ngnPerUsdc.toLocaleString()} / USDC`} />
              <Row label="You pay" value={`${order.amountInFormatted} NEAR`} strong />
            </div>
            <p className="text-xs text-gray-500">
              Your wallet will ask you to approve one transaction. It wraps exactly this much NEAR and sends it to a
              one-time NEAR Intents deposit address. If the swap cannot complete, NEAR Intents refunds you automatically.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={pay}
              disabled={busy}
              className="w-full bg-green-600 text-white font-semibold py-4 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {busy ? 'Waiting for your wallet…' : `Pay ${order.amountInFormatted} NEAR`}
            </button>
            <button onClick={startOver} className="w-full text-sm text-gray-600 dark:text-gray-400 py-2">
              Cancel
            </button>
          </div>
        )}

        {stage === 'tracking' && order && <OrderTracker initial={order} onDone={startOver} />}
      </main>

      <NetworkPickerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        selected={network}
        networks={NETWORKS}
        onSelect={(c) => { setNetwork(c); setSheetOpen(false); }}
      />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      <span className={`text-sm ${strong ? 'font-bold text-emerald-600' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>{value}</span>
    </div>
  );
}

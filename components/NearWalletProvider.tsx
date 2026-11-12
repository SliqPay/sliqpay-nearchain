'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { NearConnector } from '@hot-labs/near-connect';
import type { DepositPlan } from '@/lib/near-deposit';

/**
 * Sign in with any NEAR wallet (Meteor, MyNearWallet, HOT, Intear, …) through NEAR
 * Connect — the wallet picker recommended in NEAR's own docs. Browser-only, so the
 * library is imported lazily after mount.
 */
interface NearWallet {
  accountId: string | null;
  ready: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (plan: DepositPlan) => Promise<unknown>;
}

const Ctx = createContext<NearWallet | null>(null);

export function NearWalletProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { NearConnector } = await import('@hot-labs/near-connect');
      const connector = new NearConnector({ network: 'mainnet', footerBranding: null });
      connectorRef.current = connector;

      connector.on('wallet:signIn', (e) => setAccountId(e.accounts[0]?.accountId ?? null));
      connector.on('wallet:signOut', () => setAccountId(null));

      // Restore a session from an earlier visit.
      try {
        const { accounts } = await connector.getConnectedWallet();
        if (!cancelled) setAccountId(accounts[0]?.accountId ?? null);
      } catch {
        /* not signed in */
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const connect = useCallback(async () => {
    await connectorRef.current?.connect();
  }, []);

  const disconnect = useCallback(async () => {
    const c = connectorRef.current;
    if (!c) return;
    try { await c.disconnect(); } finally { setAccountId(null); }
  }, []);

  const send = useCallback(async (plan: DepositPlan) => {
    const c = connectorRef.current;
    if (!c) throw new Error('Wallet is still loading');
    const wallet = await c.wallet();
    return wallet.signAndSendTransaction({ receiverId: plan.receiverId, actions: plan.actions });
  }, []);

  return <Ctx.Provider value={{ accountId, ready, connect, disconnect, send }}>{children}</Ctx.Provider>;
}

export function useNearWallet(): NearWallet {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNearWallet must be used inside NearWalletProvider');
  return v;
}

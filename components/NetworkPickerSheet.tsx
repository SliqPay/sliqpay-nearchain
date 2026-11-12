'use client';

// Copied from sliqpay-frontend/components/utilities/NetworkPickerSheet.tsx (logos optional).
import { X, Check } from 'lucide-react';
import type { Network } from '@/lib/networks';

type Props = {
  open: boolean;
  onClose: () => void;
  selected?: string;
  networks: Network[];
  onSelect: (code: string) => void;
};

export default function NetworkPickerSheet({ open, onClose, selected, networks, onSelect }: Props) {
  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={[
          'relative w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl',
          'rounded-t-2xl sm:rounded-2xl transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full sm:translate-y-0',
          open ? 'sm:opacity-100' : 'sm:opacity-0',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Select Network</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" aria-label="Close">
            <X size={18} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
        <div className="px-3 pb-[max(env(safe-area-inset-bottom),24px)] max-h-[60vh] overflow-y-auto">
          {networks.map((n) => (
            <button
              key={n.code}
              onClick={() => onSelect(n.code)}
              className="w-full flex items-center justify-between rounded-2xl px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-center gap-3">
                <NetworkBadge network={n} />
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{n.name}</span>
              </div>
              <div
                className={`h-6 w-6 rounded-full grid place-items-center ${selected === n.code ? 'bg-cyan-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}
              >
                <Check size={14} strokeWidth={3} className={selected === n.code ? '' : 'opacity-40'} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Logo when the file exists in public/product-logos, the network's initial otherwise. */
export function NetworkBadge({ network, size = 36 }: { network: Network; size?: number }) {
  return (
    <div
      className="rounded-full bg-green-100 text-green-700 grid place-items-center text-xs font-bold overflow-hidden border dark:border-gray-600"
      style={{ width: size, height: size }}
    >
      {network.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={network.logo}
          alt={network.name}
          width={size - 8}
          height={size - 8}
          className="object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        network.name[0]
      )}
    </div>
  );
}

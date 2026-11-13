import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NearWalletProvider } from '@/components/NearWalletProvider';

export const metadata: Metadata = {
  title: 'SliqPay × NEAR — pay bills with NEAR',
  description: 'Buy Nigerian airtime with NEAR. Sign in with any NEAR wallet; NEAR Intents swaps and settles.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-white dark:bg-gray-900 antialiased">
        <NearWalletProvider>{children}</NearWalletProvider>
      </body>
    </html>
  );
}

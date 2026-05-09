import './globals.css';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Header } from './_components/Header';
import { ViewerProvider } from './_components/ViewerProvider';

export const metadata: Metadata = {
  title: 'Alpha Tube',
  description: 'Self-hosted video streaming portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ViewerProvider>
          <Suspense fallback={<div className="h-14 border-b border-neutral-800" />}>
            <Header />
          </Suspense>
          <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        </ViewerProvider>
      </body>
    </html>
  );
}

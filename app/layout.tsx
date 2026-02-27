import type { Metadata } from 'next';
import { BookMarked, Shield } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Providers } from '@/components/providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'XLang | German Video Learning',
  description: 'Level-based German video platform with synced transcript learning.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <header className="sticky top-0 z-30 border-b border-border/70 bg-surface/85 backdrop-blur-xl">
            <div className="mx-auto max-w-7xl px-4 pb-3 pt-3 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/"
                  className="rounded-xl px-2 py-1 font-[var(--font-heading)] text-2xl font-bold tracking-tight text-ink transition hover:bg-accent/10 sm:text-4xl"
                >
                  XLang
                </Link>
                <ThemeToggle />
              </div>
              <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 sm:mt-2 sm:justify-start sm:overflow-visible sm:pb-0">
                <Link
                  href="/admin"
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/60 hover:text-ink sm:h-9 sm:text-sm"
                >
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
                <Link
                  href="/saved"
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/60 hover:text-ink sm:h-9 sm:text-sm"
                >
                  <BookMarked className="h-4 w-4" />
                  Saved
                </Link>
              </div>
            </div>
            <div className="h-0.5 bg-gradient-to-r from-transparent via-accent/80 to-transparent" />
          </header>
          <main className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-10">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}

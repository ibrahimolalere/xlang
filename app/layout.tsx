import type { Metadata } from 'next';
import {
  BookMarked,
  CirclePlay,
  GraduationCap,
  Home,
  LogIn,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { AuthControls } from '@/components/auth/auth-controls';
import { Providers } from '@/components/providers';
import { ThemeToggle } from '@/components/theme-toggle';
import { LEVELS } from '@/lib/constants';

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
          <header className="sticky top-0 z-40 border-b border-border/80 bg-surface/95 backdrop-blur-xl">
            <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xl font-bold tracking-tight text-ink transition hover:bg-panel sm:text-2xl"
              >
                <CirclePlay className="h-6 w-6 fill-accent text-accent" />
                XLang
              </Link>

              <div className="hidden flex-1 justify-center md:flex">
                <div className="flex h-10 w-full max-w-xl items-center rounded-full border border-border/80 bg-panel px-4 text-sm text-muted">
                  Search levels, videos, vocabulary
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <AuthControls />
                <Link
                  href="/admin"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-ink sm:text-sm"
                >
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
                <Link
                  href="/saved"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-ink sm:text-sm"
                >
                  <BookMarked className="h-4 w-4" />
                  <span className="hidden sm:inline">Saved</span>
                </Link>
                <ThemeToggle />
              </div>
            </div>

            <div className="mx-auto max-w-[1600px] px-3 pb-3 sm:hidden">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Link
                  href="/"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted"
                >
                  <Home className="h-4 w-4" />
                  Home
                </Link>
                <Link
                  href="/saved"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted"
                >
                  <BookMarked className="h-4 w-4" />
                  Saved
                </Link>
                <Link
                  href="/admin"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted"
                >
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
                <Link
                  href="/auth"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted"
                >
                  <LogIn className="h-4 w-4" />
                  Account
                </Link>
              </div>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-3 pb-10 pt-4 sm:px-6 sm:pb-12">
            <aside className="sticky top-[4.5rem] hidden h-[calc(100dvh-5rem)] w-64 shrink-0 lg:block">
              <nav className="h-full overflow-y-auto rounded-2xl border border-border/80 bg-panel p-3">
                <div className="space-y-1.5">
                  <Link
                    href="/"
                    className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-surface"
                  >
                    <Home className="h-4 w-4" />
                    Home
                  </Link>
                  <Link
                    href="/saved"
                    className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-surface"
                  >
                    <BookMarked className="h-4 w-4" />
                    Saved Words
                  </Link>
                  <Link
                    href="/admin"
                    className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-surface"
                  >
                    <Shield className="h-4 w-4" />
                    Admin Studio
                  </Link>
                  <Link
                    href="/auth"
                    className="inline-flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink transition hover:bg-surface"
                  >
                    <LogIn className="h-4 w-4" />
                    Account
                  </Link>
                </div>

                <div className="mt-5 border-t border-border/80 pt-4">
                  <p className="mb-2 inline-flex items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Levels
                  </p>
                  <div className="space-y-1">
                    {LEVELS.map((level) => (
                      <Link
                        key={level}
                        href={`/level/${level}`}
                        className="inline-flex h-9 w-full items-center rounded-lg px-3 text-sm font-medium text-muted transition hover:bg-surface hover:text-ink"
                      >
                        {level}
                      </Link>
                    ))}
                  </div>
                </div>
              </nav>
            </aside>

            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

'use client';

import {
  BookMarked,
  ChevronRight,
  CirclePlay,
  Home,
  Settings,
  Sparkles,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AuthControls } from '@/components/auth/auth-controls';
import { PracticeSessionModal } from '@/components/practice/practice-session-modal';
import { ThemeToggle } from '@/components/theme-toggle';
import { LEVELS } from '@/lib/constants';

interface AppShellProps {
  children: ReactNode;
}

function AdminShell({ children }: AppShellProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-6">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xl font-bold tracking-tight text-ink transition hover:bg-panel sm:text-2xl"
          >
            <Shield className="h-5 w-5 text-accent" />
            XLang Admin
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-ink sm:text-sm"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Learner App</span>
            </Link>
            <AuthControls />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-3 pb-10 pt-4 sm:px-6 sm:pb-12">
        {children}
      </main>
    </>
  );
}

function LearnerShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const isSaved = pathname === '/saved';
  const isSettings = pathname === '/settings';

  const levelInfo: Record<(typeof LEVELS)[number], { subtitle: string; tone: string }> = {
    A1: { subtitle: 'Starter German', tone: 'from-blue-500 to-indigo-500' },
    A2: { subtitle: 'Everyday German', tone: 'from-emerald-400 to-cyan-500' },
    B2: { subtitle: 'Independent German', tone: 'from-orange-400 to-rose-500' },
    C1: { subtitle: 'Advanced Fluency', tone: 'from-sky-400 to-blue-600' }
  };

  return (
    <>
      <PracticeSessionModal />
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
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                isHome
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/80 bg-panel text-muted'
              }`}
            >
              <Home className="h-4 w-4" />
              Home
            </Link>
            <Link
              href="/saved"
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                isSaved
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/80 bg-panel text-muted'
              }`}
            >
              <BookMarked className="h-4 w-4" />
              Saved
            </Link>
            <Link
              href="/saved"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted"
            >
              <Sparkles className="h-4 w-4" />
              Review
            </Link>
            <Link
              href="/settings"
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                isSettings
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/80 bg-panel text-muted'
              }`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-3 pb-10 pt-4 sm:px-6 sm:pb-12">
        <aside className="sticky top-[4.5rem] hidden h-[calc(100dvh-5rem)] w-72 shrink-0 lg:block">
          <nav className="h-full overflow-y-auto rounded-2xl border border-border/80 bg-panel p-3 text-ink">
            <div className="space-y-1 border-b border-border/80 pb-4">
              <Link
                href="/"
                className={`inline-flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[1.03rem] font-medium transition ${
                  isHome ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
                }`}
              >
                <Home className="h-[1.2rem] w-[1.2rem]" />
                Home
              </Link>
            </div>

            <div className="mt-4 border-b border-border/80 pb-4">
              <p className="mb-2 inline-flex items-center gap-1.5 px-3 text-xs font-semibold tracking-wide text-muted">
                Levels
                <ChevronRight className="h-4 w-4" />
              </p>
              <div className="space-y-1.5">
                {LEVELS.map((level) => (
                  <Link
                    key={level}
                    href={`/level/${level}`}
                    className={`inline-flex h-12 w-full items-center gap-3 rounded-xl px-3 transition ${
                      pathname === `/level/${level}`
                        ? 'bg-surface'
                        : 'hover:bg-surface'
                    }`}
                  >
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${levelInfo[level].tone}`}
                    >
                      {level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {levelInfo[level].subtitle}
                      </span>
                    </span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 inline-flex items-center gap-1.5 px-3 text-xs font-semibold tracking-wide text-muted">
                You
                <ChevronRight className="h-4 w-4" />
              </p>
              <div className="space-y-1">
                <Link
                  href="/saved"
                  className={`inline-flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[1.03rem] font-medium transition ${
                    isSaved ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
                  }`}
                >
                  <BookMarked className="h-[1.15rem] w-[1.15rem]" />
                  Saved Words
                </Link>
                <Link
                  href="/saved"
                  className="inline-flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[1.03rem] font-medium text-ink/90 transition hover:bg-surface"
                >
                  <Sparkles className="h-[1.15rem] w-[1.15rem]" />
                  Daily Review
                </Link>
              </div>
            </div>

            <div className="mt-4 border-t border-border/80 pt-4">
              <Link
                href="/settings"
                className={`inline-flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[1.03rem] font-medium transition ${
                  isSettings ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
                }`}
              >
                <Settings className="h-[1.15rem] w-[1.15rem]" />
                Settings
              </Link>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <AdminShell>{children}</AdminShell>;
  }

  return <LearnerShell>{children}</LearnerShell>;
}

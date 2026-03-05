'use client';

import {
  BookMarked,
  CircleUserRound,
  ChevronRight,
  Home,
  LogIn,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Shield
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { AuthControls } from '@/components/auth/auth-controls';
import { BrandLogo } from '@/components/brand-logo';
import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';
import { PracticeSessionModal } from '@/components/practice/practice-session-modal';
import { ThemeToggle } from '@/components/theme-toggle';
import { LEVELS } from '@/lib/constants';
import { hasUnreadReviewStory, REVIEW_STORY_SEEN_EVENT } from '@/lib/review-story';
import { cn } from '@/lib/utils';
import {
  getSavedWords,
  SAVED_WORDS_UPDATED_EVENT,
  syncSavedWordsFromServer
} from '@/lib/vocabulary';

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
            <BrandLogo priority />
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-5 w-5 text-accent" />
              <span className="text-base font-semibold text-muted sm:text-lg">Admin</span>
            </span>
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
  const { user, isLoading: isAuthLoading, isConfigured, signOut } = useSupabaseAuth();
  const [isDesktopNavOpen, setIsDesktopNavOpen] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const isHome = pathname === '/';
  const isSaved = pathname === '/saved';
  const isReviewStory = pathname === '/review-story';
  const isSettings = pathname === '/settings';
  const [hasNewReviewStory, setHasNewReviewStory] = useState(false);
  const learnerKey = user?.id ?? 'guest';
  const authHref = useMemo(
    () => `/auth?next=${encodeURIComponent(pathname || '/')}`,
    [pathname]
  );

  const levelInfo: Record<(typeof LEVELS)[number], { subtitle: string; tone: string }> = {
    A1: { subtitle: 'Starter German', tone: 'from-blue-500 to-indigo-500' },
    A2: { subtitle: 'Everyday German', tone: 'from-emerald-400 to-cyan-500' },
    B1: { subtitle: 'Conversational German', tone: 'from-violet-400 to-fuchsia-500' },
    B2: { subtitle: 'Independent German', tone: 'from-orange-400 to-rose-500' },
    C1: { subtitle: 'Advanced Fluency', tone: 'from-sky-400 to-blue-600' }
  };

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    let cancelled = false;

    const refreshIndicator = async () => {
      const local = getSavedWords(learnerKey);
      if (!cancelled) {
        setHasNewReviewStory(hasUnreadReviewStory(learnerKey, local));
      }

      if (learnerKey !== 'guest') {
        const synced = await syncSavedWordsFromServer(learnerKey);
        if (!cancelled) {
          setHasNewReviewStory(hasUnreadReviewStory(learnerKey, synced));
        }
      }
    };

    void refreshIndicator();

    const onFocus = () => {
      void refreshIndicator();
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('xlang_saved_words')) {
        void refreshIndicator();
      }
    };

    const onSavedWordsUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ learnerKey?: string }>;
      const eventLearnerKey = custom.detail?.learnerKey ?? 'guest';
      if (eventLearnerKey === learnerKey) {
        void refreshIndicator();
      }
    };

    const onStorySeen = (event: Event) => {
      const custom = event as CustomEvent<{ learnerKey?: string }>;
      const eventLearnerKey = custom.detail?.learnerKey ?? 'guest';
      if (eventLearnerKey === learnerKey) {
        void refreshIndicator();
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAVED_WORDS_UPDATED_EVENT, onSavedWordsUpdate as EventListener);
    window.addEventListener(REVIEW_STORY_SEEN_EVENT, onStorySeen as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(
        SAVED_WORDS_UPDATED_EVENT,
        onSavedWordsUpdate as EventListener
      );
      window.removeEventListener(REVIEW_STORY_SEEN_EVENT, onStorySeen as EventListener);
    };
  }, [learnerKey]);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setIsDesktopNavOpen((previous) => !previous);
      return;
    }
    setIsMobileNavOpen((previous) => !previous);
  };

  const renderSideNav = (mobile = false) => {
    const expanded = mobile || isDesktopNavOpen;

    return (
      <nav className="flex h-full flex-col rounded-2xl border border-border/80 bg-panel p-3 text-ink">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-1 border-b border-border/80 pb-4">
            <Link
              href="/"
              onClick={mobile ? () => setIsMobileNavOpen(false) : undefined}
              className={cn(
                'inline-flex h-11 w-full items-center rounded-xl text-[1.03rem] font-medium transition',
                expanded ? 'gap-3 px-3' : 'justify-center',
                isHome ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
              )}
              title={expanded ? undefined : 'Home'}
              aria-label="Home"
            >
              <Home className="h-[1.2rem] w-[1.2rem]" />
              {expanded ? 'Home' : null}
            </Link>
          </div>

          <div className="mt-4 border-b border-border/80 pb-4">
            {expanded ? (
              <p className="mb-2 inline-flex items-center gap-1.5 px-3 text-xs font-semibold tracking-wide text-muted">
                Levels
                <ChevronRight className="h-4 w-4" />
              </p>
            ) : null}
            <div className="space-y-1.5">
              {LEVELS.map((level) => (
                <Link
                  key={level}
                  href={`/level/${level}`}
                  onClick={mobile ? () => setIsMobileNavOpen(false) : undefined}
                  className={cn(
                    'inline-flex h-12 w-full items-center rounded-xl transition',
                    expanded ? 'gap-3 px-3' : 'justify-center',
                    pathname === `/level/${level}` ? 'bg-surface' : 'hover:bg-surface'
                  )}
                  title={expanded ? undefined : level}
                  aria-label={`Open ${level} level`}
                >
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${levelInfo[level].tone}`}
                  >
                    {level}
                  </span>
                  {expanded ? (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {levelInfo[level].subtitle}
                        </span>
                      </span>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    </>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {expanded ? (
              <p className="mb-2 inline-flex items-center gap-1.5 px-3 text-xs font-semibold tracking-wide text-muted">
                You
                <ChevronRight className="h-4 w-4" />
              </p>
            ) : null}
            <div className="space-y-1">
              <Link
                href="/saved"
                onClick={mobile ? () => setIsMobileNavOpen(false) : undefined}
                className={cn(
                  'inline-flex h-11 w-full items-center rounded-xl text-[1.03rem] font-medium transition',
                  expanded ? 'gap-3 px-3' : 'justify-center',
                  isSaved ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
                )}
                title={expanded ? undefined : 'Saved Words'}
                aria-label="Saved words"
              >
                <BookMarked className="h-[1.15rem] w-[1.15rem]" />
                {expanded ? 'Saved Words' : null}
              </Link>
              <Link
                href="/review-story"
                onClick={mobile ? () => setIsMobileNavOpen(false) : undefined}
                className={cn(
                  'relative inline-flex h-11 w-full items-center rounded-xl text-[1.03rem] font-medium transition',
                  expanded ? 'gap-3 px-3' : 'justify-center',
                  isReviewStory ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
                )}
                title={expanded ? undefined : 'Review Story'}
                aria-label="Review story"
              >
                <Sparkles className="h-[1.15rem] w-[1.15rem]" />
                {expanded ? (
                  <span className="inline-flex items-center gap-2">
                    {hasNewReviewStory ? (
                      <span className="h-2 w-2 rounded-full bg-sky-500" />
                    ) : null}
                    Review Story
                  </span>
                ) : hasNewReviewStory ? (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-sky-500" />
                ) : null}
              </Link>
            </div>
          </div>

          <div className="mt-4 border-t border-border/80 pt-4">
            <Link
              href="/settings"
              onClick={mobile ? () => setIsMobileNavOpen(false) : undefined}
              className={cn(
                'inline-flex h-11 w-full items-center rounded-xl text-[1.03rem] font-medium transition',
                expanded ? 'gap-3 px-3' : 'justify-center',
                isSettings ? 'bg-surface text-ink' : 'text-ink/90 hover:bg-surface'
              )}
              title={expanded ? undefined : 'Settings'}
              aria-label="Settings"
            >
              <Settings className="h-[1.15rem] w-[1.15rem]" />
              {expanded ? 'Settings' : null}
            </Link>
          </div>
        </div>

        <div className="mt-3 border-t border-border/80 pt-3">
          {isConfigured ? (
            isAuthLoading ? (
              <div
                className={cn(
                  'inline-flex h-11 items-center rounded-xl text-sm font-semibold text-muted',
                  expanded ? 'w-full gap-2 px-3' : 'mx-auto w-11 justify-center'
                )}
              >
                <CircleUserRound className="h-4 w-4 animate-pulse" />
                {expanded ? 'Checking account…' : null}
              </div>
            ) : user ? (
              <div className="space-y-2">
                {expanded ? (
                  <p className="truncate px-3 text-xs font-medium text-muted" title={user.email ?? 'Signed in'}>
                    {user.email ?? 'Signed in'}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                    if (mobile) {
                      setIsMobileNavOpen(false);
                    }
                  }}
                  className={cn(
                    'inline-flex h-11 items-center rounded-xl border border-border/80 bg-surface text-sm font-semibold text-ink transition hover:border-accent/50 hover:text-accent',
                    expanded ? 'w-full gap-2 px-3' : 'mx-auto w-11 justify-center'
                  )}
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  {expanded ? 'Sign out' : null}
                </button>
              </div>
            ) : (
              <Link
                href={authHref}
                onClick={mobile ? () => setIsMobileNavOpen(false) : undefined}
                className={cn(
                  'inline-flex h-11 items-center rounded-xl border border-border/80 bg-surface text-sm font-semibold text-ink transition hover:border-accent/50 hover:text-accent',
                  expanded ? 'w-full gap-2 px-3' : 'mx-auto w-11 justify-center'
                )}
                title="Log in"
                aria-label="Log in"
              >
                <LogIn className="h-4 w-4" />
                {expanded ? 'Log in' : null}
              </Link>
            )
          ) : null}
        </div>
      </nav>
    );
  };

  return (
    <>
      <PracticeSessionModal />
      <header className="sticky top-0 z-40 border-b border-border/80 bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-6">
          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-panel text-muted transition hover:border-accent/50 hover:text-ink"
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xl font-bold tracking-tight text-ink transition hover:bg-panel sm:text-2xl"
          >
            <BrandLogo priority />
          </Link>

          <div className="hidden flex-1 justify-center md:flex">
            <div className="flex h-10 w-full max-w-xl items-center rounded-full border border-border/80 bg-panel px-4 text-sm text-muted">
              Search levels, videos, vocabulary
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
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
              href="/review-story"
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                isReviewStory
                  ? 'border-accent/50 bg-accent/10 text-accent'
                  : 'border-border/80 bg-panel text-muted'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              {hasNewReviewStory ? (
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              ) : null}
              Story
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

      {isMobileNavOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close sidebar"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <aside className="relative h-full w-[86vw] max-w-[20rem] p-3">
            {renderSideNav(true)}
          </aside>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[1600px] gap-6 px-3 pb-10 pt-4 sm:px-6 sm:pb-12">
        <aside
          className={cn(
            'sticky top-[4.5rem] hidden h-[calc(100dvh-5rem)] shrink-0 transition-[width] duration-200 lg:block',
            isDesktopNavOpen ? 'w-72' : 'w-20'
          )}
        >
          {renderSideNav(false)}
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

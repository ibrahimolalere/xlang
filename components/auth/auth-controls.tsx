'use client';

import { CircleUserRound, LogIn, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';

export function AuthControls() {
  const { user, isLoading, isConfigured, signOut } = useSupabaseAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!isConfigured) {
    return null;
  }

  if (isLoading) {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted sm:text-sm">
        <CircleUserRound className="h-4 w-4" />
        <span className="hidden sm:inline">Checking…</span>
      </span>
    );
  }

  if (!user) {
    return (
      <Link
        href="/auth"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-ink sm:text-sm"
      >
        <LogIn className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/80 bg-panel px-3 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
      title={user.email ?? 'Signed in'}
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden max-w-[140px] truncate sm:inline">
        {isSigningOut ? 'Signing out…' : user.email ?? 'Sign out'}
      </span>
    </button>
  );
}

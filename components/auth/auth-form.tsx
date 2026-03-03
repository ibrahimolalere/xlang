'use client';

import { Mail, Lock, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type AuthMode = 'signin' | 'signup';

export function AuthForm() {
  const { user, isConfigured, refreshSession, signOut } = useSupabaseAuth();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirectPath, setRedirectPath] = useState('/');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const raw = new URLSearchParams(window.location.search).get('next')?.trim() ?? '';
    if (raw.startsWith('/')) {
      setRedirectPath(raw);
    }
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isConfigured) {
      setError('Supabase auth is not configured.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Enter a valid email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password
        });
        if (signInError) {
          throw signInError;
        }
        await refreshSession();
        router.replace(redirectPath);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.session) {
        await refreshSession();
        router.replace(redirectPath);
        return;
      }

      setMessage('Account created. Check your email to confirm sign in.');
    } catch (submitError) {
      const fallback = mode === 'signin' ? 'Sign in failed.' : 'Sign up failed.';
      setError(submitError instanceof Error ? submitError.message : fallback);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setMessage(null);

    if (!isConfigured) {
      setError('Supabase auth is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        redirectPath
      )}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl }
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : 'Google sign in failed.');
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);
    try {
      await signOut();
      await refreshSession();
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <p className="text-sm text-muted">
          Auth is not configured. Add real Supabase environment variables to enable sign in.
        </p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Signed in</p>
        <p className="mt-2 text-lg font-semibold text-ink">{user.email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => router.push(redirectPath)}
            className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-warm"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={isLoading}
            className="inline-flex h-10 items-center rounded-full border border-border/80 bg-surface px-4 text-sm font-semibold text-ink transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
      <div className="mb-4 inline-flex rounded-full border border-border/80 bg-surface p-1">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            mode === 'signin' ? 'bg-accent text-white' : 'text-muted'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            mode === 'signup' ? 'bg-accent text-white' : 'text-muted'
          }`}
        >
          Create account
        </button>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-muted">
            <Mail className="h-3.5 w-3.5" />
            Email
          </span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent"
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.15em] text-muted">
            <Lock className="h-3.5 w-3.5" />
            Password
          </span>
          <input
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent"
            placeholder="At least 6 characters"
            required
            minLength={6}
          />
        </label>

        {error ? (
          <p className="rounded-xl border border-red-300/60 bg-red-100/50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-xl border border-green-300/60 bg-green-100/60 px-3 py-2 text-sm text-green-700">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-warm disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === 'signin' ? 'Sign in with Email' : 'Create Account'}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-border/80" />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">or</span>
        <span className="h-px flex-1 bg-border/80" />
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/80 bg-surface px-4 text-sm font-semibold text-ink transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Continue with Google
      </button>
    </div>
  );
}

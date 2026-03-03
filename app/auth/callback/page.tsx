'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const completeAuth = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const rawNextPath = params.get('next')?.trim() ?? '/';
        const nextPath = rawNextPath.startsWith('/') ? rawNextPath : '/';

        if (code) {
          const supabase = createSupabaseBrowserClient();
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        router.replace(nextPath);
      } catch (callbackError) {
        if (!isMounted) {
          return;
        }
        setError(
          callbackError instanceof Error
            ? callbackError.message
            : 'Unable to finish Google sign in.'
        );
      }
    };

    void completeAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <section className="mx-auto flex min-h-[30vh] w-full max-w-xl items-center justify-center p-4">
      <div className="w-full rounded-2xl border border-border/80 bg-panel p-6 text-center">
        {error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : (
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Completing sign in…
          </div>
        )}
      </div>
    </section>
  );
}

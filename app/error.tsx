'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-border/80 bg-panel p-6 text-center sm:p-8">
      <h2 className="text-2xl font-semibold text-ink sm:text-3xl">Something went wrong</h2>
      <p className="mt-2 text-sm text-muted sm:text-base">
        Please try again. If the problem continues, check server configuration.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 h-10 rounded-full border border-border/80 bg-surface px-4 text-sm font-semibold text-ink"
      >
        Try Again
      </button>
    </div>
  );
}

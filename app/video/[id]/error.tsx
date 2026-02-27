'use client';

import { useEffect } from 'react';

export default function VideoError({
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
    <div className="rounded-xl border border-border bg-panel p-6 text-center sm:p-8">
      <h2 className="text-2xl font-semibold text-ink sm:text-3xl">Unable to load this video</h2>
      <p className="mt-2 text-sm text-muted">The video record or transcript request failed.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 h-10 rounded-md border border-border bg-surface px-4 text-sm font-semibold text-ink"
      >
        Retry
      </button>
    </div>
  );
}

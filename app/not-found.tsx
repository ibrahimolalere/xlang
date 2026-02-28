import Link from 'next/link';
import { Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-border/80 bg-panel p-6 text-center sm:p-8">
      <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Not found</h1>
      <p className="mt-2 text-sm text-muted sm:text-base">
        The page you requested does not exist.
      </p>
      <Link
        href="/"
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-border/80 bg-surface px-4 text-sm font-semibold text-ink"
      >
        <Home className="h-4 w-4" />
        Go Home
      </Link>
    </div>
  );
}

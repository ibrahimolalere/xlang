import { SavedWordsList } from '@/components/saved-words-list';
import { BookMarked } from 'lucide-react';
import { Suspense } from 'react';

export default function SavedWordsPage() {
  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:text-xs">
          <BookMarked className="h-4 w-4 text-accent" />
          Library
        </p>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
          Saved Vocabulary
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Save words for review, get 24-hour reminders via email or WhatsApp, and clear items through quiz or learned checkoff.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-2xl border border-border/80 bg-panel p-6 text-center sm:p-8">
            <p className="text-sm text-muted sm:text-base">Loading saved vocabulary...</p>
          </div>
        }
      >
        <SavedWordsList />
      </Suspense>
    </section>
  );
}

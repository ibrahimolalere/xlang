import { SavedWordsList } from '@/components/saved-words-list';
import { BookMarked } from 'lucide-react';

export default function SavedWordsPage() {
  return (
    <section className="space-y-5 sm:space-y-6">
      <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-panel px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent sm:text-xs">
        <BookMarked className="h-4 w-4" />
        Vocabulary
      </p>
      <h1 className="font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
        Saved Vocabulary
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
        Review your saved words, phrases, and transcript lines, then revisit the original video context.
      </p>
      <SavedWordsList />
    </section>
  );
}

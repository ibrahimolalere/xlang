import { LevelCard } from '@/components/level-card';
import { LEVELS } from '@/lib/constants';
import { Flame, Languages } from 'lucide-react';

export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-7">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:text-xs">
          <Languages className="h-4 w-4 text-accent" />
          Learning Feed
        </p>
        <h1 className="mt-4 max-w-4xl font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
          German videos by CEFR level
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Start with your level, watch adaptive subtitles, translate words instantly, and save vocabulary as flashcards.
        </p>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-panel px-3 py-1 text-xs font-semibold text-muted">
        <Flame className="h-4 w-4 text-accent" />
        Recommended Levels
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {LEVELS.map((level) => (
          <LevelCard key={level} level={level} />
        ))}
      </div>
    </section>
  );
}

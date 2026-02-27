import { LevelCard } from '@/components/level-card';
import { LEVELS } from '@/lib/constants';
import { Languages } from 'lucide-react';

export default function HomePage() {
  return (
    <section className="space-y-6 sm:space-y-8">
      <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-panel px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent sm:text-xs">
        <Languages className="h-4 w-4" />
        Deutsch lernen
      </p>
      <h1 className="mt-1 max-w-4xl font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-6xl">
        German Levels
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-muted sm:text-base md:text-lg">
        Start with your CEFR level, learn through curated videos, and navigate sentence-by-sentence with synced transcript timing.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {LEVELS.map((level) => (
          <LevelCard key={level} level={level} />
        ))}
      </div>
    </section>
  );
}

import { LevelCard } from '@/components/level-card';
import { LEVELS } from '@/lib/constants';
import { Flame } from 'lucide-react';

export default function HomePage() {
  return (
    <section className="space-y-6">
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

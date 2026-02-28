import Link from 'next/link';
import { ArrowRight, CirclePlay } from 'lucide-react';

import type { LevelName } from '@/types/database';

interface LevelCardProps {
  level: LevelName;
}

export function LevelCard({ level }: LevelCardProps) {
  return (
    <Link
      href={`/level/${level}`}
      className="group block transition duration-200 hover:-translate-y-1"
    >
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-panel sm:rounded-2xl">
        <div className="relative flex aspect-video items-end justify-between bg-gradient-to-br from-panel via-surface to-panel p-4">
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent dark:from-black/40" />
          <span className="relative rounded-full bg-surface/95 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            German level
          </span>
          <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white">
            <CirclePlay className="h-5 w-5 fill-current" />
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <h2 className="text-3xl font-bold text-ink sm:text-4xl">{level}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Structured videos and clickable transcript practice.
          </p>
          <span className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-accent transition group-hover:translate-x-1">
            Open Level <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

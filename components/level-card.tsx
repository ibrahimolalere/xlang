import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import type { LevelName } from '@/types/database';

interface LevelCardProps {
  level: LevelName;
}

export function LevelCard({ level }: LevelCardProps) {
  return (
    <Link
      href={`/level/${level}`}
      className="group relative overflow-hidden rounded-xl border border-border/75 bg-panel p-5 transition duration-200 hover:-translate-y-1 hover:border-accent/70 sm:rounded-2xl sm:p-6"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-accent/80 to-transparent opacity-0 transition group-hover:opacity-100" />
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">German level</p>
      <h2 className="mt-3 text-3xl font-bold text-ink sm:text-4xl">{level}</h2>
      <p className="mt-3 text-[13px] leading-relaxed text-muted sm:text-sm">
        Structured videos and clickable transcript practice.
      </p>
      <span className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-accent transition group-hover:translate-x-1 sm:mt-6">
        Open Level <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

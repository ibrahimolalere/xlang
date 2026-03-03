import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { LEVEL_CARD_IMAGE } from '@/lib/constants';
import type { LevelName } from '@/types/database';

interface LevelCardProps {
  level: LevelName;
}

export function LevelCard({ level }: LevelCardProps) {
  const image = LEVEL_CARD_IMAGE[level];

  return (
    <Link
      href={`/level/${level}`}
      className="group block transition duration-300 hover:-translate-y-1.5"
    >
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-panel">
        <div className="p-5 pb-2">
          <Image
            src={image}
            alt={`${level} level badge`}
            width={1536}
            height={1024}
            className="h-auto w-full rounded-xl"
          />
        </div>

        <div className="p-5 pt-2 sm:p-6 sm:pt-2">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">{level}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Curated lessons, synced subtitles, and practical vocabulary drills.
          </p>
          <span className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-accent transition group-hover:translate-x-1">
            Open Level <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

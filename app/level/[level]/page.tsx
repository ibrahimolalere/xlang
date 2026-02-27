import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clapperboard } from 'lucide-react';

import { VideoCard } from '@/components/video-card';
import { LEVELS } from '@/lib/constants';
import { getLevelByName, getVideosByLevelId } from '@/lib/server/content';
import type { LevelName, Video } from '@/types/database';

export const dynamic = 'force-dynamic';

interface LevelPageProps {
  params: {
    level: string;
  };
}

export default async function LevelPage({ params }: LevelPageProps) {
  const level = params.level.toUpperCase() as LevelName;

  if (!LEVELS.includes(level)) {
    notFound();
  }

  const levelData = await getLevelByName(level);
  if (!levelData) {
    notFound();
  }

  const videos = (await getVideosByLevelId(levelData.id)) as Video[];

  return (
    <section className="space-y-5 sm:space-y-6">
      <Link
        href="/"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border/70 bg-panel px-3 text-sm font-semibold text-accent transition hover:border-accent/60"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to levels
      </Link>

      <h1 className="inline-flex items-center gap-2 font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
        <Clapperboard className="h-7 w-7 text-accent" />
        {level} Videos
      </h1>
      <p className="text-sm text-muted sm:text-base">
        {videos.length} {videos.length === 1 ? 'video' : 'videos'} available.
      </p>

      {videos.length === 0 ? (
        <div className="rounded-2xl border border-border/80 bg-panel p-6 sm:p-8">
          <p className="text-sm text-muted sm:text-base">
            No videos yet for {level}. Add data in Supabase to populate this level.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </section>
  );
}

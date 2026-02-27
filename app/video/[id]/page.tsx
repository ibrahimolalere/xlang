import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PlayCircle } from 'lucide-react';

import { VideoPlayerWithTranscript } from '@/components/video-player-with-transcript';
import {
  getLevelNameById,
  getTranscriptByVideoId,
  getVideoById
} from '@/lib/server/content';

export const dynamic = 'force-dynamic';

interface VideoPageProps {
  params: {
    id: string;
  };
}

export default async function VideoPage({ params }: VideoPageProps) {
  let video = null;
  try {
    video = await getVideoById(params.id);
  } catch (error) {
    console.error(`Video lookup failed for ${params.id}:`, error);
  }

  if (!video) {
    notFound();
  }

  const [transcript, levelName] = await Promise.all([
    getTranscriptByVideoId(params.id),
    getLevelNameById(video.level_id)
  ]);
  const backHref = levelName ? `/level/${levelName}` : '/';

  return (
    <section className="space-y-5 sm:space-y-6">
      <Link
        href={backHref}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border/70 bg-panel px-3 text-sm font-semibold text-accent transition hover:border-accent/60"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to level list
      </Link>

      <h1 className="inline-flex items-center gap-2 font-[var(--font-heading)] text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-5xl">
        <PlayCircle className="h-7 w-7 text-accent" />
        {video.title}
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
        {video.description}
      </p>

      <VideoPlayerWithTranscript video={video} transcript={transcript} />
    </section>
  );
}

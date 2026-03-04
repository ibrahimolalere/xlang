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
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border/80 bg-panel px-4 text-sm font-semibold text-muted transition hover:border-accent/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <h1 className="inline-flex items-center gap-2 font-[var(--font-heading)] text-xl font-bold tracking-tight text-ink sm:text-2xl md:text-[1.75rem]">
          <PlayCircle className="h-7 w-7 text-accent" />
          {video.title}
        </h1>
      </div>

      <VideoPlayerWithTranscript video={video} transcript={transcript} />
    </section>
  );
}

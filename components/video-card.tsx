import Image from 'next/image';
import Link from 'next/link';
import { Play } from 'lucide-react';

import type { Video } from '@/types/database';

interface VideoCardProps {
  video: Video;
}

export function VideoCard({ video }: VideoCardProps) {
  return (
    <Link
      href={`/video/${video.id}`}
      className="group overflow-hidden rounded-xl border border-border/75 bg-panel transition duration-200 hover:-translate-y-1 hover:border-accent/70 sm:rounded-2xl"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black sm:h-auto">
        <Image
          src={video.thumbnail_url}
          alt={video.title}
          fill
          className="object-contain transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 right-3 rounded-lg bg-surface/90 px-2.5 py-1 text-xs font-bold text-ink">
          {video.duration}
        </div>
        <div className="absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-surface">
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <h3 className="line-clamp-2 text-base font-bold text-ink sm:text-lg">{video.title}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted sm:text-[15px]">
          {video.description}
        </p>
      </div>
    </Link>
  );
}

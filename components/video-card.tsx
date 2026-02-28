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
      className="group block transition duration-200 hover:-translate-y-1"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-border/80">
        <Image
          src={video.thumbnail_url}
          alt={video.title}
          fill
          className="object-contain transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 right-3 rounded-md bg-black/85 px-2.5 py-1 text-xs font-bold text-white">
          {video.duration}
        </div>
        <div className="absolute bottom-3 left-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-white transition group-hover:bg-accent">
          <Play className="h-4 w-4 fill-current" />
        </div>
      </div>
      <div className="px-1 pb-1 pt-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink sm:text-base">
          {video.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted sm:text-[15px]">
          {video.description}
        </p>
      </div>
    </Link>
  );
}

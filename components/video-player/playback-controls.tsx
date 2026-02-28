'use client';

import { Gauge, Maximize2, Minimize2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PLAYER_SPEEDS } from '@/lib/video/subtitle-utils';

interface PlaybackControlsProps {
  playbackRate: number;
  fullscreenMode: 'none' | 'container' | 'internal';
  onSetPlaybackRate: (speed: number) => void;
  onToggleFullscreen: () => void;
}

export function PlaybackControls({
  playbackRate,
  fullscreenMode,
  onSetPlaybackRate,
  onToggleFullscreen
}: PlaybackControlsProps) {
  return (
    <div className="rounded-2xl border border-border/80 bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex h-9 items-center gap-2 rounded-full bg-surface px-3 text-sm font-semibold text-muted">
          <Gauge className="h-4 w-4 text-accent" />
          <span>Playback Speed</span>
        </div>
        <button
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 text-sm font-bold transition',
            fullscreenMode === 'none'
              ? 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
              : 'border-accent bg-accent/12 text-accent'
          )}
          onClick={onToggleFullscreen}
          type="button"
          aria-label={
            fullscreenMode === 'none'
              ? 'Enter interactive fullscreen'
              : 'Exit interactive fullscreen'
          }
          title={
            fullscreenMode === 'none'
              ? 'Enter interactive fullscreen'
              : 'Exit interactive fullscreen'
          }
        >
          {fullscreenMode === 'none' ? (
            <Maximize2 className="h-4 w-4" />
          ) : (
            <Minimize2 className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {fullscreenMode === 'none' ? 'Fullscreen' : 'Exit'}
          </span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {PLAYER_SPEEDS.map((speed) => (
          <button
            key={speed}
            className={cn(
              'h-10 rounded-full border text-sm font-bold transition',
              speed === playbackRate
                ? 'border-accent bg-accent text-white'
                : 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
            )}
            onClick={() => onSetPlaybackRate(speed)}
            type="button"
            aria-label={`Set speed to ${speed}x`}
            aria-pressed={speed === playbackRate}
          >
            {speed}x
          </button>
        ))}
      </div>
    </div>
  );
}

'use client';

import { Gauge, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PLAYER_SPEEDS } from '@/lib/video/subtitle-utils';

interface PlaybackControlsProps {
  playbackRate: number;
  isMuted: boolean;
  volume: number;
  fullscreenMode: 'none' | 'container' | 'internal';
  onSetPlaybackRate: (speed: number) => void;
  onSetMuted: (muted: boolean) => void;
  onSetVolume: (volume: number) => void;
  onToggleFullscreen: () => void;
}

export function PlaybackControls({
  playbackRate,
  isMuted,
  volume,
  fullscreenMode,
  onSetPlaybackRate,
  onSetMuted,
  onSetVolume,
  onToggleFullscreen
}: PlaybackControlsProps) {
  const volumePercent = Math.round((isMuted ? 0 : volume) * 100);

  return (
    <section className="rounded-2xl border border-border/80 bg-surface/90 p-3 sm:p-4">
      <div className="grid gap-2.5 sm:gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
        <div className="flex items-center gap-2.5 rounded-xl border border-border/80 bg-panel px-3 py-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface text-accent">
            <Gauge className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Speed
            </p>
            <p className="truncate text-sm font-semibold text-ink">{playbackRate}x</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-panel px-2.5 py-2">
          <button
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full border transition',
              isMuted || volume === 0
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
            )}
            onClick={() => onSetMuted(!isMuted)}
            type="button"
            aria-label={isMuted ? 'Unmute video' : 'Mute video'}
            title={isMuted ? 'Unmute video' : 'Mute video'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(event) => onSetVolume(Number(event.target.value))}
            className="h-1.5 w-full accent-[rgb(var(--accent))]"
            aria-label="Set volume"
          />
          <span className="w-10 text-right text-xs font-semibold text-muted">
            {volumePercent}%
          </span>
        </div>

        <button
          className={cn(
            'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition md:w-auto',
            fullscreenMode === 'none'
              ? 'border-border/80 bg-panel text-muted hover:border-accent hover:text-accent'
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

      <div className="mt-3 rounded-xl border border-border/80 bg-panel p-1">
        <div className="grid grid-cols-4 gap-1">
          {PLAYER_SPEEDS.map((speed) => (
            <button
              key={speed}
              className={cn(
                'h-10 rounded-lg border text-sm font-semibold transition',
                speed === playbackRate
                  ? 'border-accent bg-accent text-white'
                  : 'border-transparent bg-surface text-muted hover:border-accent/60 hover:text-accent'
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
    </section>
  );
}

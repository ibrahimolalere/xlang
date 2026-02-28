'use client';

import { Bookmark } from 'lucide-react';
import type { RefObject, SyntheticEvent } from 'react';

import { cn } from '@/lib/utils';
import { normalizeWord, tokenizeSentence } from '@/lib/video/subtitle-utils';
import type { TranscriptSentence } from '@/types/database';

interface FullscreenSubtitleOverlayProps {
  sentence: TranscriptSentence;
  isPortraitVideo: boolean;
  activeWordKey: string | null;
  loadingWordKey: string | null;
  wordTranslations: Record<string, string>;
  savedWordsSet: Set<string>;
  videoId: string;
  overlayRef: RefObject<HTMLDivElement>;
  onOverlayInteract: (event: SyntheticEvent) => void;
  onWordClick: (
    event: SyntheticEvent<HTMLButtonElement>,
    word: string,
    tokenKey: string
  ) => void | Promise<void>;
  onSaveWord: (
    event: SyntheticEvent<HTMLButtonElement>,
    params: { token: string; normalized: string; sentence: string }
  ) => void | Promise<void>;
}

export function FullscreenSubtitleOverlay({
  sentence,
  isPortraitVideo,
  activeWordKey,
  loadingWordKey,
  wordTranslations,
  savedWordsSet,
  videoId,
  overlayRef,
  onOverlayInteract,
  onWordClick,
  onSaveWord
}: FullscreenSubtitleOverlayProps) {
  return (
    <div
      ref={overlayRef}
      className={cn(
        'pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2 select-none px-4 text-center touch-none sm:px-6',
        isPortraitVideo
          ? 'bottom-12 w-[min(92%,620px)]'
          : 'bottom-8 w-[min(94%,1100px)] md:bottom-10'
      )}
      onTouchStart={onOverlayInteract}
      onTouchEnd={onOverlayInteract}
      onPointerDown={onOverlayInteract}
      onClick={onOverlayInteract}
    >
      <div
        className={cn(
          'pointer-events-none absolute -bottom-8 left-1/2 -z-10 -translate-x-1/2 rounded-[999px] blur-xl',
          isPortraitVideo
            ? 'h-28 w-[min(98vw,700px)] bg-gradient-to-t from-black/70 via-black/45 to-transparent'
            : 'h-32 w-[min(96vw,1300px)] bg-gradient-to-t from-black/75 via-black/45 to-transparent'
        )}
      />
      <div
        className={cn(
          'inline rounded-md bg-black/58 px-4 py-2.5 font-black leading-[1.2] text-white',
          isPortraitVideo
            ? 'text-[clamp(1.05rem,3.3vw,1.95rem)]'
            : 'text-[clamp(1.45rem,2.8vw,2.75rem)]'
        )}
      >
        {tokenizeSentence(sentence.text).map((token, index) => {
          const normalized = normalizeWord(token);
          const isWord = normalized.length > 0;
          const tokenKey = `fullscreen-${sentence.id}-${index}`;
          const isWordActive = activeWordKey === tokenKey;
          const translation = wordTranslations[normalized];
          const isWordSaved = savedWordsSet.has(`${videoId}:${normalized}`);

          if (!isWord) {
            return (
              <span key={tokenKey} className="whitespace-pre">
                {token}
              </span>
            );
          }

          return (
            <span key={tokenKey} className="relative inline-block">
              <button
                className={cn(
                  'inline rounded-md px-1.5 py-0.5 transition',
                  isWordActive ? 'bg-accent text-white' : 'text-white hover:bg-white/20'
                )}
                onTouchStart={onOverlayInteract}
                onPointerDown={(event) => {
                  onOverlayInteract(event);
                  void onWordClick(event, token, tokenKey);
                }}
                type="button"
              >
                {token}
              </button>
              {isWordActive ? (
                <div className="absolute left-1/2 top-full z-20 mt-3 flex -translate-x-1/2 flex-col gap-1 whitespace-nowrap rounded-xl border border-black/10 bg-white px-4 py-2 text-left shadow-lg shadow-black/25">
                  <span className="text-lg font-semibold text-accent">{token}</span>
                  <span className="text-xl font-semibold text-slate-900">
                    {loadingWordKey === tokenKey
                      ? '...'
                      : (translation ?? 'translation unavailable')}
                  </span>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex w-fit items-center justify-center rounded-md border p-1.5 transition',
                      isWordSaved
                        ? 'border-warm bg-warm/15 text-warm'
                        : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                    )}
                    onTouchStart={onOverlayInteract}
                    onPointerDown={(event) => {
                      onOverlayInteract(event);
                      void onSaveWord(event, {
                        token,
                        normalized,
                        sentence: sentence.text
                      });
                    }}
                    disabled={loadingWordKey === tokenKey}
                    aria-label={isWordSaved ? 'Unsave word' : 'Save word'}
                    title={isWordSaved ? 'Unsave word' : 'Save word'}
                  >
                    <Bookmark className={cn('h-4 w-4', isWordSaved ? 'fill-current' : '')} />
                  </button>
                </div>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { Bookmark, Eye, EyeOff } from 'lucide-react';
import type { MouseEvent, MutableRefObject, SyntheticEvent } from 'react';

import { cn } from '@/lib/utils';
import { normalizeWord, tokenizeSentence } from '@/lib/video/subtitle-utils';
import type { TranscriptSentence } from '@/types/database';

export interface ActivePhraseSelection {
  sentenceId: string;
  phraseKey: string;
  normalized: string;
  text: string;
  sentenceText: string;
}

interface TranscriptPanelProps {
  transcript: TranscriptSentence[];
  currentSentenceId: string | undefined;
  activePhrase: ActivePhraseSelection | null;
  loadingPhraseKey: string | null;
  phraseTranslations: Record<string, string>;
  savedWordsSet: Set<string>;
  videoId: string;
  activeWordKey: string | null;
  loadingWordKey: string | null;
  wordTranslations: Record<string, string>;
  showSentenceTranslations: boolean;
  sentenceTranslations: Record<string, string>;
  sentenceRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  onToggleSentenceTranslations: () => void;
  onSeek: (seconds: number) => void;
  onPhraseSelection: (
    event: MouseEvent<HTMLDivElement>,
    sentence: TranscriptSentence
  ) => void | Promise<void>;
  onTogglePhraseSave: (event: MouseEvent<HTMLButtonElement>, phrase: ActivePhraseSelection) => void;
  onWordClick: (
    event: SyntheticEvent<HTMLButtonElement>,
    word: string,
    tokenKey: string
  ) => void | Promise<void>;
  onSaveWord: (
    event: SyntheticEvent<HTMLButtonElement>,
    params: { token: string; normalized: string; sentence: string }
  ) => void;
}

export function TranscriptPanel({
  transcript,
  currentSentenceId,
  activePhrase,
  loadingPhraseKey,
  phraseTranslations,
  savedWordsSet,
  videoId,
  activeWordKey,
  loadingWordKey,
  wordTranslations,
  showSentenceTranslations,
  sentenceTranslations,
  sentenceRefs,
  onToggleSentenceTranslations,
  onSeek,
  onPhraseSelection,
  onTogglePhraseSave,
  onWordClick,
  onSaveWord
}: TranscriptPanelProps) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-border/80 bg-panel xl:flex xl:max-h-[78vh] xl:flex-col">
      <div className="sticky top-0 z-10 border-b border-border/80 bg-panel/95 px-4 py-4 backdrop-blur sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-ink">Transcript</h2>
            <p className="mt-1 text-sm font-medium text-muted">
              Listen your way: show or hide English support while following German.
            </p>
          </div>
          <button
            type="button"
            className={cn(
              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition',
              showSentenceTranslations
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border/80 bg-surface text-muted hover:border-accent hover:text-accent'
            )}
            onClick={onToggleSentenceTranslations}
            aria-label={
              showSentenceTranslations
                ? 'Hide English translations'
                : 'Show English translations'
            }
            title={
              showSentenceTranslations
                ? 'Hide English translations'
                : 'Show English translations'
            }
          >
            {showSentenceTranslations ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="max-h-[56vh] space-y-2.5 overflow-y-auto px-4 pb-4 pt-3 sm:max-h-[62vh] sm:px-5 sm:pb-5 xl:max-h-none xl:flex-1">
        {transcript.length === 0 ? (
          <p className="rounded-xl border border-border/80 bg-surface p-4 text-sm text-muted">
            Transcript is not available yet for this video.
          </p>
        ) : null}
        {transcript.map((sentence) => {
          const isActive = sentence.id === currentSentenceId;
          const hasActivePhrase = activePhrase?.sentenceId === sentence.id;
          const phraseTranslation = hasActivePhrase
            ? phraseTranslations[activePhrase.normalized]
            : undefined;
          const isPhraseSaved = hasActivePhrase
            ? savedWordsSet.has(`${videoId}:${activePhrase.normalized}`)
            : false;

          return (
            <div
              key={sentence.id}
              ref={(node) => {
                sentenceRefs.current[sentence.id] = node;
              }}
              className={cn(
                'rounded-xl border p-3 transition sm:p-4',
                isActive
                  ? 'border-accent bg-accent/10'
                  : 'border-border/80 bg-surface hover:border-accent/50'
              )}
            >
              <div
                className="w-full cursor-pointer text-left"
                onClick={() => {
                  const selected = window.getSelection()?.toString().trim();
                  if (selected) {
                    return;
                  }
                  onSeek(sentence.start_time);
                }}
                onMouseUp={(event) => {
                  void onPhraseSelection(event, sentence);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSeek(sentence.start_time);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {hasActivePhrase && activePhrase ? (
                  <div className="mb-2 mt-2 inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-panel px-3 py-2 text-xs font-semibold text-ink sm:text-sm">
                    <span className="text-xs font-medium sm:text-sm">
                      {loadingPhraseKey === activePhrase.phraseKey
                        ? '...'
                        : (phraseTranslation ?? 'translation unavailable')}
                    </span>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex items-center justify-center rounded-md border p-1.5 transition',
                        isPhraseSaved
                          ? 'border-warm bg-warm/15 text-warm'
                          : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                      )}
                      onClick={(event) => onTogglePhraseSave(event, activePhrase)}
                      disabled={loadingPhraseKey === activePhrase.phraseKey}
                      aria-label={isPhraseSaved ? 'Unsave phrase' : 'Save phrase'}
                      title={isPhraseSaved ? 'Unsave phrase' : 'Save phrase'}
                    >
                      <Bookmark className={cn('h-4 w-4', isPhraseSaved ? 'fill-current' : '')} />
                    </button>
                  </div>
                ) : null}
                <div className="mt-1 font-[var(--font-heading)] text-lg font-bold leading-relaxed text-ink sm:text-xl">
                  {tokenizeSentence(sentence.text).map((token, index) => {
                    const normalized = normalizeWord(token);
                    const isWord = normalized.length > 0;
                    const tokenKey = `${sentence.id}-${index}`;
                    const isWordActive = activeWordKey === tokenKey;
                    const translation = wordTranslations[normalized];
                    const isWordSaved = savedWordsSet.has(`${videoId}:${normalized}`);

                    if (!isWord) {
                      return <span key={tokenKey}>{token}</span>;
                    }

                    return (
                      <span key={tokenKey} className="relative inline-block">
                        <button
                          className={cn(
                            'inline rounded px-1 py-0.5 transition',
                            isWordActive ? 'bg-accent/20' : 'hover:bg-accent/10'
                          )}
                          onClick={(event) => onWordClick(event, token, tokenKey)}
                          type="button"
                        >
                          {token}
                        </button>
                        {isWordActive ? (
                          <span className="absolute bottom-full left-1/2 z-10 mb-1.5 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-border/80 bg-panel px-3 py-2 text-xs font-semibold text-ink sm:text-sm">
                            <span className="text-xs font-medium sm:text-sm">
                              {loadingWordKey === tokenKey
                                ? '...'
                                : (translation ?? 'translation unavailable')}
                            </span>
                            <button
                              type="button"
                              className={cn(
                                'inline-flex items-center justify-center rounded-md border p-1.5 transition',
                                isWordSaved
                                  ? 'border-warm bg-warm/15 text-warm'
                                  : 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                              )}
                              onClick={(event) =>
                                onSaveWord(event, {
                                  token,
                                  normalized,
                                  sentence: sentence.text
                                })
                              }
                              disabled={loadingWordKey === tokenKey}
                              aria-label={isWordSaved ? 'Unsave word' : 'Save word'}
                              title={isWordSaved ? 'Unsave word' : 'Save word'}
                            >
                              <Bookmark
                                className={cn('h-4 w-4', isWordSaved ? 'fill-current' : '')}
                              />
                            </button>
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </div>
                {showSentenceTranslations ? (
                  <p className="mt-2 font-[var(--font-heading)] text-base font-normal leading-relaxed text-muted sm:text-lg">
                    {sentenceTranslations[sentence.id] ?? '...'}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

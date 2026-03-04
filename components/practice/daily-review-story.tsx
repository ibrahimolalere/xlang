'use client';

import { Bookmark, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { getCurrentStoryBatch, REVIEW_STORY_BATCH_SIZE } from '@/lib/review-story';
import { cn } from '@/lib/utils';
import { toggleSavedWord, type SavedWord } from '@/lib/vocabulary';
import { normalizeWord, tokenizeSentence } from '@/lib/video/subtitle-utils';

interface DailyReviewStoryProps {
  savedWords: SavedWord[];
  learnerKey: string;
}

const STORY_VIDEO_ID = 'daily-review-story';
const STORY_VIDEO_TITLE = 'Daily Review Story';

const HIGHLIGHT_STYLES = [
  'bg-blue-500/18 text-blue-700 ring-1 ring-blue-400/45 dark:bg-blue-500/28 dark:text-blue-200 dark:ring-blue-300/45',
  'bg-emerald-500/18 text-emerald-700 ring-1 ring-emerald-400/45 dark:bg-emerald-500/28 dark:text-emerald-200 dark:ring-emerald-300/45',
  'bg-orange-500/18 text-orange-700 ring-1 ring-orange-400/45 dark:bg-orange-500/28 dark:text-orange-200 dark:ring-orange-300/45',
  'bg-sky-500/18 text-sky-700 ring-1 ring-sky-400/45 dark:bg-sky-500/28 dark:text-sky-200 dark:ring-sky-300/45'
] as const;

function buildStory(words: string[]) {
  const safe = [...words];
  while (safe.length < REVIEW_STORY_BATCH_SIZE) {
    safe.push(words[words.length - 1] ?? 'Wort');
  }

  const [w1, w2, w3, w4, w5, w6, w7, w8, w9, w10] = safe;
  return [
    `Heute lerne ich ${w1}, ${w2} und ${w3}.`,
    `Danach treffe ich ${w4} und wir sprechen über ${w5}, ${w6} und ${w7}.`,
    `Am Abend wiederhole ich ${w8}, ${w9} und ${w10}.`
  ].join(' ');
}

async function fetchTranslation(value: string) {
  const response = await fetch('/api/translate-word', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ word: value })
  });

  if (!response.ok) {
    throw new Error(`Translation failed (${response.status})`);
  }

  const payload = (await response.json()) as { translation?: string };
  return String(payload.translation ?? 'translation unavailable').trim() || 'translation unavailable';
}

export function DailyReviewStory({ savedWords, learnerKey }: DailyReviewStoryProps) {
  const [activeTokenKey, setActiveTokenKey] = useState<string | null>(null);
  const [loadingTokenKey, setLoadingTokenKey] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [sessionSaved, setSessionSaved] = useState<Set<string>>(new Set());
  const { words: storyBatchWords } = useMemo(() => getCurrentStoryBatch(savedWords), [savedWords]);

  const uniqueSavedWords = useMemo(() => {
    const seen = new Set<string>();
    const next: Array<{ normalized: string; original: string }> = [];

    for (const word of storyBatchWords) {
      const normalized = normalizeWord(word.word || word.normalizedWord);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      next.push({ normalized, original: word.word });
      if (next.length >= REVIEW_STORY_BATCH_SIZE) {
        break;
      }
    }

    return next;
  }, [storyBatchWords]);

  const canBuildStory = storyBatchWords.length >= REVIEW_STORY_BATCH_SIZE;
  const storyText = useMemo(
    () => (canBuildStory ? buildStory(uniqueSavedWords.map((entry) => entry.original)) : ''),
    [canBuildStory, uniqueSavedWords]
  );

  const storyTokens = useMemo(() => tokenizeSentence(storyText), [storyText]);

  const highlightMap = useMemo(() => {
    const next = new Map<string, string>();
    uniqueSavedWords.forEach((entry, index) => {
      next.set(entry.normalized, HIGHLIGHT_STYLES[index % HIGHLIGHT_STYLES.length]);
    });
    return next;
  }, [uniqueSavedWords]);

  const savedNormalizedSet = useMemo(() => {
    const next = new Set<string>();
    for (const item of savedWords) {
      const normalized = normalizeWord(item.word || item.normalizedWord);
      if (normalized) {
        next.add(normalized);
      }
    }
    return next;
  }, [savedWords]);

  useEffect(() => {
    setSessionSaved(new Set());
  }, [savedWords, learnerKey]);

  if (!canBuildStory) {
    const needed = Math.max(0, REVIEW_STORY_BATCH_SIZE - storyBatchWords.length);
    return (
      <section className="rounded-2xl border border-border/80 bg-panel p-4 sm:p-5">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          Daily Review Story
        </p>
        <p className="mt-3 text-sm font-semibold text-muted sm:text-base">
          Save {needed} more {needed === 1 ? 'word' : 'words'} to unlock your short story practice.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-panel p-4 sm:p-5">
      <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        Daily Review Story
      </p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Tap any word to translate. Saved words are color-highlighted.
      </p>

      <div className="mt-4 rounded-xl border border-border/80 bg-surface p-4 sm:p-5">
        <p className="font-[var(--font-heading)] text-xl font-bold leading-relaxed text-ink sm:text-2xl">
          {storyTokens.map((token, index) => {
            const normalized = normalizeWord(token);
            const tokenKey = `${normalized || 'sep'}-${index}`;

            if (!normalized) {
              return <span key={tokenKey}>{token}</span>;
            }

            const highlightClass = highlightMap.get(normalized);
            const isSaved = savedNormalizedSet.has(normalized) || sessionSaved.has(normalized);
            const isActive = activeTokenKey === tokenKey;
            const translation = translations[normalized];

            return (
              <span key={tokenKey} className="relative inline-block">
                <button
                  type="button"
                  onClick={async () => {
                    if (isActive) {
                      setActiveTokenKey(null);
                      return;
                    }

                    setActiveTokenKey(tokenKey);
                    if (translations[normalized]) {
                      return;
                    }

                    setLoadingTokenKey(tokenKey);
                    try {
                      const translated = await fetchTranslation(normalized);
                      setTranslations((previous) => ({
                        ...previous,
                        [normalized]: translated
                      }));
                    } catch {
                      setTranslations((previous) => ({
                        ...previous,
                        [normalized]: 'translation unavailable'
                      }));
                    } finally {
                      setLoadingTokenKey(null);
                    }
                  }}
                  className={cn(
                    'inline rounded px-1 py-0.5 transition hover:bg-accent/10',
                    highlightClass
                  )}
                >
                  {token}
                </button>

                {isActive ? (
                  <span className="absolute bottom-full left-1/2 z-20 mb-1.5 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-border/80 bg-panel px-3 py-2 text-xs font-semibold text-ink sm:text-sm">
                    <span className="text-xs font-medium sm:text-sm">
                      {loadingTokenKey === tokenKey ? '...' : (translation ?? 'translation unavailable')}
                    </span>

                    {!isSaved ? (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-md border border-accent bg-accent/10 p-1.5 text-accent transition hover:bg-accent/20"
                        onClick={async (event) => {
                          event.stopPropagation();
                          const translationText =
                            translations[normalized] ?? 'translation unavailable';

                          await Promise.resolve(
                            toggleSavedWord({
                              learnerKey,
                              word: token,
                              normalizedWord: normalized,
                              translation: translationText,
                              sentence: storyText,
                              videoId: STORY_VIDEO_ID,
                              videoTitle: STORY_VIDEO_TITLE
                            })
                          );

                          setSessionSaved((previous) => {
                            const next = new Set(previous);
                            next.add(normalized);
                            return next;
                          });
                        }}
                        aria-label="Save word"
                        title="Save word"
                      >
                        <Bookmark className="h-4 w-4" />
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </span>
            );
          })}
        </p>
      </div>
    </section>
  );
}

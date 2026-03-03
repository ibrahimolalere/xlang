'use client';

import Link from 'next/link';
import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';
import {
  SAVED_WORDS_UPDATED_EVENT,
  clearSavedWords,
  getSavedWords,
  removeSavedWord,
  syncSavedWordsFromServer,
  type SavedWord
} from '@/lib/vocabulary';

export function SavedWordsList() {
  const { user } = useSupabaseAuth();
  const learnerKey = user?.id ?? 'guest';
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const refresh = async () => {
      setSavedWords(getSavedWords(learnerKey));
      if (learnerKey !== 'guest') {
        const synced = await syncSavedWordsFromServer(learnerKey);
        setSavedWords(synced);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === `xlang_saved_words:${learnerKey}`) {
        void refresh();
      }
    };

    const handleSavedWordsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ learnerKey?: string }>;
      const eventLearnerKey = customEvent.detail?.learnerKey ?? 'guest';
      if (eventLearnerKey === learnerKey) {
        void refresh();
      }
    };

    void refresh();
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      SAVED_WORDS_UPDATED_EVENT,
      handleSavedWordsUpdated as EventListener
    );
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        SAVED_WORDS_UPDATED_EVENT,
        handleSavedWordsUpdated as EventListener
      );
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [learnerKey]);

  const handleRemove = (id: string) => {
    setSavedWords(removeSavedWord({ id, learnerKey }));
    setRevealedIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });
  };

  const handleClear = () => {
    clearSavedWords(learnerKey);
    setSavedWords([]);
    setRevealedIds(new Set());
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (savedWords.length === 0) {
    return (
      <div className="rounded-2xl border border-border/80 bg-panel p-6 text-center sm:p-8">
        <p className="text-sm leading-relaxed text-muted sm:text-base">
          No saved vocabulary yet. Open a video and save words, phrases, or full transcript lines.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{savedWords.length} saved items</p>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-panel text-ink transition hover:border-accent hover:bg-accent/10"
          aria-label="Clear all saved words"
          title="Clear all saved words"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {savedWords.map((item) => {
          const revealed = revealedIds.has(item.id);

          return (
            <article
              key={item.id}
              className="rounded-2xl border border-border/80 bg-panel p-4 transition hover:-translate-y-0.5 sm:p-5"
            >
              <button
                type="button"
                onClick={() => toggleReveal(item.id)}
                className="w-full rounded-xl border border-border/80 bg-surface p-4 text-left transition hover:border-accent/60 sm:p-5"
                aria-label={`Toggle meaning for ${item.word}`}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
                  {revealed ? 'Meaning' : 'Word'}
                </p>
                <p className="mt-2 text-xl font-bold text-ink sm:text-2xl">
                  {revealed ? item.translation : item.word}
                </p>
                <p className="mt-3 text-xs text-muted">
                  {revealed ? 'Tap to hide meaning' : 'Tap to reveal meaning'}
                </p>
              </button>

              <p className="mt-3 text-sm leading-relaxed text-muted sm:text-[15px]">
                {item.sentence}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href={`/video/${item.videoId}`}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-accent/50 text-accent transition hover:bg-accent/10"
                  aria-label="Open source video"
                  title="Open source video"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 text-ink transition hover:border-accent"
                  aria-label="Remove saved word"
                  title="Remove saved word"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

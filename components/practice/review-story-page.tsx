'use client';

import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';
import { DailyReviewStory } from '@/components/practice/daily-review-story';
import {
  hasUnreadReviewStory,
  markCurrentReviewStoryAsSeen
} from '@/lib/review-story';
import {
  SAVED_WORDS_UPDATED_EVENT,
  getSavedWords,
  syncSavedWordsFromServer,
  type SavedWord
} from '@/lib/vocabulary';

export function ReviewStoryPageClient() {
  const { user } = useSupabaseAuth();
  const learnerKey = user?.id ?? 'guest';
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);

  const refreshSavedWords = useCallback(async () => {
    const local = getSavedWords(learnerKey);
    setSavedWords(local);

    if (learnerKey !== 'guest') {
      const synced = await syncSavedWordsFromServer(learnerKey);
      setSavedWords(synced);
    }
  }, [learnerKey]);

  useEffect(() => {
    void refreshSavedWords();

    const onFocus = () => {
      void refreshSavedWords();
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('xlang_saved_words')) {
        void refreshSavedWords();
      }
    };

    const onSavedWordsUpdate = (event: Event) => {
      const custom = event as CustomEvent<{ learnerKey?: string }>;
      const eventLearnerKey = custom.detail?.learnerKey ?? 'guest';
      if (eventLearnerKey === learnerKey) {
        void refreshSavedWords();
      }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener(SAVED_WORDS_UPDATED_EVENT, onSavedWordsUpdate as EventListener);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(
        SAVED_WORDS_UPDATED_EVENT,
        onSavedWordsUpdate as EventListener
      );
    };
  }, [learnerKey, refreshSavedWords]);

  useEffect(() => {
    if (savedWords.length === 0) {
      return;
    }

    if (hasUnreadReviewStory(learnerKey, savedWords)) {
      markCurrentReviewStoryAsSeen(learnerKey, savedWords);
    }
  }, [learnerKey, savedWords]);

  const savedCountLabel = useMemo(
    () => `${savedWords.length} ${savedWords.length === 1 ? 'saved item' : 'saved items'}`,
    [savedWords.length]
  );

  return (
    <section className="space-y-5 sm:space-y-6">
      <div className="rounded-2xl border border-border/80 bg-panel p-5 sm:p-6">
        <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted sm:text-xs">
          <Sparkles className="h-4 w-4 text-accent" />
          Review Story
        </p>
        <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Story Practice
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Every complete set of 10 saved words unlocks a fresh short story for focused review.
        </p>
      </div>

      <DailyReviewStory savedWords={savedWords} learnerKey={learnerKey} />

      <p className="text-sm font-semibold text-muted">{savedCountLabel}</p>
    </section>
  );
}

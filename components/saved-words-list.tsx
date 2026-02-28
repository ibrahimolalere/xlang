'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  BadgeCheck,
  ExternalLink,
  Mail,
  MessageCircle,
  RefreshCcw,
  Trash2
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  LEARNER_PROFILE_UPDATED_EVENT,
  getLearnerProfile,
  setLearnerKey,
  updateLearnerContact
} from '@/lib/learner';
import {
  SAVED_WORDS_UPDATED_EVENT,
  clearSavedWordsLocal,
  getSavedWords,
  markSavedWordAsLearned,
  removeSavedWord,
  syncSavedWordsFromServer,
  type SavedWord
} from '@/lib/vocabulary';
import type { LearnerContactType } from '@/types/database';

interface QuizState {
  options: string[];
  selected: string | null;
  isCorrect: boolean | null;
}

function shuffleArray<T>(values: T[]) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = next[index];
    next[index] = next[swapIndex];
    next[swapIndex] = current;
  }
  return next;
}

function buildQuizOptions(savedWords: SavedWord[], item: SavedWord) {
  const distractors = shuffleArray(
    Array.from(
      new Set(
        savedWords
          .filter((word) => word.id !== item.id)
          .map((word) => word.translation)
          .filter(Boolean)
      )
    )
  ).slice(0, 3);

  const options = shuffleArray(
    Array.from(new Set([item.translation, ...distractors]))
  ).slice(0, 4);

  if (!options.includes(item.translation)) {
    options[0] = item.translation;
    return shuffleArray(options);
  }

  return options;
}

export function SavedWordsList() {
  const searchParams = useSearchParams();
  const [savedWords, setSavedWordsState] = useState<SavedWord[]>([]);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [quizById, setQuizById] = useState<Record<string, QuizState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [contactStatus, setContactStatus] = useState<string | null>(null);

  const [learnerKey, setLearnerKeyState] = useState('');
  const [contactType, setContactType] = useState<LearnerContactType>('email');
  const [contactValue, setContactValue] = useState('');

  const refresh = async (params?: { forceServer?: boolean }) => {
    const profile = getLearnerProfile();
    setLearnerKeyState(profile.learnerKey);
    setContactType((profile.contactType as LearnerContactType) ?? 'email');
    setContactValue(profile.contactValue ?? '');

    try {
      const profileResponse = await fetch(
        `/api/learner/profile?learnerKey=${encodeURIComponent(profile.learnerKey)}`,
        { method: 'GET', cache: 'no-store' }
      );
      if (profileResponse.ok) {
        const profileResult = (await profileResponse.json().catch(() => ({}))) as {
          contactType?: LearnerContactType | null;
          contactValue?: string | null;
        };
        if (
          (profileResult.contactType === 'email' ||
            profileResult.contactType === 'whatsapp') &&
          typeof profileResult.contactValue === 'string' &&
          profileResult.contactValue.trim()
        ) {
          setContactType(profileResult.contactType);
          setContactValue(profileResult.contactValue);
        }
      }
    } catch {
      // Ignore profile fetch failures and continue with local profile.
    }

    try {
      if (params?.forceServer ?? true) {
        const words = await syncSavedWordsFromServer(profile.learnerKey);
        setSavedWordsState(words);
        return;
      }
    } catch {
      // Fall through to local cache when the network call fails.
    }

    setSavedWordsState(getSavedWords());
  };

  useEffect(() => {
    const learnerFromLink = String(searchParams.get('learner') ?? '').trim();
    if (learnerFromLink) {
      setLearnerKey(learnerFromLink);
    }

    const handleFocus = () => {
      void refresh();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'xlang_saved_words') {
        void refresh({ forceServer: false });
      }
    };

    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };

    const handleSavedWordsUpdated = () => {
      void refresh({ forceServer: false });
    };

    const handleLearnerProfileUpdated = () => {
      setContactStatus(null);
      void refresh();
    };

    void refresh().finally(() => setIsLoading(false));
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      SAVED_WORDS_UPDATED_EVENT,
      handleSavedWordsUpdated as EventListener
    );
    window.addEventListener(
      LEARNER_PROFILE_UPDATED_EVENT,
      handleLearnerProfileUpdated as EventListener
    );
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        SAVED_WORDS_UPDATED_EVENT,
        handleSavedWordsUpdated as EventListener
      );
      window.removeEventListener(
        LEARNER_PROFILE_UPDATED_EVENT,
        handleLearnerProfileUpdated as EventListener
      );
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [searchParams]);

  const activeQuizCount = useMemo(
    () => Object.values(quizById).filter((quiz) => quiz.isCorrect === null).length,
    [quizById]
  );

  const handleSaveContact = async () => {
    if (!learnerKey || !contactValue.trim()) {
      return;
    }

    setIsSavingContact(true);
    setContactStatus(null);

    try {
      const response = await fetch('/api/learner/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnerKey,
          contactType,
          contactValue
        })
      });

      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setContactStatus(result.error ?? 'Unable to save contact details.');
        return;
      }

      updateLearnerContact({ contactType, contactValue });
      setContactStatus('Contact saved. 24-hour vocabulary reminders are active.');
    } catch {
      setContactStatus('Network error while saving contact details.');
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleRemove = async (word: SavedWord) => {
    if (!learnerKey) {
      return;
    }

    const next = await removeSavedWord({
      learnerKey,
      id: word.id,
      videoId: word.videoId,
      normalizedWord: word.normalizedWord
    });
    setSavedWordsState(next);
    setRevealedIds((previous) => {
      const updated = new Set(previous);
      updated.delete(word.id);
      return updated;
    });
  };

  const handleClear = async () => {
    if (!learnerKey || savedWords.length === 0) {
      clearSavedWordsLocal();
      setSavedWordsState([]);
      setQuizById({});
      return;
    }

    await Promise.all(
      savedWords.map((word) =>
        removeSavedWord({
          learnerKey,
          id: word.id,
          videoId: word.videoId,
          normalizedWord: word.normalizedWord
        })
      )
    );

    clearSavedWordsLocal();
    setSavedWordsState([]);
    setQuizById({});
    setRevealedIds(new Set());
  };

  const handleMarkLearned = async (word: SavedWord) => {
    if (!learnerKey) {
      return;
    }

    const next = await markSavedWordAsLearned({ learnerKey, id: word.id });
    setSavedWordsState(next);
    setQuizById((previous) => {
      const updated = { ...previous };
      delete updated[word.id];
      return updated;
    });
  };

  const handleStartQuiz = (word: SavedWord) => {
    const options = buildQuizOptions(savedWords, word);
    setQuizById((previous) => ({
      ...previous,
      [word.id]: {
        options,
        selected: null,
        isCorrect: null
      }
    }));
  };

  const handleSubmitQuizAnswer = async (word: SavedWord, selectedOption: string) => {
    const isCorrect = selectedOption === word.translation;
    setQuizById((previous) => ({
      ...previous,
      [word.id]: {
        ...(previous[word.id] ?? {
          options: buildQuizOptions(savedWords, word)
        }),
        selected: selectedOption,
        isCorrect
      }
    }));

    if (isCorrect) {
      await handleMarkLearned(word);
    }
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

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-panel p-6 text-center sm:p-8">
        <p className="text-sm text-muted sm:text-base">Loading saved vocabulary...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="rounded-2xl border border-border/80 bg-panel p-4 sm:p-5">
        <h2 className="text-lg font-bold text-ink sm:text-xl">24-hour Reminder Setup</h2>
        <p className="mt-1 text-sm text-muted">
          Add an email or WhatsApp number. After 24 hours, saved words are sent with a quiz link.
        </p>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex w-full rounded-xl border border-border/80 bg-surface p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => setContactType('email')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                contactType === 'email'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setContactType('whatsapp')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                contactType === 'whatsapp'
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>

          <input
            value={contactValue}
            onChange={(event) => setContactValue(event.target.value)}
            type={contactType === 'email' ? 'email' : 'tel'}
            placeholder={
              contactType === 'email' ? 'name@example.com' : '+2348012345678'
            }
            className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent"
          />

          <button
            type="button"
            onClick={() => {
              void handleSaveContact();
            }}
            disabled={isSavingContact}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-accent bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSavingContact ? 'Saving...' : 'Save contact'}
          </button>
        </div>

        {contactStatus ? (
          <p className="mt-2 text-xs font-medium text-muted">{contactStatus}</p>
        ) : null}
      </section>

      {savedWords.length === 0 ? (
        <div className="rounded-2xl border border-border/80 bg-panel p-6 text-center sm:p-8">
          <p className="text-sm leading-relaxed text-muted sm:text-base">
            No saved vocabulary yet. Open a video and save words, phrases, or transcript lines.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted">
              {savedWords.length} saved items
              {activeQuizCount > 0 ? ` • ${activeQuizCount} quiz in progress` : ''}
            </p>
            <button
              type="button"
              onClick={() => {
                void handleClear();
              }}
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
              const quizState = quizById[item.id];

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-border/80 bg-panel p-4 sm:p-5"
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

                  {quizState ? (
                    <div className="mt-3 rounded-xl border border-border/80 bg-surface p-3">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
                        Quick quiz: choose meaning
                      </p>
                      <div className="mt-2 grid gap-2">
                        {quizState.options.map((option) => {
                          const selected = quizState.selected === option;
                          const isCorrectOption = option === item.translation;
                          return (
                            <button
                              key={option}
                              type="button"
                              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                                selected
                                  ? isCorrectOption
                                    ? 'border-green-500 bg-green-50 text-green-700'
                                    : 'border-red-500 bg-red-50 text-red-700'
                                  : 'border-border/80 bg-panel text-ink hover:border-accent'
                              }`}
                              onClick={() => {
                                void handleSubmitQuizAnswer(item, option);
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                      {quizState.selected && quizState.isCorrect === false ? (
                        <p className="mt-2 text-xs font-semibold text-red-600">
                          Not quite. Try again or mark as learned manually.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
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
                      onClick={() => handleStartQuiz(item)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 text-ink transition hover:border-accent"
                      aria-label="Start quiz"
                      title="Start quiz"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleMarkLearned(item);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 text-ink transition hover:border-green-500 hover:text-green-600"
                      aria-label="Mark as learned"
                      title="Mark as learned"
                    >
                      <BadgeCheck className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleRemove(item);
                      }}
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
        </>
      )}
    </div>
  );
}

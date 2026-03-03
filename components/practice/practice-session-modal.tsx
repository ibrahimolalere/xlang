'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Languages,
  Loader2,
  Sparkles,
  X
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useSupabaseAuth } from '@/components/auth/supabase-auth-provider';
import { syncSavedWordsFromServer } from '@/lib/vocabulary';
import { cn } from '@/lib/utils';

interface PracticeWord {
  id: string;
  word: string;
  translation: string;
  savedAt: string;
}

type SubmitResult = 'idle' | 'correct' | 'wrong';

function formatSavedTime(savedAt: string) {
  const parsed = new Date(savedAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'from a previous study block';
  }
  return `saved ${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

export function PracticeSessionModal() {
  const pathname = usePathname();
  const { user, session, isLoading } = useSupabaseAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [words, setWords] = useState<PracticeWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitResult, setSubmitResult] = useState<SubmitResult>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentWord = words[currentIndex] ?? null;
  const progress = words.length > 0 ? (currentIndex + 1) / words.length : 0;

  const shouldSuppress =
    !pathname || pathname.startsWith('/admin') || pathname.startsWith('/auth');

  const resetAnswerState = () => {
    setAnswer('');
    setSubmitResult('idle');
    setFeedback(null);
    setError(null);
  };

  const hydrateDuePracticeDeck = useCallback(async () => {
    if (!session?.access_token || !user?.id) {
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetch('/api/user/practice', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Unable to load practice (${response.status}).`);
      }

      const result = (await response.json()) as { words?: PracticeWord[] };
      const dueWords = Array.isArray(result.words) ? result.words : [];

      if (dueWords.length > 0) {
        setWords(dueWords);
        setCurrentIndex(0);
        resetAnswerState();
        setIsOpen(true);
      }
    } catch {
      // Silent fallback: user can continue platform usage even if practice API is unavailable.
    } finally {
      setIsFetching(false);
    }
  }, [session?.access_token, user?.id]);

  useEffect(() => {
    if (shouldSuppress || isLoading || !user?.id) {
      return;
    }

    void hydrateDuePracticeDeck();
  }, [hydrateDuePracticeDeck, isLoading, shouldSuppress, user?.id]);

  const handleSubmit = async () => {
    if (!currentWord || !session?.access_token || !answer.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/user/practice', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: currentWord.id,
          action: 'submit',
          answer
        })
      });

      if (!response.ok) {
        throw new Error(`Unable to submit answer (${response.status}).`);
      }

      const result = (await response.json()) as {
        result?: 'correct' | 'wrong';
        expected?: string;
      };

      if (result.result === 'correct') {
        setSubmitResult('correct');
        setFeedback('Great answer. This word is marked as learned.');
      } else {
        setSubmitResult('wrong');
        setFeedback(result.expected ? `Expected: ${result.expected}` : 'Not quite. Try again next review.');
      }
    } catch {
      setError('Could not submit answer. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const moveToNextWord = async () => {
    const isLast = currentIndex >= words.length - 1;
    if (isLast) {
      setIsOpen(false);
      if (user?.id) {
        await syncSavedWordsFromServer(user.id);
      }
      return;
    }

    setCurrentIndex((previous) => previous + 1);
    resetAnswerState();
  };

  const handleSkipCurrent = async () => {
    if (!currentWord || !session?.access_token) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/user/practice', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: currentWord.id,
          action: 'skip'
        })
      });

      if (!response.ok) {
        throw new Error(`Unable to skip word (${response.status}).`);
      }

      await moveToNextWord();
    } catch {
      setError('Could not skip this word right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipDeck = async () => {
    if (!session?.access_token || !currentWord) {
      setIsOpen(false);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const remainingWords = words.slice(currentIndex);
      await Promise.all(
        remainingWords.map((word) =>
          fetch('/api/user/practice', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id: word.id,
              action: 'skip'
            })
          })
        )
      );
    } catch {
      // Best effort: close modal regardless and schedule as much as possible.
    } finally {
      setIsSubmitting(false);
      setIsOpen(false);
    }

    if (user?.id) {
      await syncSavedWordsFromServer(user.id);
    }
  };

  if (!user || shouldSuppress || (!isOpen && !isFetching)) {
    return null;
  }

  return (
    <>
      {isFetching ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[120] inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/95 px-4 py-2 text-sm font-semibold text-muted shadow-[0_8px_22px_rgba(15,23,42,0.12)] backdrop-blur">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Preparing your practice deck
        </div>
      ) : null}

      {isOpen && currentWord ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-[5px] sm:p-5">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/30 bg-white shadow-[0_24px_70px_rgba(2,6,23,0.38)]">
            <div className="border-b border-border/70 bg-[linear-gradient(94deg,rgba(255,153,48,0.14)_0%,rgba(255,255,255,1)_42%,rgba(255,255,255,1)_100%)] p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-accent">
                    <Sparkles className="h-3.5 w-3.5 stroke-[2.2]" />
                    Practice Ready
                  </p>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-[2.1rem]">
                    Time to review your saved words
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
                    Type the English meaning. Correct answers are marked learned. Skipped words return in 1 minute.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSkipDeck}
                  disabled={isSubmitting}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-slate-300/80 bg-white px-4 text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4 stroke-[2.2]" />
                  Skip deck
                </button>
              </div>

              <div className="mt-5">
                <div className="mb-2.5 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                  <span>
                    Word {currentIndex + 1} of {words.length}
                  </span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-300/80">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#ff9f43_0%,#f97316_100%)] transition-[width] duration-300"
                    style={{ width: `${Math.max(8, progress * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-[radial-gradient(100%_100%_at_50%_0%,#323844_0%,#1f232b_46%,#151922_100%)] p-5 sm:p-6">
              <div
                className={cn(
                  'rounded-2xl border border-white/12 bg-black/58 p-5 text-slate-50 backdrop-blur-[1px] transition-colors sm:p-6',
                  submitResult === 'correct' && 'border-green-300/55 bg-green-900/18',
                  submitResult === 'wrong' && 'border-red-300/55 bg-red-900/18'
                )}
              >
                <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300/90">
                  <Clock3 className="h-3.5 w-3.5 text-accent" />
                  {formatSavedTime(currentWord.savedAt).toUpperCase()}
                </p>
                <p className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-[3.1rem]">
                  {currentWord.word}
                </p>

                <label className="mt-6 block">
                  <span className="mb-2.5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300/85">
                    <Languages className="h-3.5 w-3.5 text-accent" />
                    English translation
                  </span>
                  <input
                    type="text"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && submitResult === 'idle') {
                        event.preventDefault();
                        void handleSubmit();
                      }
                    }}
                    disabled={isSubmitting || submitResult !== 'idle'}
                    className={cn(
                      'h-12 w-full rounded-xl border px-3.5 text-base font-semibold text-ink outline-none transition',
                      submitResult === 'correct' &&
                        'border-green-400 bg-green-50/95 text-green-900 focus:border-green-500',
                      submitResult === 'wrong' &&
                        'border-red-400 bg-red-50/95 text-red-900 focus:border-red-500',
                      submitResult === 'idle' &&
                        'border-white/35 bg-white text-slate-900 focus:border-accent'
                    )}
                    placeholder="Type your translation"
                  />
                </label>

                {feedback ? (
                  <p
                    className={cn(
                      'mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold',
                      submitResult === 'correct' &&
                        'border border-green-300/70 bg-green-100/70 text-green-800',
                      submitResult === 'wrong' &&
                        'border border-red-300/70 bg-red-100/70 text-red-800'
                    )}
                  >
                    {submitResult === 'correct' ? (
                      <CheckCircle2 className="h-4 w-4 stroke-[2.3]" />
                    ) : (
                      <AlertCircle className="h-4 w-4 stroke-[2.3]" />
                    )}
                    {feedback}
                  </p>
                ) : null}

                {error ? (
                  <p className="mt-3 rounded-lg border border-red-300/70 bg-red-100/85 px-3 py-2 text-sm font-semibold text-red-800">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
                {submitResult === 'idle' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleSkipCurrent}
                      disabled={isSubmitting}
                      className="inline-flex h-11 items-center rounded-full border border-slate-300/75 bg-white px-5 text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Skip word
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting || !answer.trim()}
                      className="inline-flex h-11 items-center rounded-full bg-[linear-gradient(90deg,#ff9f43_0%,#f97316_100%)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking
                        </>
                      ) : (
                        'Check answer'
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void moveToNextWord()}
                    disabled={isSubmitting}
                    className="inline-flex h-11 items-center rounded-full bg-[linear-gradient(90deg,#ff9f43_0%,#f97316_100%)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {currentIndex >= words.length - 1 ? 'Finish review' : 'Next word'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

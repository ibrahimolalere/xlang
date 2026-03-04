import type { SavedWord } from '@/lib/vocabulary';

export const REVIEW_STORY_BATCH_SIZE = 10;
export const REVIEW_STORY_SEEN_EVENT = 'xlang:review-story-seen';

function normalizeLearnerKey(learnerKey?: string) {
  const trimmed = String(learnerKey ?? '').trim();
  return trimmed || 'guest';
}

function getSeenBatchStorageKey(learnerKey?: string) {
  return `xlang_review_story_seen_batch:${normalizeLearnerKey(learnerKey)}`;
}

function parseDate(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getStoryEligibleWords(savedWords: SavedWord[]) {
  return [...savedWords].sort((a, b) => parseDate(a.savedAt) - parseDate(b.savedAt));
}

export function getCurrentStoryBatchIndex(savedWords: SavedWord[]) {
  const completeBatches = Math.floor(savedWords.length / REVIEW_STORY_BATCH_SIZE);
  if (completeBatches <= 0) {
    return -1;
  }
  return completeBatches - 1;
}

export function getCurrentStoryBatch(savedWords: SavedWord[]) {
  const eligible = getStoryEligibleWords(savedWords);
  const batchIndex = getCurrentStoryBatchIndex(eligible);
  if (batchIndex < 0) {
    return {
      batchIndex: -1,
      totalBatches: 0,
      words: [] as SavedWord[]
    };
  }

  const start = batchIndex * REVIEW_STORY_BATCH_SIZE;
  return {
    batchIndex,
    totalBatches: batchIndex + 1,
    words: eligible.slice(start, start + REVIEW_STORY_BATCH_SIZE)
  };
}

export function getSeenStoryBatchIndex(learnerKey?: string) {
  if (typeof window === 'undefined') {
    return -1;
  }

  const raw = window.localStorage.getItem(getSeenBatchStorageKey(learnerKey));
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

export function hasUnreadReviewStory(learnerKey: string, savedWords: SavedWord[]) {
  const { batchIndex } = getCurrentStoryBatch(savedWords);
  if (batchIndex < 0) {
    return false;
  }
  return getSeenStoryBatchIndex(learnerKey) < batchIndex;
}

export function markCurrentReviewStoryAsSeen(learnerKey: string, savedWords: SavedWord[]) {
  if (typeof window === 'undefined') {
    return false;
  }

  const { batchIndex } = getCurrentStoryBatch(savedWords);
  if (batchIndex < 0) {
    return false;
  }

  const seen = getSeenStoryBatchIndex(learnerKey);
  if (seen >= batchIndex) {
    return false;
  }

  window.localStorage.setItem(getSeenBatchStorageKey(learnerKey), String(batchIndex));
  window.dispatchEvent(
    new CustomEvent<{ learnerKey: string; batchIndex: number }>(REVIEW_STORY_SEEN_EVENT, {
      detail: { learnerKey, batchIndex }
    })
  );
  return true;
}

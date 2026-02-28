export interface SavedWord {
  id: string;
  word: string;
  normalizedWord: string;
  translation: string;
  sentence: string;
  videoId: string;
  videoTitle: string;
  savedAt: string;
}

const STORAGE_KEY = 'xlang_saved_words';
export const SAVED_WORDS_UPDATED_EVENT = 'xlang:saved-words-updated';

function readStorage(): SavedWord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as SavedWord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function writeStorage(words: SavedWord[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  window.dispatchEvent(
    new CustomEvent<{ words: SavedWord[] }>(SAVED_WORDS_UPDATED_EVENT, {
      detail: { words }
    })
  );
}

export function getSavedWords(): SavedWord[] {
  return readStorage();
}

export function setSavedWords(words: SavedWord[]) {
  writeStorage(words);
}

export function removeSavedWordLocalById(id: string) {
  const next = readStorage().filter((word) => word.id !== id);
  writeStorage(next);
  return next;
}

export function clearSavedWordsLocal() {
  writeStorage([]);
}

export async function syncSavedWordsFromServer(learnerKey: string) {
  if (!learnerKey) {
    return readStorage();
  }

  const response = await fetch(
    `/api/learner/saved-words?learnerKey=${encodeURIComponent(learnerKey)}`,
    {
      method: 'GET',
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    return readStorage();
  }

  const result = (await response.json().catch(() => ({ words: [] }))) as {
    words?: SavedWord[];
  };

  const words = Array.isArray(result.words) ? result.words : [];
  writeStorage(words);
  return words;
}

interface ToggleSavedWordInput {
  learnerKey: string;
  word: string;
  normalizedWord: string;
  translation: string;
  sentence: string;
  videoId: string;
  videoTitle: string;
}

export async function toggleSavedWord(params: ToggleSavedWordInput) {
  const existing = readStorage();
  const keyMatch = (item: SavedWord) =>
    item.videoId === params.videoId && item.normalizedWord === params.normalizedWord;
  const duplicate = existing.find(keyMatch);

  if (duplicate) {
    try {
      await fetch(
        `/api/learner/saved-words?learnerKey=${encodeURIComponent(params.learnerKey)}&videoId=${encodeURIComponent(params.videoId)}&normalizedWord=${encodeURIComponent(params.normalizedWord)}`,
        { method: 'DELETE' }
      );
    } catch {
      // Keep local unsave behavior even if network call fails.
    }

    const next = existing.filter((item) => !keyMatch(item));
    writeStorage(next);
    return { saved: false, words: next };
  }

  let savedWord: SavedWord | null = null;
  try {
    const response = await fetch('/api/learner/saved-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    const result = (await response
      .json()
      .catch(() => ({ word: null }))) as { word?: SavedWord | null };
    savedWord = result.word ?? null;
  } catch {
    // Fall back to local save.
  }

  const resolvedSavedWord =
    savedWord ??
    ({
      id: `${params.videoId}-${params.normalizedWord}-${Date.now()}`,
      word: params.word,
      normalizedWord: params.normalizedWord,
      translation: params.translation,
      sentence: params.sentence,
      videoId: params.videoId,
      videoTitle: params.videoTitle,
      savedAt: new Date().toISOString()
    } satisfies SavedWord);

  const next = [resolvedSavedWord, ...existing.filter((item) => !keyMatch(item))];
  writeStorage(next);
  return { saved: true, words: next };
}

export async function markSavedWordAsLearned(params: { learnerKey: string; id: string }) {
  try {
    await fetch('/api/learner/saved-words/learned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
  } catch {
    // Keep local progression even when the network request fails.
  }

  return removeSavedWordLocalById(params.id);
}

export async function removeSavedWord(params: {
  learnerKey: string;
  id: string;
  videoId: string;
  normalizedWord: string;
}) {
  try {
    await fetch(
      `/api/learner/saved-words?learnerKey=${encodeURIComponent(params.learnerKey)}&videoId=${encodeURIComponent(params.videoId)}&normalizedWord=${encodeURIComponent(params.normalizedWord)}`,
      { method: 'DELETE' }
    );
  } catch {
    // Keep local remove behavior when network call fails.
  }

  return removeSavedWordLocalById(params.id);
}

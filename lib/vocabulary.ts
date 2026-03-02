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

export function saveWord(
  payload: Omit<SavedWord, 'id' | 'savedAt'>
): { saved: boolean; savedWord?: SavedWord } {
  const existing = readStorage();
  const duplicate = existing.find(
    (word) =>
      word.normalizedWord === payload.normalizedWord && word.videoId === payload.videoId
  );

  if (duplicate) {
    return { saved: false, savedWord: duplicate };
  }

  const next: SavedWord = {
    ...payload,
    id: `${payload.videoId}-${payload.normalizedWord}-${Date.now()}`,
    savedAt: new Date().toISOString()
  };

  writeStorage([next, ...existing]);
  return { saved: true, savedWord: next };
}

export function clearSavedWords() {
  writeStorage([]);
}

export function clearSavedWordsLocal() {
  writeStorage([]);
}

export function removeSavedWordLocalById(id: string) {
  const existing = readStorage();
  const next = existing.filter((word) => word.id !== id);
  writeStorage(next);
  return next;
}

export async function syncSavedWordsFromServer(_learnerKey: string) {
  void _learnerKey;
  // Local-only fallback: keep existing saved words in storage.
  return readStorage();
}

interface ToggleSavedWordInput {
  learnerKey?: string;
  word: string;
  normalizedWord: string;
  translation: string;
  sentence: string;
  videoId: string;
  videoTitle: string;
}

export function toggleSavedWord(
  payload: ToggleSavedWordInput
): { saved: boolean; words: SavedWord[] } {
  const existing = readStorage();
  const existingIndex = existing.findIndex(
    (word) =>
      word.normalizedWord === payload.normalizedWord && word.videoId === payload.videoId
  );

  if (existingIndex >= 0) {
    const next = [...existing];
    next.splice(existingIndex, 1);
    writeStorage(next);
    return { saved: false, words: next };
  }

  const nextWord: SavedWord = {
    ...payload,
    id: `${payload.videoId}-${payload.normalizedWord}-${Date.now()}`,
    savedAt: new Date().toISOString()
  };

  const next = [nextWord, ...existing];
  writeStorage(next);
  return { saved: true, words: next };
}

export async function markSavedWordAsLearned(params: { learnerKey?: string; id: string }) {
  return removeSavedWordLocalById(params.id);
}

export function removeSavedWord(
  params:
    | string
    | {
        learnerKey?: string;
        id: string;
        videoId?: string;
        normalizedWord?: string;
      }
) {
  if (typeof params === 'string') {
    return removeSavedWordLocalById(params);
  }

  return removeSavedWordLocalById(params.id);
}

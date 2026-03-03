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

const STORAGE_KEY_PREFIX = 'xlang_saved_words';
export const SAVED_WORDS_UPDATED_EVENT = 'xlang:saved-words-updated';

function normalizeLearnerKey(learnerKey?: string): string {
  const trimmed = String(learnerKey ?? '').trim();
  return trimmed || 'guest';
}

function getStorageKey(learnerKey?: string): string {
  return `${STORAGE_KEY_PREFIX}:${normalizeLearnerKey(learnerKey)}`;
}

function parseSavedWords(raw: string | null): SavedWord[] {
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as SavedWord[];
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed;
}

function readStorage(learnerKey?: string): SavedWord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storageKey = getStorageKey(learnerKey);
    const scoped = parseSavedWords(window.localStorage.getItem(storageKey));
    if (scoped.length > 0) {
      return scoped;
    }

    // Backward compatibility for older builds that used one global key.
    const legacy = parseSavedWords(window.localStorage.getItem(STORAGE_KEY_PREFIX));
    if (legacy.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(legacy));
      window.localStorage.removeItem(STORAGE_KEY_PREFIX);
      return legacy;
    }

    return scoped;
  } catch {
    return [];
  }
}

function writeStorage(words: SavedWord[], learnerKey?: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalizedLearnerKey = normalizeLearnerKey(learnerKey);
  window.localStorage.setItem(getStorageKey(normalizedLearnerKey), JSON.stringify(words));
  window.dispatchEvent(
    new CustomEvent<{ words: SavedWord[]; learnerKey: string }>(SAVED_WORDS_UPDATED_EVENT, {
      detail: { words, learnerKey: normalizedLearnerKey }
    })
  );
}

async function getAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const [{ createSupabaseBrowserClient }] = await Promise.all([
      import('@/lib/supabase/browser')
    ]);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return null;
    }
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function requestServerSavedWords<T = { words: SavedWord[] }>(
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown
) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return null;
  }

  const response = await fetch('/api/user/saved-words', {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Saved words request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}

export function getSavedWords(learnerKey?: string): SavedWord[] {
  return readStorage(learnerKey);
}

export function setSavedWords(words: SavedWord[], learnerKey?: string) {
  writeStorage(words, learnerKey);
}

export function saveWord(
  payload: Omit<SavedWord, 'id' | 'savedAt'> & { learnerKey?: string }
): { saved: boolean; savedWord?: SavedWord } {
  const existing = readStorage(payload.learnerKey);
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

  writeStorage([next, ...existing], payload.learnerKey);
  return { saved: true, savedWord: next };
}

export function clearSavedWords(learnerKey?: string) {
  writeStorage([], learnerKey);

  if (learnerKey && learnerKey !== 'guest') {
    void requestServerSavedWords('DELETE', { clearAll: true }).catch(() => {
      // Keep local clear result when server sync fails.
    });
  }
}

export function clearSavedWordsLocal(learnerKey?: string) {
  writeStorage([], learnerKey);
}

export function removeSavedWordLocalById(id: string, learnerKey?: string) {
  const existing = readStorage(learnerKey);
  const next = existing.filter((word) => word.id !== id);
  writeStorage(next, learnerKey);
  return next;
}

export async function syncSavedWordsFromServer(learnerKey: string) {
  if (!learnerKey || learnerKey === 'guest') {
    return readStorage(learnerKey);
  }

  try {
    const result = await requestServerSavedWords<{ words: SavedWord[] }>('GET');
    if (result?.words) {
      writeStorage(result.words, learnerKey);
      return result.words;
    }
  } catch {
    // Fall back to local storage when server sync fails.
  }

  return readStorage(learnerKey);
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
  const existing = readStorage(payload.learnerKey);
  const existingIndex = existing.findIndex(
    (word) =>
      word.normalizedWord === payload.normalizedWord && word.videoId === payload.videoId
  );

  if (existingIndex >= 0) {
    const next = [...existing];
    next.splice(existingIndex, 1);
    writeStorage(next, payload.learnerKey);

    if (payload.learnerKey && payload.learnerKey !== 'guest') {
      void requestServerSavedWords('POST', {
        word: payload.word,
        normalizedWord: payload.normalizedWord,
        translation: payload.translation,
        sentence: payload.sentence,
        videoId: payload.videoId,
        videoTitle: payload.videoTitle
      })
        .then((result) => {
          if (result?.words) {
            writeStorage(result.words, payload.learnerKey);
          }
        })
        .catch(() => {
          // Keep local result when server sync fails.
        });
    }

    return { saved: false, words: next };
  }

  const nextWord: SavedWord = {
    ...payload,
    id: `${payload.videoId}-${payload.normalizedWord}-${Date.now()}`,
    savedAt: new Date().toISOString()
  };

  const next = [nextWord, ...existing];
  writeStorage(next, payload.learnerKey);

  if (payload.learnerKey && payload.learnerKey !== 'guest') {
    void requestServerSavedWords('POST', {
      word: payload.word,
      normalizedWord: payload.normalizedWord,
      translation: payload.translation,
      sentence: payload.sentence,
      videoId: payload.videoId,
      videoTitle: payload.videoTitle
    })
      .then((result) => {
        if (result?.words) {
          writeStorage(result.words, payload.learnerKey);
        }
      })
      .catch(() => {
        // Keep local result when server sync fails.
      });
  }

  return { saved: true, words: next };
}

export async function markSavedWordAsLearned(params: { learnerKey?: string; id: string }) {
  return removeSavedWordLocalById(params.id, params.learnerKey);
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

  const next = removeSavedWordLocalById(params.id, params.learnerKey);

  if (params.learnerKey && params.learnerKey !== 'guest') {
    void requestServerSavedWords('DELETE', { id: params.id })
      .then((result) => {
        if (result?.words) {
          writeStorage(result.words, params.learnerKey);
        }
      })
      .catch(() => {
        // Keep local result when server sync fails.
      });
  }

  return next;
}

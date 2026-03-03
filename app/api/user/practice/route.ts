import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface PracticeWordRow {
  id: string;
  user_id: string;
  word: string;
  translation: string;
  created_at: string;
  next_practice_at: string;
}

interface PracticeWordResponse {
  id: string;
  word: string;
  translation: string;
  savedAt: string;
}

const REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STUDY_WINDOW_MS = 2 * 60 * 60 * 1000;

function getNextPracticeIso() {
  return new Date(Date.now() + REVIEW_INTERVAL_MS).toISOString();
}

function normalizeTranslation(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|a|an|the)\s+/, '');
}

function buildExpectedVariants(expected: string) {
  const variants = expected
    .split(/[,;/|]|(?:\bor\b)|(?:\boder\b)/gi)
    .map((token) => normalizeTranslation(token))
    .filter(Boolean);

  const normalizedExpected = normalizeTranslation(expected);
  if (normalizedExpected) {
    variants.push(normalizedExpected);
  }

  return Array.from(new Set(variants));
}

function isCorrectTranslation(input: string, expected: string) {
  const normalizedInput = normalizeTranslation(input);
  if (!normalizedInput) {
    return false;
  }

  return buildExpectedVariants(expected).includes(normalizedInput);
}

async function authenticate(request: NextRequest): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }

  const accessToken = header.slice('Bearer '.length).trim();
  if (!accessToken) {
    return null;
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

async function getDueWordsForUser(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('saved_words')
    .select('id, user_id, word, translation, created_at, next_practice_at')
    .eq('user_id', userId)
    .lte('next_practice_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    throw error;
  }

  return (data ?? []) as PracticeWordRow[];
}

function buildPracticeSession(words: PracticeWordRow[]) {
  if (words.length === 0) {
    return [] as PracticeWordResponse[];
  }

  const firstCreatedAtMs = new Date(words[0].created_at).getTime();
  const maxWindowMs = firstCreatedAtMs + STUDY_WINDOW_MS;

  return words
    .filter((word) => new Date(word.created_at).getTime() <= maxWindowMs)
    .map((word) => ({
      id: word.id,
      word: word.word,
      translation: word.translation,
      savedAt: word.created_at
    }));
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const dueWords = await getDueWordsForUser(userId);
    const words = buildPracticeSession(dueWords);
    return NextResponse.json({ words });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to load practice session: ${error.message}`
            : 'Failed to load practice session.'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { id?: string; action?: 'submit' | 'skip'; answer?: string }
      | null;
    const id = String(body?.id ?? '').trim();
    const action = body?.action;
    const answer = String(body?.answer ?? '').trim();

    if (!id || (action !== 'submit' && action !== 'skip')) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: rows, error: fetchError } = await supabaseAdmin
      .from('saved_words')
      .select('id, user_id, translation')
      .eq('id', id)
      .eq('user_id', userId)
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    const row = rows?.[0] as { id: string; user_id: string; translation: string } | undefined;
    if (!row) {
      return NextResponse.json({ error: 'Practice word not found.' }, { status: 404 });
    }

    if (action === 'skip') {
      const { error: skipError } = await supabaseAdmin
        .from('saved_words')
        .update({
          next_practice_at: getNextPracticeIso(),
          last_practiced_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (skipError) {
        throw skipError;
      }

      return NextResponse.json({ result: 'skipped' as const, expected: row.translation });
    }

    const correct = isCorrectTranslation(answer, row.translation);

    if (correct) {
      const { error: deleteError } = await supabaseAdmin
        .from('saved_words')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      return NextResponse.json({ result: 'correct' as const, expected: row.translation });
    }

    const { error: wrongError } = await supabaseAdmin
      .from('saved_words')
      .update({
        next_practice_at: getNextPracticeIso(),
        last_practiced_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (wrongError) {
      throw wrongError;
    }

    return NextResponse.json({ result: 'wrong' as const, expected: row.translation });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to submit practice answer: ${error.message}`
            : 'Failed to submit practice answer.'
      },
      { status: 500 }
    );
  }
}

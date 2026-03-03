import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface SavedWordRow {
  id: string;
  user_id: string;
  word: string;
  normalized_word: string;
  translation: string;
  sentence: string;
  video_id: string;
  video_title: string;
  created_at: string;
}

interface SavedWordPayload {
  word: string;
  normalizedWord: string;
  translation: string;
  sentence: string;
  videoId: string;
  videoTitle: string;
}

function mapSavedWord(row: SavedWordRow) {
  return {
    id: row.id,
    word: row.word,
    normalizedWord: row.normalized_word,
    translation: row.translation,
    sentence: row.sentence,
    videoId: row.video_id,
    videoTitle: row.video_title,
    savedAt: row.created_at
  };
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

async function getSavedWordsForUser(userId: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin
    .from('saved_words')
    .select(
      'id, user_id, word, normalized_word, translation, sentence, video_id, video_title, created_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as SavedWordRow[]).map(mapSavedWord);
}

function validateTogglePayload(value: unknown): SavedWordPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = value as Partial<SavedWordPayload>;
  const word = String(payload.word ?? '').trim();
  const normalizedWord = String(payload.normalizedWord ?? '').trim().toLowerCase();
  const translation = String(payload.translation ?? '').trim();
  const sentence = String(payload.sentence ?? '').trim();
  const videoId = String(payload.videoId ?? '').trim();
  const videoTitle = String(payload.videoTitle ?? '').trim();

  if (!word || !normalizedWord || !translation || !sentence || !videoId || !videoTitle) {
    return null;
  }

  return {
    word,
    normalizedWord,
    translation,
    sentence,
    videoId,
    videoTitle
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const words = await getSavedWordsForUser(userId);
    return NextResponse.json({ words });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to fetch saved words: ${error.message}`
            : 'Failed to fetch saved words.'
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

    const payload = validateTogglePayload(await request.json().catch(() => null));
    if (!payload) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('saved_words')
      .select('id')
      .eq('user_id', userId)
      .eq('video_id', payload.videoId)
      .eq('normalized_word', payload.normalizedWord)
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    let saved = false;
    const existingId = existingRows?.[0]?.id;

    if (existingId) {
      const { error: deleteError } = await supabaseAdmin
        .from('saved_words')
        .delete()
        .eq('id', existingId)
        .eq('user_id', userId);
      if (deleteError) {
        throw deleteError;
      }
      saved = false;
    } else {
      const { error: insertError } = await supabaseAdmin.from('saved_words').insert({
        user_id: userId,
        word: payload.word,
        normalized_word: payload.normalizedWord,
        translation: payload.translation,
        sentence: payload.sentence,
        video_id: payload.videoId,
        video_title: payload.videoTitle
      });
      if (insertError) {
        throw insertError;
      }
      saved = true;
    }

    const words = await getSavedWordsForUser(userId);
    return NextResponse.json({ saved, words });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to toggle saved word: ${error.message}`
            : 'Failed to toggle saved word.'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await authenticate(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { id?: string; clearAll?: boolean }
      | null;
    const clearAll = Boolean(body?.clearAll);
    const id = String(body?.id ?? '').trim();

    const supabaseAdmin = createSupabaseAdminClient();
    if (clearAll) {
      const { error: clearError } = await supabaseAdmin
        .from('saved_words')
        .delete()
        .eq('user_id', userId);
      if (clearError) {
        throw clearError;
      }
    } else if (id) {
      const { error: deleteError } = await supabaseAdmin
        .from('saved_words')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);
      if (deleteError) {
        throw deleteError;
      }
    } else {
      return NextResponse.json({ error: 'Missing id or clearAll.' }, { status: 400 });
    }

    const words = await getSavedWordsForUser(userId);
    return NextResponse.json({ words });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Failed to delete saved word: ${error.message}`
            : 'Failed to delete saved word.'
      },
      { status: 500 }
    );
  }
}

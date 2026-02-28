import { NextResponse } from 'next/server';

import { ensureLearnerProfile, normalizeLearnerKey } from '@/lib/server/learner';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface SavedWordPayload {
  learnerKey?: string;
  word?: string;
  normalizedWord?: string;
  translation?: string;
  sentence?: string;
  videoId?: string;
  videoTitle?: string;
}

function mapRow(row: {
  id: string;
  word: string;
  normalized_word: string;
  translation: string;
  sentence: string;
  video_id: string;
  video_title: string;
  saved_at: string;
}) {
  return {
    id: row.id,
    word: row.word,
    normalizedWord: row.normalized_word,
    translation: row.translation,
    sentence: row.sentence,
    videoId: row.video_id,
    videoTitle: row.video_title,
    savedAt: row.saved_at
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const learnerKey = normalizeLearnerKey(searchParams.get('learnerKey') ?? '');

  if (!learnerKey) {
    return NextResponse.json({ error: 'learnerKey is required.' }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    await ensureLearnerProfile({ supabase, learnerKey });

    const { data, error } = await supabase
      .from('learner_saved_words')
      .select(
        'id, word, normalized_word, translation, sentence, video_id, video_title, saved_at'
      )
      .eq('learner_key', learnerKey)
      .eq('status', 'saved')
      .order('saved_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Failed to query saved words: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ words: (data ?? []).map(mapRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SavedWordPayload;
    const learnerKey = normalizeLearnerKey(body.learnerKey ?? '');

    if (!learnerKey) {
      return NextResponse.json({ error: 'learnerKey is required.' }, { status: 400 });
    }

    const word = String(body.word ?? '').trim();
    const normalizedWord = String(body.normalizedWord ?? '').trim().toLowerCase();
    const translation = String(body.translation ?? '').trim() || 'translation unavailable';
    const sentence = String(body.sentence ?? '').trim();
    const videoId = String(body.videoId ?? '').trim();
    const videoTitle = String(body.videoTitle ?? '').trim();

    if (!word || !normalizedWord || !sentence || !videoId || !videoTitle) {
      return NextResponse.json(
        {
          error:
            'word, normalizedWord, sentence, videoId, and videoTitle are required.'
        },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    await ensureLearnerProfile({ supabase, learnerKey });

    const { data: existing, error: existingError } = await supabase
      .from('learner_saved_words')
      .select(
        'id, status, word, normalized_word, translation, sentence, video_id, video_title, saved_at'
      )
      .eq('learner_key', learnerKey)
      .eq('video_id', videoId)
      .eq('normalized_word', normalizedWord)
      .order('saved_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: `Failed to query existing saved word: ${existingError.message}` },
        { status: 500 }
      );
    }

    if (existing && existing.status === 'saved') {
      return NextResponse.json({ saved: true, created: false, word: mapRow(existing) });
    }

    const nowIso = new Date().toISOString();
    const dueIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    if (existing && existing.status === 'learned') {
      const { data: updated, error: updateError } = await supabase
        .from('learner_saved_words')
        .update({
          word,
          translation,
          sentence,
          video_title: videoTitle,
          status: 'saved',
          saved_at: nowIso,
          learned_at: null,
          reminder_due_at: dueIso,
          reminder_sent_at: null
        })
        .eq('id', existing.id)
        .select(
          'id, word, normalized_word, translation, sentence, video_id, video_title, saved_at'
        )
        .single();

      if (updateError || !updated) {
        return NextResponse.json(
          { error: `Failed to restore saved word: ${updateError?.message ?? 'Unknown error.'}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ saved: true, created: true, word: mapRow(updated) });
    }

    const { data: inserted, error: insertError } = await supabase
      .from('learner_saved_words')
      .insert({
        learner_key: learnerKey,
        word,
        normalized_word: normalizedWord,
        translation,
        sentence,
        video_id: videoId,
        video_title: videoTitle,
        reminder_due_at: dueIso
      })
      .select(
        'id, word, normalized_word, translation, sentence, video_id, video_title, saved_at'
      )
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: `Failed to save word: ${insertError?.message ?? 'Unknown error.'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ saved: true, created: true, word: mapRow(inserted) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const learnerKey = normalizeLearnerKey(searchParams.get('learnerKey') ?? '');
  const videoId = String(searchParams.get('videoId') ?? '').trim();
  const normalizedWord = String(searchParams.get('normalizedWord') ?? '')
    .trim()
    .toLowerCase();

  if (!learnerKey || !videoId || !normalizedWord) {
    return NextResponse.json(
      { error: 'learnerKey, videoId, and normalizedWord are required.' },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('learner_saved_words')
      .delete()
      .eq('learner_key', learnerKey)
      .eq('video_id', videoId)
      .eq('normalized_word', normalizedWord)
      .eq('status', 'saved');

    if (error) {
      return NextResponse.json(
        { error: `Failed to remove saved word: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ removed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

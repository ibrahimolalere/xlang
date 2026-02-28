import { NextResponse } from 'next/server';

import { normalizeLearnerKey } from '@/lib/server/learner';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { learnerKey?: string; id?: string };
    const learnerKey = normalizeLearnerKey(body.learnerKey ?? '');
    const id = String(body.id ?? '').trim();

    if (!learnerKey || !id) {
      return NextResponse.json(
        { error: 'learnerKey and id are required.' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from('learner_saved_words')
      .update({
        status: 'learned',
        learned_at: new Date().toISOString()
      })
      .eq('learner_key', learnerKey)
      .eq('id', id)
      .eq('status', 'saved');

    if (error) {
      return NextResponse.json(
        { error: `Failed to mark word as learned: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

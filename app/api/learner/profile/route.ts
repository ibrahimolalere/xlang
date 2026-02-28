import { NextResponse } from 'next/server';

import {
  ensureLearnerProfile,
  isValidContact,
  normalizeContactValue,
  normalizeLearnerKey
} from '@/lib/server/learner';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LearnerContactType } from '@/types/database';

export const runtime = 'nodejs';

function parseContactType(value: unknown): LearnerContactType | null {
  const parsed = String(value ?? '')
    .trim()
    .toLowerCase();
  if (parsed === 'email' || parsed === 'whatsapp') {
    return parsed;
  }
  return null;
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
      .from('learner_profiles')
      .select('learner_key, contact_type, contact_value')
      .eq('learner_key', learnerKey)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: `Failed to load learner profile: ${error?.message ?? 'Not found.'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      learnerKey: data.learner_key,
      contactType: data.contact_type ?? null,
      contactValue: data.contact_value ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      learnerKey?: string;
      contactType?: string;
      contactValue?: string;
    };

    const learnerKey = normalizeLearnerKey(body.learnerKey ?? '');
    const contactType = parseContactType(body.contactType);
    const contactValueInput = String(body.contactValue ?? '').trim();

    if (!learnerKey) {
      return NextResponse.json({ error: 'learnerKey is required.' }, { status: 400 });
    }
    if (!contactType) {
      return NextResponse.json(
        { error: 'contactType must be email or whatsapp.' },
        { status: 400 }
      );
    }
    if (!contactValueInput) {
      return NextResponse.json({ error: 'contactValue is required.' }, { status: 400 });
    }

    const contactValue = normalizeContactValue(contactValueInput, contactType);
    if (!isValidContact(contactValue, contactType)) {
      return NextResponse.json(
        { error: `Invalid ${contactType} contact format.` },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    await ensureLearnerProfile({
      supabase,
      learnerKey,
      contactType,
      contactValue
    });

    return NextResponse.json({
      ok: true,
      learnerKey,
      contactType,
      contactValue
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';

import type { LearnerContactType } from '@/types/database';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_REGEX = /^\+?[1-9]\d{7,14}$/;

export function normalizeLearnerKey(value: string) {
  return value.trim();
}

export function normalizeContactValue(value: string, type: LearnerContactType) {
  const trimmed = value.trim();

  if (type === 'email') {
    return trimmed.toLowerCase();
  }

  return trimmed.replace(/[^\d+]/g, '');
}

export function isValidContact(value: string, type: LearnerContactType) {
  if (type === 'email') {
    return EMAIL_REGEX.test(value);
  }

  return WHATSAPP_REGEX.test(value);
}

export async function ensureLearnerProfile(params: {
  supabase: SupabaseClient;
  learnerKey: string;
  contactType?: LearnerContactType;
  contactValue?: string;
}) {
  const { supabase, learnerKey, contactType, contactValue } = params;

  if (contactType && contactValue) {
    const { error } = await supabase.from('learner_profiles').upsert(
      {
        learner_key: learnerKey,
        contact_type: contactType,
        contact_value: contactValue,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'learner_key' }
    );

    if (error) {
      throw new Error(`Failed to save learner profile: ${error.message}`);
    }
    return;
  }

  const { data, error } = await supabase
    .from('learner_profiles')
    .select('learner_key')
    .eq('learner_key', learnerKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to query learner profile: ${error.message}`);
  }

  if (data) {
    return;
  }

  const { error: insertError } = await supabase.from('learner_profiles').insert({
    learner_key: learnerKey
  });

  if (insertError) {
    throw new Error(`Failed to initialize learner profile: ${insertError.message}`);
  }
}

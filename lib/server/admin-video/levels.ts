import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LevelName } from '@/types/database';

export async function resolveLevelId(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  level: LevelName;
}) {
  const { supabase, level } = params;

  const { data: levelData, error: levelError } = await supabase
    .from('levels')
    .select('id')
    .eq('name', level)
    .single();

  const levelId = levelData?.id as string | undefined;

  if (levelError && levelError.code !== 'PGRST116') {
    throw new Error(`Failed to query levels: ${levelError.message}`);
  }

  if (levelId) {
    return levelId;
  }

  const { data: createdLevel, error: createLevelError } = await supabase
    .from('levels')
    .insert({ name: level })
    .select('id')
    .single();

  if (createLevelError?.code === '23505') {
    const { data: existingLevel, error: existingLevelError } = await supabase
      .from('levels')
      .select('id')
      .eq('name', level)
      .single();

    if (existingLevelError || !existingLevel?.id) {
      throw new Error(
        `Failed to resolve existing level after conflict: ${
          existingLevelError?.message ?? 'Unknown error.'
        }`
      );
    }

    return existingLevel.id;
  }

  if (createLevelError || !createdLevel) {
    throw new Error(`Failed to create level: ${createLevelError?.message ?? 'Unknown error.'}`);
  }

  return createdLevel.id;
}

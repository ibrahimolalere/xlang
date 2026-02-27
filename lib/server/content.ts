import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LevelName, TranscriptSentence, Video } from '@/types/database';

export async function getLevelByName(level: LevelName) {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('levels')
    .select('id,name')
    .eq('name', level)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load level ${level}: ${error.message}`);
  }

  return data;
}

export async function getVideosByLevelId(levelId: string): Promise<Video[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('videos')
    .select('id,title,description,level_id,video_url,thumbnail_url,duration')
    .eq('level_id', levelId)
    .order('title', { ascending: true });

  if (error) {
    throw new Error(`Failed to load level videos: ${error.message}`);
  }

  return (data ?? []) as Video[];
}

export async function getVideoById(videoId: string): Promise<Video | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('videos')
    .select('id,title,description,level_id,video_url,thumbnail_url,duration')
    .eq('id', videoId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load video: ${error.message}`);
  }

  return (data as Video | null) ?? null;
}

export async function getTranscriptByVideoId(
  videoId: string
): Promise<TranscriptSentence[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('transcripts')
    .select('id,video_id,start_time,end_time,text')
    .eq('video_id', videoId)
    .order('start_time', { ascending: true });

  if (error) {
    console.error(`Failed to load transcript for video ${videoId}: ${error.message}`);
    return [];
  }

  return (data ?? []) as TranscriptSentence[];
}

export async function getLevelNameById(levelId: string): Promise<string | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('levels')
    .select('name')
    .eq('id', levelId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load level name ${levelId}: ${error.message}`);
    return null;
  }

  return data?.name ?? null;
}

import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { LEVELS } from '@/lib/constants';
import {
  autoTranscribeVideo,
  autoTranscribeYouTubeVideo,
  FALLBACK_THUMBNAIL,
  getYouTubeThumbnailUrl,
  normalizeYouTubeUrl,
  parseTranscriptLines,
  resolveLevelId,
  uploadFileToBucket,
  type VideoSourceType
} from '@/lib/server/admin-video';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LevelName } from '@/types/database';

export const runtime = 'nodejs';

interface ParsedVideoForm {
  adminPasscode: string;
  title: string;
  description: string;
  duration: string;
  transcriptLines: string;
  sourceType: VideoSourceType;
  youtubeUrlInput: string;
  level: LevelName;
  videoFile: FormDataEntryValue | null;
  thumbnailFile: FormDataEntryValue | null;
}

function parseVideoFormData(formData: FormData): ParsedVideoForm {
  const sourceTypeRaw = String(formData.get('sourceType') ?? 'local')
    .trim()
    .toLowerCase();

  return {
    adminPasscode: String(formData.get('adminPasscode') ?? '').trim(),
    title: String(formData.get('title') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    duration: String(formData.get('duration') ?? '').trim(),
    transcriptLines: String(formData.get('transcriptLines') ?? '').trim(),
    sourceType: sourceTypeRaw === 'youtube' ? 'youtube' : 'local',
    youtubeUrlInput: String(formData.get('youtubeUrl') ?? '').trim(),
    level: String(formData.get('level') ?? '')
      .trim()
      .toUpperCase() as LevelName,
    videoFile: formData.get('videoFile'),
    thumbnailFile: formData.get('thumbnailFile')
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const input = parseVideoFormData(formData);

    const expectedPasscode = process.env.ADMIN_UPLOAD_PASSCODE;
    if (!expectedPasscode) {
      return NextResponse.json(
        { error: 'Admin passcode is not configured on the server.' },
        { status: 500 }
      );
    }

    if (!input.adminPasscode || input.adminPasscode !== expectedPasscode) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    if (!LEVELS.includes(input.level)) {
      return NextResponse.json({ error: 'Invalid level.' }, { status: 400 });
    }

    if (!input.title || !input.description || !input.duration) {
      return NextResponse.json(
        { error: 'Title, description, and duration are required.' },
        { status: 400 }
      );
    }

    const isYouTubeSource = input.sourceType === 'youtube';
    const normalizedYouTubeUrl = isYouTubeSource
      ? normalizeYouTubeUrl(input.youtubeUrlInput)
      : null;

    if (isYouTubeSource) {
      if (!normalizedYouTubeUrl) {
        return NextResponse.json(
          { error: 'Provide a valid YouTube link.' },
          { status: 400 }
        );
      }
    } else {
      if (!(input.videoFile instanceof File)) {
        return NextResponse.json({ error: 'Video file is required.' }, { status: 400 });
      }

      if (!input.videoFile.type.startsWith('video/')) {
        return NextResponse.json(
          { error: 'Uploaded video must be a valid video file.' },
          { status: 400 }
        );
      }
    }

    let transcripts = parseTranscriptLines(input.transcriptLines);
    if (transcripts.length === 0) {
      if (isYouTubeSource && normalizedYouTubeUrl) {
        try {
          transcripts = await autoTranscribeYouTubeVideo(normalizedYouTubeUrl);
        } catch (error) {
          console.error('YouTube caption import failed:', error);
        }
      } else if (input.videoFile instanceof File) {
        try {
          transcripts = await autoTranscribeVideo(input.videoFile);
        } catch (error) {
          console.error('Auto transcription failed:', error);
        }
      }
    }

    const supabase = createSupabaseAdminClient();
    const levelId = await resolveLevelId({ supabase, level: input.level });

    const videosBucket = process.env.SUPABASE_VIDEOS_BUCKET || 'videos';
    const thumbnailsBucket = process.env.SUPABASE_THUMBNAILS_BUCKET || videosBucket;

    const videoUrl = isYouTubeSource
      ? (normalizedYouTubeUrl as string)
      : await uploadFileToBucket({
          supabase,
          bucket: videosBucket,
          folder: `${input.level.toLowerCase()}/videos`,
          file: input.videoFile as File
        });

    let thumbnailUrl =
      (isYouTubeSource ? getYouTubeThumbnailUrl(videoUrl) : null) ?? FALLBACK_THUMBNAIL;

    if (input.thumbnailFile instanceof File && input.thumbnailFile.size > 0) {
      if (!input.thumbnailFile.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Thumbnail file must be an image.' },
          { status: 400 }
        );
      }

      thumbnailUrl = await uploadFileToBucket({
        supabase,
        bucket: thumbnailsBucket,
        folder: `${input.level.toLowerCase()}/thumbnails`,
        file: input.thumbnailFile
      });
    }

    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .insert({
        title: input.title,
        description: input.description,
        level_id: levelId,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration: input.duration
      })
      .select('id')
      .single();

    if (videoError || !videoData) {
      return NextResponse.json(
        { error: `Failed to create video record: ${videoError?.message ?? 'Unknown error.'}` },
        { status: 500 }
      );
    }

    if (transcripts.length > 0) {
      const transcriptRows = transcripts.map((line) => ({
        video_id: videoData.id,
        start_time: line.start_time,
        end_time: line.end_time,
        text: line.text
      }));

      const { error: transcriptError } = await supabase
        .from('transcripts')
        .insert(transcriptRows);

      if (transcriptError) {
        return NextResponse.json(
          {
            error: `Video uploaded but transcript insert failed: ${transcriptError.message}`
          },
          { status: 500 }
        );
      }
    }

    revalidatePath('/');
    revalidatePath(`/level/${input.level}`);
    revalidatePath(`/video/${videoData.id}`);

    return NextResponse.json({
      ok: true,
      id: videoData.id,
      transcriptCount: transcripts.length,
      sourceType: input.sourceType
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

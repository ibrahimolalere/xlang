import { randomUUID } from 'crypto';

import OpenAI from 'openai';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { LEVELS } from '@/lib/constants';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LevelName } from '@/types/database';

export const runtime = 'nodejs';

interface TranscriptInput {
  start_time: number;
  end_time: number;
  text: string;
}

const FALLBACK_THUMBNAIL =
  'https://images.unsplash.com/photo-1516542076529-1ea3854896f2?auto=format&fit=crop&w=1200&q=80';

function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseTranscriptLines(raw: string): TranscriptInput[] {
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [startRaw, endRaw, ...textParts] = line.split('|');
      const start = Number(startRaw);
      const end = Number(endRaw);
      const text = textParts.join('|').trim();

      if (!Number.isFinite(start) || !Number.isFinite(end) || !text) {
        throw new Error(
          `Invalid transcript format on line ${index + 1}. Use: start|end|text`
        );
      }

      if (end <= start) {
        throw new Error(`Transcript line ${index + 1} has invalid time range.`);
      }

      return {
        start_time: start,
        end_time: end,
        text
      };
    });
}

async function uploadFileToBucket(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  bucket: string;
  folder: string;
  file: File;
}) {
  const { supabase, bucket, folder, file } = params;

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeName = sanitizeFileName(file.name || `upload-${Date.now()}.${ext}`);
  const path = `${folder}/${randomUUID()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(arrayBuffer), {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Storage upload failed (${bucket}): ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  if (!data.publicUrl) {
    throw new Error(`Failed to build public URL for ${bucket}/${path}`);
  }

  return data.publicUrl;
}

async function autoTranscribeVideo(file: File): Promise<TranscriptInput[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return [];
  }

  // Whisper file uploads are capped; skip oversized files.
  if (file.size > 24 * 1024 * 1024) {
    return [];
  }

  const client = new OpenAI({ apiKey });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json'
  });

  const segments = (transcription as { segments?: Array<{ start?: number; end?: number; text?: string }> }).segments;
  if (!segments || segments.length === 0) {
    return [];
  }

  return segments
    .map((segment) => ({
      start_time: Number(segment.start ?? 0),
      end_time: Number(segment.end ?? 0),
      text: String(segment.text ?? '').trim()
    }))
    .filter(
      (line) =>
        Number.isFinite(line.start_time) &&
        Number.isFinite(line.end_time) &&
        line.end_time > line.start_time &&
        line.text.length > 0
    );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const adminPasscode = String(formData.get('adminPasscode') ?? '').trim();
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const duration = String(formData.get('duration') ?? '').trim();
    const transcriptLines = String(formData.get('transcriptLines') ?? '').trim();
    const level = String(formData.get('level') ?? '')
      .trim()
      .toUpperCase() as LevelName;

    const videoFile = formData.get('videoFile');
    const thumbnailFile = formData.get('thumbnailFile');

    const expectedPasscode = process.env.ADMIN_UPLOAD_PASSCODE;
    if (!expectedPasscode) {
      return NextResponse.json(
        { error: 'Admin passcode is not configured on the server.' },
        { status: 500 }
      );
    }

    if (!adminPasscode || adminPasscode !== expectedPasscode) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    if (!LEVELS.includes(level)) {
      return NextResponse.json({ error: 'Invalid level.' }, { status: 400 });
    }

    if (!title || !description || !duration) {
      return NextResponse.json(
        { error: 'Title, description, and duration are required.' },
        { status: 400 }
      );
    }

    if (!(videoFile instanceof File)) {
      return NextResponse.json({ error: 'Video file is required.' }, { status: 400 });
    }

    if (!videoFile.type.startsWith('video/')) {
      return NextResponse.json(
        { error: 'Uploaded video must be a valid video file.' },
        { status: 400 }
      );
    }

    let transcripts = parseTranscriptLines(transcriptLines);
    if (transcripts.length === 0) {
      try {
        transcripts = await autoTranscribeVideo(videoFile);
      } catch (error) {
        // Continue without transcript if transcription fails.
        console.error('Auto transcription failed:', error);
      }
    }

    const supabase = createSupabaseAdminClient();

    const { data: levelData, error: levelError } = await supabase
      .from('levels')
      .select('id')
      .eq('name', level)
      .single();

    let levelId = levelData?.id as string | undefined;

    if (levelError && levelError.code !== 'PGRST116') {
      return NextResponse.json(
        { error: `Failed to query levels: ${levelError.message}` },
        { status: 500 }
      );
    }

    if (!levelId) {
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
          return NextResponse.json(
            {
              error: `Failed to resolve existing level after conflict: ${
                existingLevelError?.message ?? 'Unknown error.'
              }`
            },
            { status: 500 }
          );
        }

        levelId = existingLevel.id;
      } else if (createLevelError || !createdLevel) {
        return NextResponse.json(
          {
            error: `Failed to create level: ${createLevelError?.message ?? 'Unknown error.'}`
          },
          { status: 500 }
        );
      } else {
        levelId = createdLevel.id;
      }
    }

    const videosBucket = process.env.SUPABASE_VIDEOS_BUCKET || 'videos';
    const thumbnailsBucket = process.env.SUPABASE_THUMBNAILS_BUCKET || videosBucket;

    const videoUrl = await uploadFileToBucket({
      supabase,
      bucket: videosBucket,
      folder: `${level.toLowerCase()}/videos`,
      file: videoFile
    });

    let thumbnailUrl = FALLBACK_THUMBNAIL;

    if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
      if (!thumbnailFile.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Thumbnail file must be an image.' },
          { status: 400 }
        );
      }

      thumbnailUrl = await uploadFileToBucket({
        supabase,
        bucket: thumbnailsBucket,
        folder: `${level.toLowerCase()}/thumbnails`,
        file: thumbnailFile
      });
    }

    const { data: videoData, error: videoError } = await supabase
      .from('videos')
      .insert({
        title,
        description,
        level_id: levelId,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration
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

    // Ensure newly uploaded videos appear immediately in level and home listings.
    revalidatePath('/');
    revalidatePath(`/level/${level}`);
    revalidatePath(`/video/${videoData.id}`);

    return NextResponse.json({
      ok: true,
      id: videoData.id,
      transcriptCount: transcripts.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

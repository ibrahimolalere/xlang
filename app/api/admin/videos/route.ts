import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { LEVELS } from '@/lib/constants';
import {
  autoTranscribeVideo,
  autoTranscribeVideoFromBlob,
  autoTranscribeVideoFromUrl,
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
  uploadedVideoUrlInput: string;
  uploadedThumbnailUrlInput: string;
  level: LevelName;
  videoFile: FormDataEntryValue | null;
  thumbnailFile: FormDataEntryValue | null;
}

interface DeleteVideoPayload {
  id: string;
  adminPasscode: string;
}

interface GenerateTranscriptPayload {
  id: string;
  adminPasscode: string;
}

function getExpectedPasscode() {
  const expectedPasscode = process.env.ADMIN_UPLOAD_PASSCODE;
  if (!expectedPasscode) {
    throw new Error('Admin passcode is not configured on the server.');
  }
  return expectedPasscode;
}

function hasValidPasscode(passcode: string) {
  const expectedPasscode = getExpectedPasscode();
  return !!passcode && passcode === expectedPasscode;
}

function getLevelName(levels: unknown): LevelName | null {
  if (!levels) {
    return null;
  }

  if (Array.isArray(levels)) {
    const first = levels[0] as { name?: string } | undefined;
    if (!first?.name) {
      return null;
    }
    return first.name as LevelName;
  }

  const single = levels as { name?: string };
  if (!single.name) {
    return null;
  }
  return single.name as LevelName;
}

function isYouTubeVideoUrl(url: string) {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function extractStorageObjectPath(params: { fileUrl: string; bucket: string }) {
  const { fileUrl, bucket } = params;

  try {
    const url = new URL(fileUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const pathIndex = url.pathname.indexOf(marker);
    if (pathIndex < 0) {
      return null;
    }

    const encodedPath = url.pathname.slice(pathIndex + marker.length);
    if (!encodedPath) {
      return null;
    }

    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

async function removeStorageObjectIfOwned(params: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  bucket: string;
  fileUrl: string;
}) {
  const path = extractStorageObjectPath({
    fileUrl: params.fileUrl,
    bucket: params.bucket
  });

  if (!path) {
    return;
  }

  const { error } = await params.supabase.storage.from(params.bucket).remove([path]);
  if (error) {
    console.error(
      `Storage cleanup failed for ${params.bucket}/${path}: ${error.message}`
    );
  }
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
    uploadedVideoUrlInput: String(formData.get('uploadedVideoUrl') ?? '').trim(),
    uploadedThumbnailUrlInput: String(formData.get('uploadedThumbnailUrl') ?? '').trim(),
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

    if (!hasValidPasscode(input.adminPasscode)) {
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
    const localVideoFile = input.videoFile instanceof File ? input.videoFile : null;
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
      const hasUploadedVideoUrl = input.uploadedVideoUrlInput.length > 0;
      const hasVideoFile = localVideoFile instanceof File;

      if (!hasUploadedVideoUrl && !hasVideoFile) {
        return NextResponse.json(
          { error: 'Video file upload is required.' },
          { status: 400 }
        );
      }

      if (localVideoFile && !localVideoFile.type.startsWith('video/')) {
        return NextResponse.json(
          { error: 'Uploaded video must be a valid video file.' },
          { status: 400 }
        );
      }
    }

    let transcripts = parseTranscriptLines(input.transcriptLines);
    const hasManualTranscript = transcripts.length > 0;
    if (transcripts.length === 0) {
      if (isYouTubeSource && normalizedYouTubeUrl) {
        try {
          transcripts = await autoTranscribeYouTubeVideo(normalizedYouTubeUrl);
        } catch (error) {
          console.error('YouTube caption import failed:', error);
        }
      } else if (localVideoFile) {
        try {
          transcripts = await autoTranscribeVideo(localVideoFile);
        } catch (error) {
          console.error('Auto transcription failed:', error);
        }
      }
    }

    const supabase = createSupabaseAdminClient();
    const levelId = await resolveLevelId({ supabase, level: input.level });

    const videosBucket = process.env.SUPABASE_VIDEOS_BUCKET || 'videos';
    const thumbnailsBucket = process.env.SUPABASE_THUMBNAILS_BUCKET || videosBucket;

    const uploadedLocalVideoUrl =
      input.uploadedVideoUrlInput ||
      (localVideoFile
        ? await uploadFileToBucket({
            supabase,
            bucket: videosBucket,
            folder: `${input.level.toLowerCase()}/videos`,
            file: localVideoFile
          })
        : '');

    if (!isYouTubeSource && !uploadedLocalVideoUrl) {
      return NextResponse.json(
        { error: 'Video upload URL could not be resolved.' },
        { status: 400 }
      );
    }

    const videoUrl = isYouTubeSource
      ? (normalizedYouTubeUrl as string)
      : uploadedLocalVideoUrl;
    const initialThumbnailUrl =
      input.uploadedThumbnailUrlInput ||
      ((isYouTubeSource ? getYouTubeThumbnailUrl(videoUrl) : null) ?? FALLBACK_THUMBNAIL);

    if (!isYouTubeSource && transcripts.length === 0 && videoUrl) {
      const storageVideoPath = extractStorageObjectPath({
        fileUrl: videoUrl,
        bucket: videosBucket
      });

      if (storageVideoPath) {
        try {
          const { data: blob, error: downloadError } = await supabase.storage
            .from(videosBucket)
            .download(storageVideoPath);

          if (downloadError) {
            console.error('Storage download for transcription failed:', downloadError);
          } else if (blob) {
            const fileName =
              storageVideoPath.split('/').filter(Boolean).pop() ?? 'video-upload.mp4';
            transcripts = await autoTranscribeVideoFromBlob(blob, fileName);
          }
        } catch (error) {
          console.error('Storage-based transcription failed:', error);
        }
      }

      if (transcripts.length === 0) {
        try {
          transcripts = await autoTranscribeVideoFromUrl(videoUrl);
        } catch (error) {
          console.error('Remote auto transcription failed:', error);
        }
      }
    }

    if (!hasManualTranscript && transcripts.length === 0) {
      if (!isYouTubeSource && videoUrl) {
        await removeStorageObjectIfOwned({
          supabase,
          bucket: videosBucket,
          fileUrl: videoUrl
        });
      }

      if (initialThumbnailUrl) {
        await removeStorageObjectIfOwned({
          supabase,
          bucket: thumbnailsBucket,
          fileUrl: initialThumbnailUrl
        });
      }

      return NextResponse.json(
        {
          error:
            process.env.OPENAI_API_KEY
              ? 'Transcript extraction from audio failed. Upload canceled. Add manual transcript lines if this file has unclear/no speech.'
              : 'Transcript extraction from audio failed. Upload canceled because OPENAI_API_KEY is not configured.'
        },
        { status: 422 }
      );
    }

    let thumbnailUrl = initialThumbnailUrl;

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

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<GenerateTranscriptPayload>;
    const id = String(body.id ?? '').trim();
    const adminPasscode = String(body.adminPasscode ?? '').trim();

    if (!id) {
      return NextResponse.json({ error: 'Video id is required.' }, { status: 400 });
    }

    if (!hasValidPasscode(adminPasscode)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: existingVideo, error: existingVideoError } = await supabase
      .from('videos')
      .select('id, video_url, levels(name)')
      .eq('id', id)
      .maybeSingle();

    if (existingVideoError) {
      return NextResponse.json(
        { error: `Failed to query video: ${existingVideoError.message}` },
        { status: 500 }
      );
    }

    if (!existingVideo) {
      return NextResponse.json({ error: 'Video not found.' }, { status: 404 });
    }

    const { count: existingTranscriptCount, error: transcriptCountError } = await supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('video_id', id);

    if (transcriptCountError) {
      return NextResponse.json(
        { error: `Failed to check transcript status: ${transcriptCountError.message}` },
        { status: 500 }
      );
    }

    if ((existingTranscriptCount ?? 0) > 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        transcriptCount: existingTranscriptCount ?? 0
      });
    }

    const generatedTranscripts = isYouTubeVideoUrl(existingVideo.video_url)
      ? await autoTranscribeYouTubeVideo(existingVideo.video_url)
      : await autoTranscribeVideoFromUrl(existingVideo.video_url);

    if (!generatedTranscripts.length) {
      return NextResponse.json(
        {
          error:
            'No transcript could be generated automatically for this video. Add transcript lines manually.',
          transcriptCount: 0
        },
        { status: 422 }
      );
    }

    const transcriptRows = generatedTranscripts.map((line) => ({
      video_id: id,
      start_time: line.start_time,
      end_time: line.end_time,
      text: line.text
    }));

    const { error: transcriptInsertError } = await supabase
      .from('transcripts')
      .insert(transcriptRows);

    if (transcriptInsertError) {
      return NextResponse.json(
        { error: `Failed to insert generated transcript: ${transcriptInsertError.message}` },
        { status: 500 }
      );
    }

    const levelName = getLevelName(existingVideo.levels);
    revalidatePath('/admin');
    revalidatePath(`/video/${id}`);
    if (levelName) {
      revalidatePath(`/level/${levelName}`);
    }

    return NextResponse.json({
      ok: true,
      transcriptCount: generatedTranscripts.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('videos')
      .select(
        'id, title, description, duration, video_url, thumbnail_url, created_at, level_id, levels(name)'
      )
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: `Failed to load videos: ${error.message}` },
        { status: 500 }
      );
    }

    const videos = (data ?? []).map((row) => {
      const level = getLevelName(row.levels);
      const sourceType = row.video_url.includes('youtube.com') || row.video_url.includes('youtu.be')
        ? 'youtube'
        : 'local';

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        duration: row.duration,
        video_url: row.video_url,
        thumbnail_url: row.thumbnail_url,
        created_at: row.created_at,
        level: level ?? 'A1',
        sourceType
      };
    });

    return NextResponse.json({ videos });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as Partial<DeleteVideoPayload>;
    const id = String(body.id ?? '').trim();
    const adminPasscode = String(body.adminPasscode ?? '').trim();

    if (!id) {
      return NextResponse.json({ error: 'Video id is required.' }, { status: 400 });
    }

    if (!hasValidPasscode(adminPasscode)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: existingVideo, error: existingVideoError } = await supabase
      .from('videos')
      .select('id, video_url, thumbnail_url, levels(name)')
      .eq('id', id)
      .maybeSingle();

    if (existingVideoError) {
      return NextResponse.json(
        { error: `Failed to query video: ${existingVideoError.message}` },
        { status: 500 }
      );
    }

    if (!existingVideo) {
      return NextResponse.json({ error: 'Video not found.' }, { status: 404 });
    }

    const { error: deleteError } = await supabase.from('videos').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete video: ${deleteError.message}` },
        { status: 500 }
      );
    }

    const videosBucket = process.env.SUPABASE_VIDEOS_BUCKET || 'videos';
    const thumbnailsBucket = process.env.SUPABASE_THUMBNAILS_BUCKET || videosBucket;

    await removeStorageObjectIfOwned({
      supabase,
      bucket: videosBucket,
      fileUrl: existingVideo.video_url
    });

    await removeStorageObjectIfOwned({
      supabase,
      bucket: thumbnailsBucket,
      fileUrl: existingVideo.thumbnail_url
    });

    const levelName = getLevelName(existingVideo.levels);
    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath(`/video/${id}`);
    if (levelName) {
      revalidatePath(`/level/${levelName}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

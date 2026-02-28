import { NextResponse } from 'next/server';

import { LEVELS } from '@/lib/constants';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { LevelName } from '@/types/database';

export const runtime = 'nodejs';

const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 * 1024;

interface SignedUploadRequest {
  adminPasscode?: string;
  level?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  kind?: 'video' | 'thumbnail';
}

function getExpectedPasscode() {
  const expectedPasscode = process.env.ADMIN_UPLOAD_PASSCODE;
  if (!expectedPasscode) {
    throw new Error('Admin passcode is not configured on the server.');
  }
  return expectedPasscode;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignedUploadRequest;
    const adminPasscode = String(body.adminPasscode ?? '').trim();
    const level = String(body.level ?? '')
      .trim()
      .toUpperCase() as LevelName;
    const fileName = String(body.fileName ?? '').trim();
    const fileType = String(body.fileType ?? '').trim();
    const fileSize = Number(body.fileSize ?? 0);
    const kind = body.kind === 'thumbnail' ? 'thumbnail' : 'video';

    if (!adminPasscode || adminPasscode !== getExpectedPasscode()) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    if (!LEVELS.includes(level)) {
      return NextResponse.json({ error: 'Invalid level.' }, { status: 400 });
    }

    if (!fileName || !fileType) {
      return NextResponse.json(
        { error: 'fileName and fileType are required.' },
        { status: 400 }
      );
    }

    if (kind === 'video') {
      if (!fileType.startsWith('video/')) {
        return NextResponse.json(
          { error: 'Video upload requires a valid video MIME type.' },
          { status: 400 }
        );
      }

      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return NextResponse.json({ error: 'Invalid video file size.' }, { status: 400 });
      }

      if (fileSize > MAX_VIDEO_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: 'Video is too large. Maximum allowed size is 20 MB.' },
          { status: 400 }
        );
      }
    } else if (!fileType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Thumbnail upload requires a valid image MIME type.' },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(fileName || `${kind}-${Date.now()}`);
    const folder = kind === 'video' ? 'videos' : 'thumbnails';
    const path = `${level.toLowerCase()}/${folder}/${Date.now()}-${safeName}`;
    const bucket =
      kind === 'video'
        ? process.env.SUPABASE_VIDEOS_BUCKET || 'videos'
        : process.env.SUPABASE_THUMBNAILS_BUCKET ||
          process.env.SUPABASE_VIDEOS_BUCKET ||
          'videos';

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json(
        { error: `Failed to create signed upload URL: ${error?.message ?? 'Unknown error.'}` },
        { status: 500 }
      );
    }

    const publicUrlData = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = publicUrlData.data.publicUrl;
    if (!publicUrl) {
      return NextResponse.json(
        { error: 'Failed to generate public URL for uploaded file.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      bucket,
      path: data.path,
      token: data.token,
      publicUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

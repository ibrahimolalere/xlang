import { randomUUID } from 'crypto';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const FALLBACK_THUMBNAIL =
  'https://images.unsplash.com/photo-1516542076529-1ea3854896f2?auto=format&fit=crop&w=1200&q=80';

function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function uploadFileToBucket(params: {
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

'use client';

import {
  AlignLeft,
  Captions,
  Clock3,
  ImageIcon,
  KeyRound,
  Link2,
  Type,
  UploadCloud,
  Upload,
  Video
} from 'lucide-react';
import { FormEvent, useRef, useState } from 'react';

import { LEVELS } from '@/lib/constants';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { LevelName } from '@/types/database';

const INITIAL_FORM = {
  level: 'A1' as LevelName,
  sourceType: 'local' as 'local' | 'youtube',
  youtubeUrl: '',
  title: '',
  description: '',
  duration: '',
  transcriptLines: '',
  adminPasscode: ''
};
const ADMIN_VIDEOS_UPDATED_EVENT = 'xlang:admin-videos-updated';
const MAX_VIDEO_FILE_BYTES = 20 * 1024 * 1024;

export function AdminUploadForm() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const parseApiResponse = async <T,>(
    response: Response
  ): Promise<{ data: T | null; errorText: string | null }> => {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      try {
        const data = (await response.json()) as T;
        return { data, errorText: null };
      } catch {
        return { data: null, errorText: 'Server returned invalid JSON.' };
      }
    }

    const rawText = await response.text().catch(() => '');
    return {
      data: null,
      errorText: rawText.trim() || `HTTP ${response.status} ${response.statusText}`
    };
  };

  const uploadFileWithSignedUrl = async (params: {
    file: File;
    kind: 'video' | 'thumbnail';
  }) => {
    const signedResponse = await fetch('/api/admin/videos/signed-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPasscode: form.adminPasscode,
        level: form.level,
        fileName: params.file.name,
        fileType: params.file.type,
        fileSize: params.file.size,
        kind: params.kind
      })
    });

    const signedParsed = await parseApiResponse<{
      ok?: boolean;
      bucket?: string;
      path?: string;
      token?: string;
      publicUrl?: string;
      error?: string;
    }>(signedResponse);

    if (!signedResponse.ok || !signedParsed.data?.bucket || !signedParsed.data.path || !signedParsed.data.token || !signedParsed.data.publicUrl) {
      throw new Error(
        signedParsed.data?.error ??
          signedParsed.errorText ??
          'Failed to initialize direct upload.'
      );
    }

    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from(signedParsed.data.bucket)
      .uploadToSignedUrl(signedParsed.data.path, signedParsed.data.token, params.file, {
        contentType: params.file.type || 'application/octet-stream',
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(`File upload failed: ${uploadError.message}`);
    }

    return signedParsed.data.publicUrl;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsLoading(true);
    setMessage(null);
    setError(null);

    if (form.sourceType === 'local' && !videoFile) {
      setError('Please select a video file.');
      setIsLoading(false);
      return;
    }

    if (form.sourceType === 'local' && videoFile && videoFile.size > MAX_VIDEO_FILE_BYTES) {
      setError('Video is too large. Maximum allowed size is 20 MB.');
      setIsLoading(false);
      return;
    }

    if (form.sourceType === 'youtube' && !form.youtubeUrl.trim()) {
      setError('Please provide a YouTube link.');
      setIsLoading(false);
      return;
    }

    try {
      let uploadedVideoUrl = '';
      let uploadedThumbnailUrl = '';

      if (form.sourceType === 'local' && videoFile) {
        uploadedVideoUrl = await uploadFileWithSignedUrl({
          file: videoFile,
          kind: 'video'
        });
      }

      if (thumbnailFile) {
        uploadedThumbnailUrl = await uploadFileWithSignedUrl({
          file: thumbnailFile,
          kind: 'thumbnail'
        });
      }

      const payload = new FormData();
      payload.set('level', form.level);
      payload.set('sourceType', form.sourceType);
      payload.set('youtubeUrl', form.youtubeUrl);
      payload.set('uploadedVideoUrl', uploadedVideoUrl);
      payload.set('uploadedThumbnailUrl', uploadedThumbnailUrl);
      payload.set('title', form.title);
      payload.set('description', form.description);
      payload.set('duration', form.duration);
      payload.set('transcriptLines', form.transcriptLines);
      payload.set('adminPasscode', form.adminPasscode);

      const response = await fetch('/api/admin/videos', {
        method: 'POST',
        body: payload
      });

      const parsed = await parseApiResponse<{
        ok?: boolean;
        id?: string;
        transcriptCount?: number;
        error?: string;
      }>(response);

      if (!response.ok) {
        if (parsed.data?.error) {
          setError(parsed.data.error);
        } else {
          setError(parsed.errorText ?? 'Upload failed.');
        }
        setIsLoading(false);
        return;
      }

      if (!parsed.data) {
        setError(parsed.errorText ?? 'Upload failed: response body missing.');
        setIsLoading(false);
        return;
      }

      setMessage(
        `Video uploaded successfully. ID: ${parsed.data.id}. Transcript lines: ${parsed.data.transcriptCount ?? 0}`
      );
      setForm((previous) => ({
        ...INITIAL_FORM,
        adminPasscode: previous.adminPasscode,
        level: previous.level,
        sourceType: previous.sourceType
      }));
      setVideoFile(null);
      setThumbnailFile(null);

      if (videoInputRef.current) {
        videoInputRef.current.value = '';
      }

      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = '';
      }

      window.dispatchEvent(new Event(ADMIN_VIDEOS_UPDATED_EVENT));
    } catch (submitError) {
      const text =
        submitError instanceof Error ? submitError.message : 'Unexpected upload error.';
      setError(text);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-border/80 bg-panel p-4 sm:p-6 md:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
            Level
          </span>
          <select
            className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-base text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:text-sm"
            value={form.level}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, level: event.target.value as LevelName }))
            }
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
            <Clock3 className="h-4 w-4 text-accent" />
            Duration (mm:ss)
          </span>
          <input
            className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-base text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:text-sm"
            value={form.duration}
            onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))}
            placeholder="08:40"
            required
          />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
          Video source
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                sourceType: 'local',
                youtubeUrl: ''
              }))
            }
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
              form.sourceType === 'local'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border/80 bg-surface text-muted hover:border-accent/60 hover:text-ink'
            }`}
            aria-pressed={form.sourceType === 'local'}
          >
            <Upload className="h-4 w-4" />
            Local file
          </button>
          <button
            type="button"
            onClick={() =>
              setForm((prev) => ({
                ...prev,
                sourceType: 'youtube'
              }))
            }
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${
              form.sourceType === 'youtube'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border/80 bg-surface text-muted hover:border-accent/60 hover:text-ink'
            }`}
            aria-pressed={form.sourceType === 'youtube'}
          >
            <Link2 className="h-4 w-4" />
            YouTube link
          </button>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
          <Type className="h-4 w-4 text-accent" />
          Title
        </span>
        <input
          className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-base text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:text-sm"
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="Talking About Travel Plans"
          required
        />
      </label>

      <label className="block space-y-1">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
          <AlignLeft className="h-4 w-4 text-accent" />
          Description
        </span>
        <textarea
          className="min-h-24 w-full rounded-xl border border-border/80 bg-surface px-3 py-3 text-base text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:text-sm"
          value={form.description}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder="Short summary for learners"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {form.sourceType === 'local' ? (
          <label className="space-y-1">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
              <Video className="h-4 w-4 text-accent" />
              Video file
            </span>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="w-full rounded-xl border border-border/80 bg-surface px-3 py-2.5 text-sm text-ink file:mr-2 file:rounded-lg file:border file:border-border file:bg-panel file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-muted sm:file:mr-3 sm:file:text-sm"
              onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
              required={form.sourceType === 'local'}
            />
            <p className="text-xs text-muted">
              Upload `.mp4`/`.webm`/other browser-supported formats. Max 20 MB.
            </p>
          </label>
        ) : (
          <label className="space-y-1">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
              <Link2 className="h-4 w-4 text-accent" />
              YouTube URL
            </span>
            <input
              type="url"
              className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-sm text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20"
              value={form.youtubeUrl}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, youtubeUrl: event.target.value }))
              }
              placeholder="https://www.youtube.com/watch?v=..."
              required={form.sourceType === 'youtube'}
            />
            <p className="text-xs text-muted">
              Paste a full YouTube link (`youtube.com` or `youtu.be`).
            </p>
          </label>
        )}

        <label className="space-y-1">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
            <ImageIcon className="h-4 w-4 text-accent" />
            Thumbnail file (optional)
          </span>
          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/*"
            className="w-full rounded-xl border border-border/80 bg-surface px-3 py-2.5 text-sm text-ink file:mr-2 file:rounded-lg file:border file:border-border file:bg-panel file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-muted sm:file:mr-3 sm:file:text-sm"
            onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
          <Captions className="h-4 w-4 text-accent" />
          Transcript lines (optional)
        </span>
        <textarea
          className="min-h-40 w-full rounded-xl border border-border/80 bg-surface px-3 py-2.5 font-mono text-xs text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:min-h-44"
          value={form.transcriptLines}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, transcriptLines: event.target.value }))
          }
          placeholder={'0|4.8|Hallo!\n4.8|9.5|Heute lernen wir...\n\nor\n\n0:00\nHallo!\n0:04\nHeute lernen wir...'}
        />
        <p className="text-xs text-muted">
          Accepted: `start|end|text` or timestamp blocks like `0:00` on one line and text below.
        </p>
      </label>

      <label className="block space-y-1">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
          <KeyRound className="h-4 w-4 text-accent" />
          Admin passcode
        </span>
        <input
          type="password"
          className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-base text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:text-sm"
          value={form.adminPasscode}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, adminPasscode: event.target.value }))
          }
          required
        />
      </label>

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-accent bg-accent px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        <UploadCloud className="h-4 w-4" />
        {isLoading
          ? form.sourceType === 'youtube'
            ? 'Saving YouTube video...'
            : 'Uploading files...'
          : form.sourceType === 'youtube'
            ? 'Save YouTube Video'
            : 'Upload Video'}
      </button>

      {message ? <p className="text-sm font-medium text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm font-medium text-red-500">{error}</p> : null}
    </form>
  );
}

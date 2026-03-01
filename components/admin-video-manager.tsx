'use client';

import { Captions, RefreshCcw, ShieldAlert, Trash2, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface AdminVideoItem {
  id: string;
  title: string;
  description: string;
  duration: string;
  video_url: string;
  thumbnail_url: string;
  created_at: string;
  level: string;
  sourceType: 'local' | 'youtube';
}

const ADMIN_VIDEOS_UPDATED_EVENT = 'xlang:admin-videos-updated';

async function parseApiResponse<T>(
  response: Response
): Promise<{ data: T | null; errorText: string | null }> {
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
}

export function AdminVideoManager() {
  const [videos, setVideos] = useState<AdminVideoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isGeneratingId, setIsGeneratingId] = useState<string | null>(null);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/videos', {
        method: 'GET',
        cache: 'no-store'
      });

      const parsed = await parseApiResponse<{
        videos?: AdminVideoItem[];
        error?: string;
      }>(response);

      if (!response.ok) {
        if (parsed.data?.error) {
          setError(parsed.data.error);
        } else {
          setError(parsed.errorText ?? 'Failed to load videos.');
        }
        setIsLoading(false);
        return;
      }

      setVideos(Array.isArray(parsed.data?.videos) ? parsed.data.videos : []);
    } catch (requestError) {
      const text =
        requestError instanceof Error ? requestError.message : 'Unexpected request error.';
      setError(text);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVideos();

    const handleRefresh = () => {
      void loadVideos();
    };

    window.addEventListener(ADMIN_VIDEOS_UPDATED_EVENT, handleRefresh as EventListener);
    return () => {
      window.removeEventListener(
        ADMIN_VIDEOS_UPDATED_EVENT,
        handleRefresh as EventListener
      );
    };
  }, [loadVideos]);

  const handleDelete = async (video: AdminVideoItem) => {
    if (!adminPasscode.trim()) {
      setError('Enter admin passcode to delete videos.');
      return;
    }

    const confirmed = window.confirm(
      `Delete "${video.title}"? This removes transcript and learner references too.`
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingId(video.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: video.id,
          adminPasscode
        })
      });

      const parsed = await parseApiResponse<{
        ok?: boolean;
        error?: string;
      }>(response);

      if (!response.ok) {
        if (parsed.data?.error) {
          setError(parsed.data.error);
        } else {
          setError(parsed.errorText ?? 'Delete failed.');
        }
        return;
      }

      setVideos((previous) => previous.filter((item) => item.id !== video.id));
      setMessage(`Deleted "${video.title}".`);
      window.dispatchEvent(new Event(ADMIN_VIDEOS_UPDATED_EVENT));
    } catch (requestError) {
      const text =
        requestError instanceof Error ? requestError.message : 'Unexpected delete error.';
      setError(text);
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleGenerateTranscript = async (video: AdminVideoItem) => {
    if (!adminPasscode.trim()) {
      setError('Enter admin passcode to generate transcript.');
      return;
    }

    setIsGeneratingId(video.id);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: video.id,
          adminPasscode
        })
      });

      const parsed = await parseApiResponse<{
        ok?: boolean;
        skipped?: boolean;
        transcriptCount?: number;
        error?: string;
      }>(response);

      if (!response.ok) {
        if (parsed.data?.error) {
          setError(parsed.data.error);
        } else {
          setError(parsed.errorText ?? 'Transcript generation failed.');
        }
        return;
      }

      const count = parsed.data?.transcriptCount ?? 0;
      if (parsed.data?.skipped) {
        setMessage(`Transcript already exists for "${video.title}" (${count} lines).`);
      } else {
        setMessage(`Generated transcript for "${video.title}" (${count} lines).`);
      }
      window.dispatchEvent(new Event(ADMIN_VIDEOS_UPDATED_EVENT));
    } catch (requestError) {
      const text =
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected transcript generation error.';
      setError(text);
    } finally {
      setIsGeneratingId(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border/80 bg-panel p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink sm:text-3xl">
            Manage Existing Videos
          </h2>
          <p className="mt-1 text-sm text-muted">
            Delete videos from the platform so they disappear for learners.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadVideos();
          }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/80 bg-surface px-4 text-sm font-semibold text-ink transition hover:border-accent/70 hover:text-accent"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <label className="block space-y-1">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted sm:text-xs">
          <ShieldAlert className="h-4 w-4 text-accent" />
          Admin passcode (required for delete)
        </span>
        <input
          type="password"
          className="h-11 w-full rounded-xl border border-border/80 bg-surface px-3 text-base text-ink outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20 sm:max-w-sm sm:text-sm"
          value={adminPasscode}
          onChange={(event) => setAdminPasscode(event.target.value)}
          placeholder="Enter passcode"
        />
      </label>

      {message ? <p className="text-sm font-medium text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm font-medium text-red-500">{error}</p> : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/80 bg-surface p-4 text-sm text-muted">
          Loading videos...
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-border/80 bg-surface p-4 text-sm text-muted">
          No videos found.
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <article
              key={video.id}
              className="rounded-xl border border-border/80 bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    <Video className="h-3.5 w-3.5 text-accent" />
                    {video.level} • {video.sourceType}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-ink">{video.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{video.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    Duration: {video.duration} • Added:{' '}
                    {new Date(video.created_at).toLocaleString()}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void handleGenerateTranscript(video);
                  }}
                  disabled={isGeneratingId === video.id}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 text-ink transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Generate transcript for ${video.title}`}
                  title={`Generate transcript for ${video.title}`}
                >
                  <Captions className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleDelete(video);
                  }}
                  disabled={isDeletingId === video.id || isGeneratingId === video.id}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-300 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Delete ${video.title}`}
                  title={`Delete ${video.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

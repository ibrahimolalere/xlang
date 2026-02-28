import type { TranscriptInput } from './types';

export function getYouTubeVideoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const watchId = parsed.searchParams.get('v');
      if (watchId) {
        return watchId;
      }

      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeYouTubeUrl(rawUrl: string): string | null {
  const id = getYouTubeVideoId(rawUrl);
  if (!id) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${id}`;
}

export function getYouTubeThumbnailUrl(rawUrl: string): string | null {
  const id = getYouTubeVideoId(rawUrl);
  if (!id) {
    return null;
  }

  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 10))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );
}

function parseYouTubeTimedText(xml: string): TranscriptInput[] {
  const entries = Array.from(xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g));
  if (entries.length === 0) {
    return [];
  }

  const lines: TranscriptInput[] = [];

  for (const entry of entries) {
    const attrs = entry[1];
    const startMatch = attrs.match(/\bstart="([^"]+)"/);
    const durMatch = attrs.match(/\bdur="([^"]+)"/);
    const start = Number(startMatch?.[1]);
    const dur = Number(durMatch?.[1] ?? 0);

    if (!Number.isFinite(start)) {
      continue;
    }

    const decoded = decodeHtmlEntities(entry[2] ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!decoded) {
      continue;
    }

    const end = start + (Number.isFinite(dur) && dur > 0 ? dur : 1.5);
    lines.push({
      start_time: start,
      end_time: end,
      text: decoded
    });
  }

  return lines;
}

export async function autoTranscribeYouTubeVideo(
  youtubeUrl: string
): Promise<TranscriptInput[]> {
  const id = getYouTubeVideoId(youtubeUrl);
  if (!id) {
    return [];
  }

  const captionRequests = [
    { lang: 'de', kind: undefined as string | undefined },
    { lang: 'de', kind: 'asr' },
    { lang: 'en', kind: undefined as string | undefined },
    { lang: 'en', kind: 'asr' }
  ];

  for (const request of captionRequests) {
    const params = new URLSearchParams({
      v: id,
      lang: request.lang
    });
    if (request.kind) {
      params.set('kind', request.kind);
    }

    const url = `https://www.youtube.com/api/timedtext?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        continue;
      }

      const xml = await response.text();
      if (!xml || !xml.includes('<text')) {
        continue;
      }

      const parsed = parseYouTubeTimedText(xml);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Ignore source failures and continue with fallback options.
    }
  }

  return [];
}

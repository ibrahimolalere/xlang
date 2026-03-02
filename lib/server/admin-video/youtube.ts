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

interface YouTubeCaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
}

function parseYouTubeJsonCaptions(payload: string): TranscriptInput[] {
  try {
    const parsed = JSON.parse(payload) as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string }>;
      }>;
    };

    const lines: TranscriptInput[] = [];
    for (const event of parsed.events ?? []) {
      const startMs = Number(event.tStartMs ?? 0);
      const durationMs = Number(event.dDurationMs ?? 0);
      if (!Number.isFinite(startMs)) {
        continue;
      }

      const text = (event.segs ?? [])
        .map((seg) => (seg.utf8 ?? '').replace(/\n/g, ' '))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();

      if (!text) {
        continue;
      }

      const start = Number((startMs / 1000).toFixed(3));
      const end = Number(
        ((startMs + (durationMs > 0 ? durationMs : 1500)) / 1000).toFixed(3)
      );

      if (end <= start) {
        continue;
      }

      lines.push({
        start_time: start,
        end_time: end,
        text
      });
    }

    return lines;
  } catch {
    return [];
  }
}

function extractCaptionTracksFromWatchHtml(html: string): YouTubeCaptionTrack[] {
  const match = html.match(
    /"captions":\s*(\{(?:"playerCaptionsTracklistRenderer"|[\s\S])*?\})\s*,\s*"videoDetails"/
  );

  if (!match?.[1]) {
    return [];
  }

  try {
    const captionsJson = JSON.parse(match[1]) as {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: YouTubeCaptionTrack[];
      };
    };

    return captionsJson.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  } catch {
    return [];
  }
}

function rankCaptionTrack(track: YouTubeCaptionTrack): number {
  const lang = String(track.languageCode ?? '').toLowerCase();
  const isAsr = String(track.kind ?? '').toLowerCase() === 'asr';

  if (lang.startsWith('de') && !isAsr) return 0;
  if (lang.startsWith('de') && isAsr) return 1;
  if (lang.startsWith('en') && !isAsr) return 2;
  if (lang.startsWith('en') && isAsr) return 3;
  if (!isAsr) return 4;
  return 5;
}

function getTrackJsonUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set('fmt', 'json3');
    return parsed.toString();
  } catch {
    if (baseUrl.includes('?')) {
      return `${baseUrl}&fmt=json3`;
    }
    return `${baseUrl}?fmt=json3`;
  }
}

async function fetchYouTubeCaptionsFromWatchPage(videoId: string) {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=de&bpctr=9999999999&has_verified=1`;
  const response = await fetch(watchUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.7'
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    return [];
  }

  const html = await response.text();
  const tracks = extractCaptionTracksFromWatchHtml(html)
    .filter((track) => typeof track.baseUrl === 'string' && track.baseUrl.length > 0)
    .sort((a, b) => rankCaptionTrack(a) - rankCaptionTrack(b));

  for (const track of tracks) {
    const trackUrl = getTrackJsonUrl(track.baseUrl as string);
    try {
      const captionsResponse = await fetch(trackUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        cache: 'no-store'
      });

      if (!captionsResponse.ok) {
        continue;
      }

      const json = await captionsResponse.text();
      const parsed = parseYouTubeJsonCaptions(json);
      if (parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Continue through remaining tracks.
    }
  }

  return [];
}

export async function autoTranscribeYouTubeVideo(
  youtubeUrl: string
): Promise<TranscriptInput[]> {
  const id = getYouTubeVideoId(youtubeUrl);
  if (!id) {
    return [];
  }

  // Primary strategy: same no-key approach used by youtube transcript libraries.
  const watchPageCaptions = await fetchYouTubeCaptionsFromWatchPage(id);
  if (watchPageCaptions.length > 0) {
    return watchPageCaptions;
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

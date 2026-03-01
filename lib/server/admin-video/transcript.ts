import OpenAI from 'openai';
import { toFile } from 'openai';

import type { TranscriptInput } from './types';

const MAX_TRANSCRIBE_FILE_BYTES = 24 * 1024 * 1024;

export function parseTranscriptLines(raw: string): TranscriptInput[] {
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

export async function autoTranscribeVideo(file: File): Promise<TranscriptInput[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return [];
  }

  // Whisper file uploads are capped; skip oversized files.
  if (file.size > MAX_TRANSCRIBE_FILE_BYTES) {
    return [];
  }

  const client = new OpenAI({ apiKey });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'verbose_json'
  });

  const segments = (
    transcription as {
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    }
  ).segments;

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

export async function autoTranscribeVideoFromUrl(
  videoUrl: string
): Promise<TranscriptInput[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return [];
  }

  try {
    let contentLength = 0;
    try {
      const headResponse = await fetch(videoUrl, {
        method: 'HEAD',
        cache: 'no-store'
      });
      const lengthHeader = headResponse.headers.get('content-length');
      contentLength = Number(lengthHeader ?? 0);
    } catch {
      contentLength = 0;
    }

    if (Number.isFinite(contentLength) && contentLength > MAX_TRANSCRIBE_FILE_BYTES) {
      return [];
    }

    const response = await fetch(videoUrl, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) {
      return [];
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_TRANSCRIBE_FILE_BYTES) {
      return [];
    }

    let fileName = 'video-upload.mp4';
    try {
      const parsed = new URL(videoUrl);
      const candidate = parsed.pathname.split('/').filter(Boolean).pop();
      if (candidate) {
        fileName = decodeURIComponent(candidate);
      }
    } catch {
      // Keep default filename.
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const uploadableFile = await toFile(bytes, fileName, { type: contentType });

    const client = new OpenAI({ apiKey });
    const transcription = await client.audio.transcriptions.create({
      file: uploadableFile,
      model: 'whisper-1',
      response_format: 'verbose_json'
    });

    const segments = (
      transcription as {
        segments?: Array<{ start?: number; end?: number; text?: string }>;
      }
    ).segments;

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
  } catch {
    return [];
  }
}

import OpenAI from 'openai';
import { toFile } from 'openai';

import type { TranscriptInput } from './types';

const MAX_OPENAI_TRANSCRIBE_FILE_BYTES = 24 * 1024 * 1024;

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

export function hasTranscriptionProviderConfigured() {
  return hasOpenAIKey();
}

export async function autoTranscribeVideo(file: File): Promise<TranscriptInput[]> {
  if (!hasOpenAIKey()) {
    return [];
  }

  return autoTranscribeWithOpenAIFile(file);
}

export async function autoTranscribeVideoFromUrl(
  videoUrl: string
): Promise<TranscriptInput[]> {
  if (!hasOpenAIKey()) {
    return [];
  }

  return autoTranscribeWithOpenAIUrl(videoUrl);
}

export async function autoTranscribeVideoFromBlob(
  blob: Blob,
  fileName = 'video-upload.mp4'
): Promise<TranscriptInput[]> {
  if (!hasOpenAIKey()) {
    return [];
  }

  return autoTranscribeWithOpenAIBlob(blob, fileName);
}

function hasOpenAIKey() {
  return !!process.env.OPENAI_API_KEY?.trim();
}

function getOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return apiKey;
}

async function autoTranscribeWithOpenAIFile(file: File) {
  if (file.size <= 0 || file.size > MAX_OPENAI_TRANSCRIBE_FILE_BYTES) {
    throw new Error(
      `OpenAI transcription failed: file exceeds ${Math.floor(
        MAX_OPENAI_TRANSCRIBE_FILE_BYTES / (1024 * 1024)
      )}MB upload limit.`
    );
  }

  const client = new OpenAI({ apiKey: getOpenAIKey() });
  const transcription = await transcribeWithFallbackModels(client, file);
  return normalizeTranscriptionResult(transcription);
}

async function autoTranscribeWithOpenAIUrl(videoUrl: string) {
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

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_OPENAI_TRANSCRIBE_FILE_BYTES
  ) {
    throw new Error(
      `OpenAI transcription failed: remote file exceeds ${Math.floor(
        MAX_OPENAI_TRANSCRIBE_FILE_BYTES / (1024 * 1024)
      )}MB upload limit.`
    );
  }

  const response = await fetch(videoUrl, {
    method: 'GET',
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI transcription failed: could not download video (${response.status}).`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_OPENAI_TRANSCRIBE_FILE_BYTES) {
    throw new Error(
      `OpenAI transcription failed: downloaded file exceeds ${Math.floor(
        MAX_OPENAI_TRANSCRIBE_FILE_BYTES / (1024 * 1024)
      )}MB upload limit.`
    );
  }

  let fileName = 'video-upload.mp4';
  try {
    const parsed = new URL(videoUrl);
    const candidate = parsed.pathname.split('/').filter(Boolean).pop();
    if (candidate) {
      fileName = decodeURIComponent(candidate);
    }
  } catch {
    // keep default filename
  }

  const contentType = response.headers.get('content-type') || 'video/mp4';
  const uploadableFile = await toFile(bytes, fileName, { type: contentType });

  const client = new OpenAI({ apiKey: getOpenAIKey() });
  const transcription = await transcribeWithFallbackModels(client, uploadableFile);
  return normalizeTranscriptionResult(transcription);
}

async function autoTranscribeWithOpenAIBlob(blob: Blob, fileName: string) {
  if (blob.size <= 0 || blob.size > MAX_OPENAI_TRANSCRIBE_FILE_BYTES) {
    throw new Error(
      `OpenAI transcription failed: file exceeds ${Math.floor(
        MAX_OPENAI_TRANSCRIBE_FILE_BYTES / (1024 * 1024)
      )}MB upload limit.`
    );
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_OPENAI_TRANSCRIBE_FILE_BYTES) {
    throw new Error(
      `OpenAI transcription failed: file exceeds ${Math.floor(
        MAX_OPENAI_TRANSCRIBE_FILE_BYTES / (1024 * 1024)
      )}MB upload limit.`
    );
  }

  const uploadableFile = await toFile(bytes, fileName, {
    type: blob.type || 'video/mp4'
  });

  const client = new OpenAI({ apiKey: getOpenAIKey() });
  const transcription = await transcribeWithFallbackModels(client, uploadableFile);
  return normalizeTranscriptionResult(transcription);
}

async function transcribeWithFallbackModels(
  client: OpenAI,
  file: File
): Promise<unknown> {
  const models = ['whisper-1', 'gpt-4o-mini-transcribe'];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const transcription = await client.audio.transcriptions.create({
        file,
        model,
        response_format: 'verbose_json'
      });
      return transcription;
    } catch (error) {
      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error('Unknown transcription provider error.');
      }
    }
  }

  if (lastError) {
    throw new Error(`OpenAI transcription failed: ${lastError.message}`);
  }

  throw new Error('OpenAI transcription failed.');
}

function normalizeTranscriptionResult(transcription: unknown): TranscriptInput[] {
  const source = transcription as {
    text?: string;
    duration?: number | string;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
  };

  const segmentLines = (source.segments ?? [])
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

  if (segmentLines.length > 0) {
    return segmentLines;
  }

  const fullText = String(source.text ?? '').trim();
  if (!fullText) {
    return [];
  }

  const sentences = fullText
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lines = sentences.length > 0 ? sentences : [fullText];
  const durationRaw = Number(source.duration ?? 0);
  const totalDuration = durationRaw > 0 ? durationRaw : Math.max(lines.length * 3, 4);
  const step = totalDuration / lines.length;

  return lines.map((line, index) => {
    const start = Number((index * step).toFixed(3));
    const end = Number(((index + 1) * step).toFixed(3));
    return {
      start_time: start,
      end_time: end > start ? end : start + 1.5,
      text: line
    };
  });
}

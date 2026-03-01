import OpenAI from 'openai';
import { toFile } from 'openai';

import type { TranscriptInput } from './types';

const MAX_OPENAI_TRANSCRIBE_FILE_BYTES = 24 * 1024 * 1024;
const ASSEMBLY_API_BASE_URL = 'https://api.assemblyai.com/v2';
const ASSEMBLY_POLL_INTERVAL_MS = 2000;
const ASSEMBLY_MAX_POLL_ATTEMPTS = 20;

interface AssemblyTranscriptResponse {
  id?: string;
  status?: 'queued' | 'processing' | 'completed' | 'error' | string;
  error?: string | null;
  text?: string;
  words?: Array<{
    text?: string;
    start?: number;
    end?: number;
  }>;
  audio_duration?: number;
}

interface AssemblySentencesResponse {
  sentences?: Array<{
    text?: string;
    start?: number;
    end?: number;
  }>;
}

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
  return hasAssemblyAIKey() || hasOpenAIKey();
}

export async function autoTranscribeVideo(file: File): Promise<TranscriptInput[]> {
  const attempts: Array<() => Promise<TranscriptInput[]>> = [];

  if (hasAssemblyAIKey()) {
    attempts.push(() => autoTranscribeWithAssemblyFromBlob(file));
  }

  if (hasOpenAIKey()) {
    attempts.push(() => autoTranscribeWithOpenAIFile(file));
  }

  return runTranscriptionAttempts(attempts);
}

export async function autoTranscribeVideoFromUrl(
  videoUrl: string
): Promise<TranscriptInput[]> {
  const attempts: Array<() => Promise<TranscriptInput[]>> = [];

  if (hasAssemblyAIKey()) {
    attempts.push(() => autoTranscribeWithAssemblyFromUrl(videoUrl));
  }

  if (hasOpenAIKey()) {
    attempts.push(() => autoTranscribeWithOpenAIUrl(videoUrl));
  }

  return runTranscriptionAttempts(attempts);
}

export async function autoTranscribeVideoFromBlob(
  blob: Blob,
  fileName = 'video-upload.mp4'
): Promise<TranscriptInput[]> {
  const attempts: Array<() => Promise<TranscriptInput[]>> = [];

  if (hasAssemblyAIKey()) {
    attempts.push(() => autoTranscribeWithAssemblyFromBlob(blob));
  }

  if (hasOpenAIKey()) {
    attempts.push(() => autoTranscribeWithOpenAIBlob(blob, fileName));
  }

  return runTranscriptionAttempts(attempts);
}

async function runTranscriptionAttempts(
  attempts: Array<() => Promise<TranscriptInput[]>>
): Promise<TranscriptInput[]> {
  if (attempts.length === 0) {
    return [];
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const lines = await attempt();
      if (lines.length > 0) {
        return lines;
      }
      errors.push('Provider returned no transcript lines.');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown provider error.');
    }
  }

  throw new Error(errors.join(' | '));
}

function hasAssemblyAIKey() {
  return !!process.env.ASSEMBLYAI_API_KEY?.trim();
}

function hasOpenAIKey() {
  return !!process.env.OPENAI_API_KEY?.trim();
}

function getAssemblyAIKey() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not configured.');
  }
  return apiKey;
}

function getOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }
  return apiKey;
}

async function autoTranscribeWithAssemblyFromUrl(videoUrl: string) {
  const transcriptId = await createAssemblyTranscript(videoUrl);
  const completed = await pollAssemblyTranscript(transcriptId);
  const sentences = await fetchAssemblySentences(transcriptId);
  return normalizeAssemblyTranscription(completed, sentences);
}

async function autoTranscribeWithAssemblyFromBlob(blob: Blob) {
  if (blob.size <= 0) {
    throw new Error('AssemblyAI transcription failed: empty media blob.');
  }

  const uploadUrl = await uploadBlobToAssembly(blob);
  const transcriptId = await createAssemblyTranscript(uploadUrl);
  const completed = await pollAssemblyTranscript(transcriptId);
  const sentences = await fetchAssemblySentences(transcriptId);
  return normalizeAssemblyTranscription(completed, sentences);
}

async function uploadBlobToAssembly(blob: Blob) {
  const apiKey = getAssemblyAIKey();
  const bytes = Buffer.from(await blob.arrayBuffer());

  const response = await fetch(`${ASSEMBLY_API_BASE_URL}/upload`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/octet-stream'
    },
    body: bytes
  });

  if (!response.ok) {
    throw new Error(await formatProviderError('AssemblyAI upload failed', response));
  }

  const payload = (await safeParseJson(response)) as { upload_url?: string } | null;
  const uploadUrl = payload?.upload_url;
  if (!uploadUrl) {
    throw new Error('AssemblyAI upload failed: missing upload URL.');
  }

  return uploadUrl;
}

async function createAssemblyTranscript(audioUrl: string) {
  const apiKey = getAssemblyAIKey();

  const response = await fetch(`${ASSEMBLY_API_BASE_URL}/transcript`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: 'de',
      punctuate: true,
      format_text: true
    })
  });

  if (!response.ok) {
    throw new Error(await formatProviderError('AssemblyAI create transcript failed', response));
  }

  const payload = (await safeParseJson(response)) as AssemblyTranscriptResponse | null;
  if (!payload?.id) {
    throw new Error('AssemblyAI create transcript failed: missing transcript id.');
  }

  return payload.id;
}

async function pollAssemblyTranscript(transcriptId: string) {
  const apiKey = getAssemblyAIKey();

  for (let attempt = 0; attempt < ASSEMBLY_MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${ASSEMBLY_API_BASE_URL}/transcript/${transcriptId}`, {
      method: 'GET',
      headers: {
        authorization: apiKey
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(await formatProviderError('AssemblyAI polling failed', response));
    }

    const payload = (await safeParseJson(response)) as AssemblyTranscriptResponse | null;
    if (!payload) {
      throw new Error('AssemblyAI polling failed: invalid response payload.');
    }

    if (payload.status === 'completed') {
      return payload;
    }

    if (payload.status === 'error') {
      throw new Error(
        `AssemblyAI transcription failed: ${payload.error || 'Unknown provider error.'}`
      );
    }

    await wait(ASSEMBLY_POLL_INTERVAL_MS);
  }

  throw new Error(
    'AssemblyAI transcription timed out while processing. Try a shorter/clearer video or add transcript lines manually.'
  );
}

async function fetchAssemblySentences(transcriptId: string) {
  const apiKey = getAssemblyAIKey();

  const response = await fetch(
    `${ASSEMBLY_API_BASE_URL}/transcript/${transcriptId}/sentences`,
    {
      method: 'GET',
      headers: {
        authorization: apiKey
      },
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await safeParseJson(response)) as AssemblySentencesResponse | null;
  return payload?.sentences ?? [];
}

function normalizeAssemblyTranscription(
  transcript: AssemblyTranscriptResponse,
  sentences: AssemblySentencesResponse['sentences']
) {
  const sentenceLines = (sentences ?? [])
    .map((sentence) => ({
      start_time: secondsFromMs(sentence.start),
      end_time: secondsFromMs(sentence.end),
      text: String(sentence.text ?? '').trim()
    }))
    .filter(
      (line) =>
        Number.isFinite(line.start_time) &&
        Number.isFinite(line.end_time) &&
        line.end_time > line.start_time &&
        line.text.length > 0
    );

  if (sentenceLines.length > 0) {
    return sentenceLines;
  }

  const wordLines = normalizeAssemblyWords(transcript.words ?? []);
  if (wordLines.length > 0) {
    return wordLines;
  }

  return normalizeTranscriptionResult({
    text: transcript.text,
    duration: transcript.audio_duration
  });
}

function normalizeAssemblyWords(
  words: Array<{ text?: string; start?: number; end?: number }>
): TranscriptInput[] {
  const normalizedWords = words
    .map((word) => ({
      text: String(word.text ?? '').trim(),
      start: Number(word.start ?? 0),
      end: Number(word.end ?? 0)
    }))
    .filter(
      (word) =>
        word.text.length > 0 &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end) &&
        word.end > word.start
    );

  if (normalizedWords.length === 0) {
    return [];
  }

  const segments: TranscriptInput[] = [];
  let bucket: typeof normalizedWords = [];

  const flushBucket = () => {
    if (!bucket.length) {
      return;
    }

    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const text = bucket.map((word) => word.text).join(' ').trim();
    const start = secondsFromMs(first.start);
    const end = secondsFromMs(last.end);

    if (text && end > start) {
      segments.push({
        start_time: start,
        end_time: end,
        text
      });
    }

    bucket = [];
  };

  for (const word of normalizedWords) {
    bucket.push(word);
    const segmentMs = word.end - bucket[0].start;
    const shouldFlush =
      /[.!?]$/.test(word.text) || bucket.length >= 16 || segmentMs >= 5200;

    if (shouldFlush) {
      flushBucket();
    }
  }

  flushBucket();
  return segments;
}

function secondsFromMs(value: unknown) {
  const ms = Number(value ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }
  return Number((ms / 1000).toFixed(3));
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

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function formatProviderError(prefix: string, response: Response) {
  let detail = '';
  try {
    const payload = await response.json();
    if (payload && typeof payload === 'object') {
      if ('error' in payload && typeof payload.error === 'string') {
        detail = payload.error;
      } else if ('message' in payload && typeof payload.message === 'string') {
        detail = payload.message;
      } else {
        detail = JSON.stringify(payload);
      }
    }
  } catch {
    detail = '';
  }

  if (!detail) {
    detail = response.statusText || 'Unknown error.';
  }

  return `${prefix} (${response.status}): ${detail}`;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

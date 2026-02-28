import type { TranscriptSentence } from '@/types/database';

export const PLAYER_SPEEDS = [0.75, 1, 1.25, 1.5] as const;

export function formatVttTime(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.floor(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  const mmm = String(milliseconds).padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^a-zA-ZäöüÄÖÜß]/g, '')
    .replace(/[Ä]/g, 'ä')
    .replace(/[Ö]/g, 'ö')
    .replace(/[Ü]/g, 'ü')
    .trim();
}

export function normalizePhrase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zA-ZäöüÄÖÜß\s]/g, ' ')
    .replace(/[Ä]/g, 'ä')
    .replace(/[Ö]/g, 'ö')
    .replace(/[Ü]/g, 'ü')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeSentence(text: string): string[] {
  return text
    .split(/(\s+|[.,!?;:"(){}\[\]„“‚‘…—–-])/g)
    .filter((token) => token.length > 0);
}

export function findCurrentSentence(
  transcript: TranscriptSentence[],
  playedSeconds: number
): TranscriptSentence | undefined {
  return transcript.find(
    (sentence) =>
      playedSeconds >= sentence.start_time && playedSeconds < sentence.end_time
  );
}

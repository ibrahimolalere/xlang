import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getPlayableVideoUrl(input: string): string {
  if (input.includes('youtube.com') || input.includes('youtu.be')) {
    return input;
  }

  // Allow direct mp4/webm URLs and full remote links.
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }

  // Backward compatibility with older records that may store YouTube IDs only.
  return `https://www.youtube.com/watch?v=${input}`;
}

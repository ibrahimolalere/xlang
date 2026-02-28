import type { LevelName } from '@/types/database';

export interface TranscriptInput {
  start_time: number;
  end_time: number;
  text: string;
}

export type VideoSourceType = 'local' | 'youtube';

export interface AdminVideoRequestInput {
  adminPasscode: string;
  title: string;
  description: string;
  duration: string;
  transcriptLines: string;
  sourceType: VideoSourceType;
  youtubeUrlInput: string;
  level: LevelName;
  videoFile: FormDataEntryValue | null;
  thumbnailFile: FormDataEntryValue | null;
}

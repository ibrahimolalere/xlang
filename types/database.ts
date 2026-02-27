export type LevelName = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Level {
  id: string;
  name: LevelName;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  level_id: string;
  video_url: string;
  thumbnail_url: string;
  duration: string;
}

export interface TranscriptSentence {
  id: string;
  video_id: string;
  start_time: number;
  end_time: number;
  text: string;
}

export interface VideoWithLevel extends Video {
  levels: Pick<Level, 'name'>[];
}

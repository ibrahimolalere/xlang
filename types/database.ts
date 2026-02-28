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

export type LearnerContactType = 'email' | 'whatsapp';

export interface LearnerProfile {
  id: string;
  learner_key: string;
  contact_type: LearnerContactType;
  contact_value: string;
  created_at: string;
  updated_at: string;
}

export type SavedWordStatus = 'saved' | 'learned';

export interface LearnerSavedWord {
  id: string;
  learner_key: string;
  word: string;
  normalized_word: string;
  translation: string;
  sentence: string;
  video_id: string;
  video_title: string;
  status: SavedWordStatus;
  saved_at: string;
  learned_at: string | null;
  reminder_due_at: string;
  reminder_sent_at: string | null;
}

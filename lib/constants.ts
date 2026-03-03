import type { LevelName } from '@/types/database';

export const LEVELS: LevelName[] = ['A1', 'A2', 'B2', 'C1'];

export const LEVEL_CARD_IMAGE: Record<LevelName, string> = {
  A1: '/levels/A1.png',
  A2: '/levels/A2.png',
  B2: '/levels/B2.png',
  C1: '/levels/C1.png'
};

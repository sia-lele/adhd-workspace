import type { TaskDifficulty } from '../types';

/** 各难度对应的完成积分：简单 1 / 中等 3 / 困难 5 */
export const DIFFICULTY_POINTS: Record<TaskDifficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

/** 难度中文标签（用于 UI 展示） */
export const DIFFICULTY_LABEL: Record<TaskDifficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

/** 展示顺序（从易到难） */
export const DIFFICULTY_ORDER: TaskDifficulty[] = ['easy', 'medium', 'hard'];

/** 取难度（缺省视为简单） */
export function difficultyOf(d?: TaskDifficulty): TaskDifficulty {
  return d ?? 'easy';
}

/** 按难度计算完成可得积分（缺省 = 简单 = 1） */
export function pointsForDifficulty(d?: TaskDifficulty): number {
  return DIFFICULTY_POINTS[difficultyOf(d)];
}

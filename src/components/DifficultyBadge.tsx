import type { TaskDifficulty } from '../types';
import { DIFFICULTY_POINTS, DIFFICULTY_LABEL, difficultyOf } from '../lib/difficulty';

/**
 * 难度徽标：仅在「中等 / 困难」任务上显示「+N⭐」，简单任务不显示以保持清爽。
 * 作用：用更高的分值提示「这是值得多攒分的一步」，帮困难类任务更容易被启动。
 */
export default function DifficultyBadge({ difficulty }: { difficulty?: TaskDifficulty }) {
  const d = difficultyOf(difficulty);
  if (d === 'easy') return null;
  const pts = DIFFICULTY_POINTS[d];
  const isHard = d === 'hard';
  const color = isHard ? '#b07a6e' : '#7a6cc9';
  const bg = isHard ? '#f7eae3' : '#edeaf7';
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 leading-none"
      style={{ color, backgroundColor: bg }}
      title={`${DIFFICULTY_LABEL[d]}任务 · 完成得 ${pts} 分`}
    >
      +{pts}⭐
    </span>
  );
}

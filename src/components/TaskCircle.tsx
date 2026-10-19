import type { TaskStatus } from '../types';
import { emitCelebrate } from '../lib/celebrate';

interface Props {
  status: TaskStatus;
  onClick?: () => void;
  size?: number;
  title?: string;
  points?: number; // 完成可得积分（用于庆祝动画显示 +N），默认 1
}

/** 圆圈待办：点击完成，再次点击撤销（可逆状态，不依赖双击） */
export default function TaskCircle({ status, onClick, size = 26, title, points = 1 }: Props) {
  const cls = status === 'done' ? 'done' : status === 'skipped' ? 'skipped' : '';

  const handleClick = (e: React.MouseEvent) => {
    // 仅在「完成（todo → done）」的瞬间放出庆祝浮层；撤销不触发
    if (status !== 'done') {
      let x = e.clientX;
      let y = e.clientY;
      if (!x && !y) {
        // 键盘触发等非指针场景：用按钮中心兜底
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        x = r.left + r.width / 2;
        y = r.top + r.height / 2;
      }
      emitCelebrate(x, y, points);
    }
    onClick?.();
  };

  return (
    <button
      type="button"
      aria-label={status === 'done' ? '已完成，点击撤销' : '点击完成'}
      title={title}
      onClick={handleClick}
      className={`task-circle ${cls}`}
      style={{ width: size, height: size }}
    >
      <svg className="check" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 13l4 4L19 7" />
      </svg>
    </button>
  );
}

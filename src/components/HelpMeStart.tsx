import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { TaskInstance } from '../types';
import { timeToMinutes, nowTimeString } from '../lib/dateUtils';

interface Props {
  focusDate: string;
  onClose: () => void;
  onStartFocus: (t: TaskInstance) => void;
}

/** 选择一件任务：置顶 > 临近当前时间 > 门槛低(时长短) > 其他 */
function rankTasks(tasks: TaskInstance[], nowMin: number): TaskInstance[] {
  return [...tasks].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ta = timeToMinutes(a.scheduledTime);
    const tb = timeToMinutes(b.scheduledTime);
    // 有时间的放在合适位置：与当前时间差绝对值小优先
    const da = ta === 9999 ? 9999 : Math.abs(ta - nowMin);
    const db = tb === 9999 ? 9999 : Math.abs(tb - nowMin);
    if (da !== db) return da - db;
    const duA = a.durationMinutes ?? 9999;
    const duB = b.durationMinutes ?? 9999;
    return duA - duB;
  });
}

export default function HelpMeStart({ focusDate, onClose, onStartFocus }: Props) {
  const app = useApp();
  const lowEnergy = app.getLowEnergy(focusDate);

  const candidates = useMemo(() => {
    const all = app.instances.filter(
      (i) => i.localDate === focusDate && i.status === 'todo',
    );
    let pool = all;
    // 低能量模式开启时，优先从精选/优先任务中推荐
    if (lowEnergy.enabled) {
      const preferred = all.filter(
        (t) => lowEnergy.shownTaskIds.includes(t.id) || t.lowEnergyPreferred,
      );
      if (preferred.length) pool = preferred;
    }
    return rankTasks(pool, timeToMinutes(nowTimeString()));
  }, [app.instances, focusDate, lowEnergy]);

  const [idx, setIdx] = useState(0);
  const current = candidates[idx] ?? null;

  if (candidates.length === 0) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-canvas rounded-2xl shadow-soft p-8 max-w-sm text-center mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-4xl mb-3">🌿</div>
          <h2 className="text-lg font-semibold text-ink mb-2">今天没有待办啦</h2>
          <p className="text-ink-soft text-sm mb-5">已经很好了。想做点什么的话，可以点右下角「＋」添加一件小事。</p>
          <button onClick={onClose} className="btn-primary w-full">好的</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-canvas rounded-2xl shadow-soft p-7 max-w-sm w-full mx-4 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-teal-deep mb-1">现在可以做</p>
        <h2 className="text-2xl font-semibold text-ink mb-5 break-words">{current?.title}</h2>

        <div className="bg-white rounded-xl p-4 mb-5 text-left border border-[#efeae1]">
          <p className="text-xs text-ink-faint mb-1">第一步</p>
          <p className="text-ink">
            {current?.firstStep || '只要先开始最小的一步就好——比如，打开它。'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => current && onStartFocus(current)}
            className="btn-primary flex-1"
          >
            开始
          </button>
          <button
            onClick={() => setIdx((i) => (i + 1) % candidates.length)}
            className="btn-ghost"
          >
            换一件
          </button>
          <button onClick={onClose} className="btn-ghost">
            暂时不做
          </button>
        </div>
        <p className="text-xs text-ink-faint mt-4">
          第 {idx + 1} / {candidates.length} 件 · 系统只是建议，不强制
        </p>
      </div>
    </div>
  );
}

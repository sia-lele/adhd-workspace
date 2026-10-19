import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { TaskInstance } from '../types';
import { emitCelebrate } from '../lib/celebrate';
import { pointsForDifficulty } from '../lib/difficulty';
import DifficultyBadge from './DifficultyBadge';

interface Props {
  task: TaskInstance;
  onClose: () => void;
}

const PRESETS = [
  { label: '不计时', value: 0 },
  { label: '2 分钟', value: 2 },
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '25 分钟', value: 25 },
];

export default function FocusMode({ task, onClose }: Props) {
  const app = useApp();
  const [minutes, setMinutes] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [running]);

  const startTimer = (m: number) => {
    setMinutes(m);
    setRemaining(m * 60);
    setFinished(false);
    setRunning(true);
  };

  const pause = () => setRunning(false);
  const resume = () => {
    if (remaining > 0) setRunning(true);
  };

  const complete = async (e?: React.MouseEvent) => {
    if (task.status !== 'done') {
      let x = e?.clientX ?? 0;
      let y = e?.clientY ?? 0;
      if (!x && !y) {
        const r = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
        x = r ? r.left + r.width / 2 : window.innerWidth / 2;
        y = r ? r.top + r.height / 2 : window.innerHeight / 2;
      }
      emitCelebrate(x, y, pointsForDifficulty(task.difficulty));
      await app.toggleComplete(task.id);
    }
    onClose();
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#3a3733] text-white flex flex-col items-center justify-center px-6">
      <button onClick={onClose} className="absolute top-5 right-5 text-white/60 text-2xl">×</button>

      <p className="text-white/50 text-sm mb-2">正在专注</p>
      <h1 className="text-2xl font-semibold text-center mb-6 max-w-sm break-words">{task.title}</h1>
      <DifficultyBadge difficulty={task.difficulty} />

      <div className="bg-white/10 rounded-2xl p-5 mb-6 w-full max-w-sm text-center">
        <p className="text-white/50 text-xs mb-1">第一步</p>
        <p className="text-lg">{task.firstStep || '先开始最小的一步。'}</p>
      </div>

      {minutes > 0 && (
        <div className="text-5xl font-light tabular-nums mb-2">{fmt(remaining)}</div>
      )}

      {finished && (
        <div className="bg-white/10 rounded-xl px-4 py-2 mb-4 text-center text-white/80">
          要继续一点，还是先休息？
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => startTimer(p.value)}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              minutes === p.value && running ? 'bg-white text-[#3a3733] border-white' : 'border-white/30 text-white/80'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        {running ? (
          <button onClick={pause} className="bg-white/15 px-6 py-2.5 rounded-full">暂停</button>
        ) : minutes > 0 && remaining > 0 && !finished ? (
          <button onClick={resume} className="bg-white/15 px-6 py-2.5 rounded-full">继续</button>
        ) : null}
        <button onClick={(e) => complete(e)} className="bg-sage px-6 py-2.5 rounded-full font-medium">完成</button>
        <button onClick={onClose} className="bg-white/10 px-6 py-2.5 rounded-full">退出</button>
      </div>

      <p className="text-white/40 text-xs mt-6 text-center max-w-xs">
        退出不代表失败，随时可以回来。开始两分钟，也是有意义的行动。
      </p>
    </div>
  );
}

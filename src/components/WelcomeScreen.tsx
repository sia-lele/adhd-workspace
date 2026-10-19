import { useApp } from '../store/AppContext';

interface Props {
  onStart: (view: 'sop' | 'today') => void;
  onAdd: () => void;
}

export default function WelcomeScreen({ onStart, onAdd }: Props) {
  const app = useApp();
  const handle = async (fn: () => void) => {
    await app.finishOnboarding();
    fn();
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-canvas">
      <div className="w-full max-w-md text-center animate-fade-in">
        <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-sage-soft flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6e937c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-ink mb-2">先把你的日常交给这里。</h1>
        <p className="text-ink-soft leading-relaxed mb-8">
          设置一次 SOP，以后每天打开，就知道自己可以做什么。
          <br />
          不需要每天重新规划，也不需要向谁证明完成率。
        </p>
        <div className="space-y-3">
          <button
            onClick={() => handle(() => onStart('sop'))}
            className="btn-primary w-full text-base py-3"
          >
            输入我的 SOP
          </button>
          <button
            onClick={() => handle(() => onAdd())}
            className="btn-ghost w-full text-base py-3"
          >
            先添加一件事
          </button>
        </div>
        <p className="mt-8 text-xs text-ink-faint leading-relaxed">
          所有数据仅保存在本机浏览器（IndexedDB）。<br />
          建议使用「设置 → 导出备份」定期保存一份 JSON。
        </p>
      </div>
    </div>
  );
}

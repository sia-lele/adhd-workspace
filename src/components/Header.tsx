import type { View } from '../App';

interface Props {
  view: View;
  onNav: (v: View) => void;
  onSettings: () => void;
}

const TABS: { key: View; label: string }[] = [
  { key: 'week', label: '本周' },
  { key: 'today', label: '今天' },
  { key: 'points', label: '积分' },
  { key: 'sop', label: '我的 SOP' },
];

export default function Header({ view, onNav, onSettings }: Props) {
  return (
    <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur border-b border-[#efeae1]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sage text-xl">●</span>
          <span className="font-semibold text-ink text-[15px] hidden sm:inline">ADHD 外部执行大脑</span>
          <span className="font-semibold text-ink text-[15px] sm:hidden">执行大脑</span>
        </div>
        <nav className="flex items-center gap-1 bg-white/70 rounded-full p-1 border border-[#efeae1]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => onNav(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm transition ${
                view === t.key ? 'bg-teal text-white' : 'text-ink-soft hover:text-teal-deep'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          onClick={onSettings}
          aria-label="设置"
          className="w-9 h-9 rounded-full flex items-center justify-center text-ink-soft hover:bg-white/70 hover:text-teal-deep transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
}

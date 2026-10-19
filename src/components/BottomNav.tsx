import type { View } from '../App';

interface Props {
  view: View;
  onNav: (v: View) => void;
}

const TABS: { key: View; label: string; icon: JSX.Element }[] = [
  {
    key: 'week',
    label: '本周',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    key: 'today',
    label: '今天',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: 'points',
    label: '积分',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.3l6.5-.9z" />
      </svg>
    ),
  },
  {
    key: 'sop',
    label: '我的 SOP',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h12a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4z" />
        <path d="M4 5v14" />
        <path d="M8 9h6M8 13h6" />
      </svg>
    ),
  },
];

export default function BottomNav({ view, onNav }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-canvas/95 backdrop-blur border-t border-[#efeae1] pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-5xl mx-auto flex items-stretch justify-around">
        {TABS.map((t) => {
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onNav(t.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition ${
                active ? 'text-teal-deep' : 'text-ink-faint'
              }`}
            >
              <span className={active ? 'text-teal' : ''}>{t.icon}</span>
              <span className="text-[11px]">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

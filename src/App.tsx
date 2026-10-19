import { useEffect, useMemo, useState } from 'react';
import { useApp } from './store/AppContext';
import { nowLocalDate } from './lib/dateUtils';
import WelcomeScreen from './components/WelcomeScreen';
import BottomNav from './components/BottomNav';
import Header from './components/Header';
import WeekView from './pages/WeekView';
import TodayView from './pages/TodayView';
import SopView from './pages/SopView';
import PointsView from './pages/PointsView';
import Settings from './components/Settings';
import QuickAdd from './components/QuickAdd';
import TaskDetailDrawer from './components/TaskDetailDrawer';
import HelpMeStart from './components/HelpMeStart';
import FocusMode from './components/FocusMode';
import CelebrateLayer from './components/CelebrateLayer';
import type { TaskInstance } from './types';

type View = 'week' | 'today' | 'points' | 'sop';

export default function App() {
  const app = useApp();
  const [view, setView] = useState<View>('week');
  const [focusDate, setFocusDate] = useState<string>(nowLocalDate());
  const [showSettings, setShowSettings] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddPreset, setQuickAddPreset] = useState<'habit' | undefined>(undefined);
  const openQuickAdd = (preset?: 'habit') => {
    setQuickAddPreset(preset);
    setQuickAddOpen(true);
  };
  const [detail, setDetail] = useState<TaskInstance | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusTask, setFocusTask] = useState<TaskInstance | null>(null);

  // 减少动态效果
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', !!app.prefs.reducedMotion);
  }, [app.prefs.reducedMotion]);

  const goTodayWithDate = (date: string) => {
    setFocusDate(date);
    setView('today');
  };

  const openDetail = (inst: TaskInstance) => setDetail(inst);
  const closeDetail = () => setDetail(null);

  // 详情保存后刷新 detail 引用
  const refreshedDetail = useMemo(() => {
    if (!detail) return null;
    return app.instances.find((i) => i.id === detail.id) ?? null;
  }, [detail, app.instances]);

  if (!app.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-faint">
        正在准备你的外部执行大脑…
      </div>
    );
  }

  if (!app.onboarded) {
    return (
      <WelcomeScreen
        onStart={(v) => setView(v)}
        onAdd={() => {
          setView('today');
          openQuickAdd();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        view={view}
        onNav={(v) => {
          setView(v);
          if (v === 'today') setFocusDate(nowLocalDate());
        }}
        onSettings={() => setShowSettings(true)}
      />

      <main className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-5 pb-28 pt-3">
        {view === 'week' && <WeekView onSelectDay={goTodayWithDate} openDetail={openDetail} />}
        {view === 'today' && (
          <TodayView
            focusDate={focusDate}
            onDateChange={setFocusDate}
            openDetail={openDetail}
            onHelp={() => setHelpOpen(true)}
            onStartFocus={(t) => setFocusTask(t)}
            onQuickAdd={() => openQuickAdd()}
            onQuickAddHabit={() => openQuickAdd('habit')}
          />
        )}
        {view === 'sop' && <SopView openDetail={openDetail} />}
        {view === 'points' && <PointsView />}
      </main>

      <BottomNav view={view} onNav={(v) => { setView(v); if (v === 'today') setFocusDate(nowLocalDate()); }} />

      {/* 全局快速添加 */}
      <button
        onClick={() => openQuickAdd()}
        aria-label="快速添加"
        className="fixed right-5 bottom-24 sm:bottom-8 z-30 w-14 h-14 rounded-full bg-teal text-white text-3xl leading-none shadow-soft flex items-center justify-center hover:bg-teal-deep active:scale-95 transition"
        style={{ marginBottom: 0 }}
      >
        +
      </button>

      {quickAddOpen && (
        <QuickAdd
          defaultDate={focusDate}
          preset={quickAddPreset}
          onClose={() => {
            setQuickAddOpen(false);
            setQuickAddPreset(undefined);
          }}
        />
      )}

      {refreshedDetail && (
        <TaskDetailDrawer
          instance={refreshedDetail}
          onClose={closeDetail}
        />
      )}

      {helpOpen && (
        <HelpMeStart
          focusDate={focusDate}
          onClose={() => setHelpOpen(false)}
          onStartFocus={(t) => {
            setHelpOpen(false);
            setFocusTask(t);
          }}
        />
      )}

      {focusTask && (
        <FocusMode task={focusTask} onClose={() => setFocusTask(null)} />
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* 完成任务时的 +1 ⭐ 庆祝浮层（全局，跟随点击位置浮出） */}
      <CelebrateLayer />
    </div>
  );
}

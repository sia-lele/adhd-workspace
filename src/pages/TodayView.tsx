import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { TaskInstance } from '../types';
import { weekdayLabel, formatMonthDay, nowLocalDate, timeToMinutes, nowTimeString, weekDays } from '../lib/dateUtils';
import TaskCircle from '../components/TaskCircle';
import { SingleDeleteButton } from '../components/TaskDelete';
import DifficultyBadge from '../components/DifficultyBadge';
import { pointsForDifficulty } from '../lib/difficulty';

interface Props {
  focusDate: string;
  onDateChange: (d: string) => void;
  openDetail: (t: TaskInstance) => void;
  onHelp: () => void;
  onStartFocus: (t: TaskInstance) => void;
  onQuickAdd: () => void;
  onQuickAddHabit: () => void;
}

const CALM_LINES = [
  '今天，从一件小事开始。',
  '不必一次做完，先开始就好。',
  '慢慢来，今天的事会一件件清晰起来。',
  '你不需要证明什么，做一点就很好。',
];

// 时间轴参数：07:00 – 24:00，24 小时制
const START_MIN = 7 * 60;
const END_MIN = 24 * 60;
const HOUR_PX = 64;
const PX_PER_MIN = HOUR_PX / 60;
const AXIS_HEIGHT = ((END_MIN - START_MIN) / 60) * HOUR_PX; // 17 小时 = 1088px
const CARD_MIN_GAP = 46; // 同侧任务卡片最小间距，避免重叠

function topFor(minutes: number): number {
  return Math.max(0, Math.min((minutes - START_MIN) * PX_PER_MIN, AXIS_HEIGHT - 44));
}

export default function TodayView({ focusDate, onDateChange, openDetail, onHelp, onStartFocus, onQuickAdd, onQuickAddHabit }: Props) {
  const app = useApp();
  const { ensureDates } = app;
  const today = nowLocalDate();
  const isToday = focusDate === today;
  const lowEnergy = app.getLowEnergy(focusDate);
  const [expanded, setExpanded] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);
  const [orderMode, setOrderMode] = useState<'sop' | 'time'>('sop'); // 默认按 SOP 顺序排列

  useEffect(() => {
    ensureDates([focusDate]);
    setExpanded(false);
  }, [ensureDates, focusDate]);

  const tasks = useMemo(
    () => app.instances.filter((i) => i.localDate === focusDate),
    [app.instances, focusDate],
  );

  const todo = tasks.filter((t) => t.status === 'todo');
  const done = tasks.filter((t) => t.status === 'done');
  const skipped = tasks.filter((t) => t.status === 'skipped');

  // 成就感：今天（focusDate）/ 本周 各完成了多少件事
  const dayDone = done.length;
  const weekSet = useMemo(
    () => new Set(weekDays(focusDate, app.prefs.weekStartsOn)),
    [focusDate, app.prefs.weekStartsOn],
  );
  const weekDone = useMemo(
    () => app.instances.filter((i) => i.status === 'done' && weekSet.has(i.localDate)).length,
    [app.instances, weekSet],
  );

  const todoTimed = todo.filter((t) => t.scheduledTime);
  const todoUntimed = todo.filter((t) => !t.scheduledTime);
  const doneTimed = done.filter((t) => t.scheduledTime);
  const doneUntimed = done.filter((t) => !t.scheduledTime);

  // 按 SOP 分组（大框架与「我的 SOP」顺序一致），组内按 SOP 任务顺序（sortOrder），再按时间
  const byTemplate = useMemo(() => new Map(app.templates.map((t) => [t.id, t])), [app.templates]);
  const sopSections = useMemo(() => {
    const buckets = new Map<string, { name: string; tasks: TaskInstance[] }>();
    for (const s of app.sops) buckets.set(s.id, { name: s.name, tasks: [] });
    buckets.set('__none__', { name: '习惯', tasks: [] });
    // 工作日 <-> 周末 反向映射，用于跨框架任务放入另一套 SOP 区块
    const oppositeSop: Record<string, string | undefined> = {};
    const wk = app.sops.find((s) => s.type === 'weekdays');
    const we = app.sops.find((s) => s.type === 'weekends');
    if (wk) oppositeSop[wk.id] = we?.id;
    if (we) oppositeSop[we.id] = wk?.id;
    for (const t of tasks) {
      const tpl = t.templateId ? byTemplate.get(t.templateId) : undefined;
      const key = tpl?.sopId ?? '__none__';
      (buckets.get(key) ?? buckets.get('__none__')!).tasks.push(t);
      // 跨框架：同时在另一套 SOP 区块也出现一次（同一实例，完成状态共享）
      if (tpl?.crossScope && tpl.sopId && oppositeSop[tpl.sopId]) {
        buckets.get(oppositeSop[tpl.sopId]!)?.tasks.push(t);
      }
    }
    return [...buckets.entries()]
      .map(([key, sec]) => ({
        key,
        name: sec.name,
        tasks: sec.tasks.sort((a, b) => {
          const sa = a.templateId ? byTemplate.get(a.templateId)?.sortOrder ?? 9999 : 9999;
          const sb = b.templateId ? byTemplate.get(b.templateId)?.sortOrder ?? 9999 : 9999;
          if (sa !== sb) return sa - sb;
          return timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime);
        }),
      }))
      .filter((s) => s.tasks.length > 0);
  }, [tasks, app.sops, byTemplate]);

  // 低能量模式：精选少量任务
  const lowEnergyTasks = useMemo(() => {
    if (!lowEnergy.enabled) return null;
    if (lowEnergy.shownTaskIds.length) {
      const map = new Map(tasks.map((t) => [t.id, t]));
      const picked = lowEnergy.shownTaskIds.map((id) => map.get(id)).filter(Boolean) as TaskInstance[];
      if (picked.length) return picked;
    }
    const preferred = todo.filter((t) => t.lowEnergyPreferred || t.pinned);
    const pool = preferred.length ? preferred : todo;
    return pool.slice(0, 3);
  }, [lowEnergy, tasks, todo]);

  const swapLowEnergy = () => {
    const rest = todo.filter((t) => !lowEnergy.shownTaskIds.includes(t.id) && !lowEnergyTasks?.some((x) => x.id === t.id));
    if (rest.length === 0) return;
    const next = rest.slice(0, 3).map((t) => t.id);
    app.setLowEnergy(focusDate, { shownTaskIds: next });
  };

  const calm = CALM_LINES[new Date(focusDate).getDate() % CALM_LINES.length];

  const hasAny = tasks.length > 0 || skipped.length > 0;
  const allDone = todo.length === 0 && done.length > 0;

  return (
    <div className="animate-fade-in">
      {/* 顶部：日期 + 文案 + 操作 */}
      <div className="flex items-start justify-between mb-4 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-ink">{formatMonthDay(focusDate)}</h1>
            <span className="text-ink-faint">{weekdayLabel(focusDate)}</span>
            {isToday && <span className="text-xs bg-lilac-soft text-teal-deep px-2 py-0.5 rounded-full">今天</span>}
          </div>
          <p className="text-sm text-ink-soft mt-0.5">{calm}</p>
        </div>
        <button
          onClick={() => app.setLowEnergy(focusDate, { enabled: !lowEnergy.enabled })}
          className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-full border transition ${
            lowEnergy.enabled ? 'bg-sage-soft border-sage text-sage-deep' : 'border-stroke text-ink-soft hover:border-teal'
          }`}
          title="低能量模式：只显示少量最容易开始的任务"
        >
          🌿 低能量模式
        </button>
      </div>

      {/* 日期切换（轻量） */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <button onClick={() => onDateChange(prevDay(focusDate))} className="w-8 h-8 rounded-full border border-stroke text-ink-soft hover:border-teal">‹</button>
        {!isToday && (
          <button onClick={() => onDateChange(today)} className="px-3 py-1 rounded-full bg-white border border-stroke text-ink-soft hover:border-teal">
            回到今天
          </button>
        )}
        <button onClick={() => onDateChange(nextDay(focusDate))} className="w-8 h-8 rounded-full border border-stroke text-ink-soft hover:border-teal">›</button>
      </div>

      {/* 主操作按钮 */}
      <div className="flex gap-2 mb-3">
        <button onClick={onHelp} className="btn-primary flex-1 flex items-center justify-center gap-2">
          <span className="text-base">✦</span> 帮我开始
        </button>
        <button onClick={onQuickAdd} className="btn-ghost">＋ 添加</button>
        <button onClick={onQuickAddHabit} className="btn-ghost whitespace-nowrap">🌱 习惯</button>
      </div>

      {/* 排序方式切换：按 SOP / 按时间（默认按 SOP，与「我的 SOP」顺序一致） */}
      <div className="inline-flex rounded-full border border-stroke p-0.5 text-sm mb-5">
        <button
          onClick={() => setOrderMode('sop')}
          className={`px-3 py-1 rounded-full transition ${orderMode === 'sop' ? 'bg-teal text-white' : 'text-ink-soft'}`}
        >
          按 SOP
        </button>
        <button
          onClick={() => setOrderMode('time')}
          className={`px-3 py-1 rounded-full transition ${orderMode === 'time' ? 'bg-teal text-white' : 'text-ink-soft'}`}
        >
          按时间
        </button>
      </div>

      {/* 低能量模式开启提示（清晰、可一键退出回到完整时间轴） */}
      {/* 成就感：今天 / 本周完成了多少件事 */}
      {hasAny && (
        <div className="card p-3.5 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-center flex-1">
              <div data-testid="stat-today" className="text-3xl font-bold text-teal-deep leading-none tabular-nums">{dayDone}</div>
              <div className="text-xs text-ink-soft mt-1">{isToday ? '今天完成（件）' : '这天完成（件）'}</div>
            </div>
            <div className="w-px h-9 bg-stroke/50" />
            <div className="text-center flex-1">
              <div data-testid="stat-week" className="text-3xl font-bold text-lilac-deep leading-none tabular-nums">{weekDone}</div>
              <div className="text-xs text-ink-soft mt-1">本周完成（件）</div>
            </div>
          </div>
          <p className="text-center text-xs text-ink-faint mt-2.5">
            {dayDone > 0
              ? `今天已经搞定 ${dayDone} 件，很棒 👏`
              : weekDone > 0
                ? `本周已经完成了 ${weekDone} 件，继续保持～`
                : '完成一件事，这里就会多一个小小的数字 ✨'}
          </p>
        </div>
      )}

      {lowEnergy.enabled && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-sage/40 bg-sage-soft/60 px-4 py-2.5">
          <span className="text-sm text-sage-deep">🌿 低能量模式开启中</span>
          <button
            onClick={() => app.setLowEnergy(focusDate, { enabled: false })}
            className="text-sm text-teal-deep hover:underline"
          >
            退出，看完整安排
          </button>
        </div>
      )}

      {/* 低能量模式简化视图 */}
      {lowEnergy.enabled && lowEnergyTasks && (
        <div className="mb-6">
          <p className="text-center text-ink-soft text-sm mb-3">今天先做一点点就好。</p>
          <div className="space-y-2">
            {lowEnergyTasks.map((t) => (
              <LowEnergyRow key={t.id} t={t} onToggle={() => app.toggleComplete(t.id)} onOpen={() => openDetail(t)} onStart={() => onStartFocus(t)} />
            ))}
          </div>
          <div className="flex justify-center gap-4 mt-3 text-sm">
            <button onClick={swapLowEnergy} className="text-teal-deep hover:underline">换一批</button>
            {!expanded && (
              <button onClick={() => setExpanded(true)} className="text-ink-faint hover:underline">
                显示其他任务（{tasks.length - lowEnergyTasks.length}）
              </button>
            )}
          </div>
        </div>
      )}

      {/* 完整视图（低能量关闭，或已展开） */}
      {(!lowEnergy.enabled || expanded) && (
        <>
          {orderMode === 'sop' ? (
            /* 按 SOP 分组：与「我的 SOP」顺序一致，组内 TODO 在左、DONE 在右 */
            <div className="space-y-5">
              {sopSections.map((sec) => (
                <div key={sec.key}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold tracking-[0.15em] text-ink-soft bg-canvas border border-stroke/50 px-2.5 py-1 rounded-full flex-shrink-0">
                      {sec.name}
                    </span>
                    <span className="flex-1 h-px bg-stroke/40" />
                    <span className="text-[11px] text-ink-faint flex-shrink-0">{sec.tasks.length} 项</span>
                  </div>
                  <div className="grid items-end mb-1" style={{ gridTemplateColumns: '1fr 88px 1fr' }}>
                    <span className="text-center text-[11px] font-semibold tracking-[0.2em] text-ink-soft">TODO</span>
                    <span />
                    <span className="text-center text-[11px] font-semibold tracking-[0.2em] text-ink-soft">DONE</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="space-y-2">
                      {sec.tasks.filter((t) => t.status !== 'done').map((t) => (
                        <TodayCard key={t.id} t={t} onToggle={() => app.toggleComplete(t.id)} onOpen={() => openDetail(t)} onStart={() => onStartFocus(t)} />
                      ))}
                      {sec.tasks.filter((t) => t.status !== 'done').length === 0 && <p className="text-xs text-ink-faint/60">—</p>}
                    </div>
                    <div className="space-y-2">
                      {sec.tasks.filter((t) => t.status === 'done').map((t) => (
                        <TodayCard key={t.id} t={t} onToggle={() => app.toggleComplete(t.id)} onOpen={() => openDetail(t)} onStart={() => onStartFocus(t)} />
                      ))}
                      {sec.tasks.filter((t) => t.status === 'done').length === 0 && <p className="text-xs text-ink-faint/60">—</p>}
                    </div>
                  </div>
                </div>
              ))}
              {sopSections.length === 0 && (
                <p className="text-sm text-ink-faint text-center py-10">这一天还没有安排。</p>
              )}
            </div>
          ) : (
            /* 按时间：竖向时间轴 07:00 – 24:00（保留原有视图） */
            <>
              {(todoUntimed.length > 0 || doneUntimed.length > 0) && (
                <div className="mb-5">
                  <div className="text-xs text-ink-faint mb-1">随时可以做</div>
                  <div className="grid items-end mb-1" style={{ gridTemplateColumns: '1fr 88px 1fr' }}>
                    <span className="text-center text-[11px] font-semibold tracking-[0.2em] text-ink-soft">TODO</span>
                    <span />
                    <span className="text-center text-[11px] font-semibold tracking-[0.2em] text-ink-soft">DONE</span>
                  </div>
                  <div className="relative grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="timeline-divider" />
                    <div className="space-y-2">
                      {todoUntimed.map((t) => (
                        <TaskCard key={t.id} t={t} onToggle={() => app.toggleComplete(t.id)} onOpen={() => openDetail(t)} onStart={() => onStartFocus(t)} />
                      ))}
                      {todoUntimed.length === 0 && <p className="text-xs text-ink-faint/60">—</p>}
                    </div>
                    <div className="space-y-2">
                      {doneUntimed.map((t) => (
                        <TaskCard key={t.id} t={t} onToggle={() => app.toggleComplete(t.id)} onOpen={() => openDetail(t)} onStart={() => onStartFocus(t)} />
                      ))}
                      {doneUntimed.length === 0 && <p className="text-xs text-ink-faint/60">—</p>}
                    </div>
                  </div>
                </div>
              )}

              {(todoTimed.length > 0 || doneTimed.length > 0) && (
                <TimeAxis
                  todoTimed={todoTimed}
                  doneTimed={doneTimed}
                  showNow={isToday}
                  onToggle={(t) => app.toggleComplete(t.id)}
                  onOpen={openDetail}
                  onStart={onStartFocus}
                />
              )}
            </>
          )}

          {/* 有完成记录但没有待办时的温和文案 */}
          {allDone && todoTimed.length === 0 && doneTimed.length === 0 && sopSections.length === 0 && (
            <div className="text-center text-ink-soft py-6">今天安排的事情已经处理好了。</div>
          )}
        </>
      )}

      {/* 空状态 */}
      {!hasAny && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🌿</div>
          <p className="text-ink-soft mb-4">今天暂时没有安排。</p>
          <button onClick={onQuickAdd} className="btn-primary">添加一件小事</button>
        </div>
      )}

      {/* 被跳过的（不评价，仅可恢复） */}
      {skipped.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-ink-faint mb-2">稍后再说（不影响其他安排）</p>
          <div className="space-y-1.5">
            {skipped.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5 text-sm">
                <TaskCircle status="skipped" onClick={() => app.restoreTask(t.id)} />
                <button onClick={() => openDetail(t)} className="task-title skipped text-left flex-1">{t.title}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 清空当天所有任务（两步确认；保留 SOP，未来仍会按安排重新生成） */}
      <div className="mt-8 pt-4 border-t border-[#efeae1]">
        <p className="text-xs text-ink-faint mb-2">只想删掉某一个？点任务上的 × 就行，不影响其他任务。</p>
        {!clearAsk ? (
          <button
            onClick={() => setClearAsk(true)}
            className="text-sm text-ink-faint hover:text-[#b07a6e] underline-offset-2 hover:underline"
          >
            清空今天的全部任务
          </button>
        ) : (
          <div className="card p-3.5 space-y-2.5">
            <p className="text-sm text-ink-soft leading-relaxed">
              清空 <span className="text-ink font-medium">{formatMonthDay(focusDate)}</span> 的所有任务吗？
              <br />
              它们会先从今天消失；SOP 仍保留，未来其他日子按原安排重新出现。
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setClearAsk(false)} className="btn-ghost">取消</button>
              <button
                onClick={async () => {
                  await app.clearInstancesForDates([focusDate]);
                  setClearAsk(false);
                }}
                className="btn-danger"
              >
                确认清空
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function prevDay(d: string): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().slice(0, 10);
}
function nextDay(d: string): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** 按 SOP 分组时的单任务卡片：显示时间（如有）、状态、操作 */
function TodayCard({
  t,
  onToggle,
  onOpen,
  onStart,
}: {
  t: TaskInstance;
  onToggle: () => void;
  onOpen: () => void;
  onStart: () => void;
}) {
  const done = t.status === 'done';
  const pts = pointsForDifficulty(t.difficulty);
  return (
    <div className={`flex items-center gap-2 min-w-0 ${done ? 'opacity-70' : ''}`}>
      <TaskCircle status={t.status} onClick={onToggle} points={pts} />
      <button onClick={onOpen} className={`task-title text-left flex-1 min-w-0 truncate text-sm ${done ? 'done' : 'text-ink'}`}>
        {t.scheduledTime && <span className="text-ink-faint mr-1.5 tabular-nums">{t.scheduledTime}</span>}
        {t.title}
      </button>
      {t.crossScope && (
        <span className="flex-shrink-0 text-[10px] text-teal-deep bg-teal-soft/70 rounded-full px-1.5 py-0.5" title="同时出现在工作日和周末">
          工作日+周末
        </span>
      )}
      <DifficultyBadge difficulty={t.difficulty} />
      {!done ? (
        <button onClick={onStart} title="专注开始" className="text-xs text-teal-deep opacity-60 hover:opacity-100 flex-shrink-0">▶</button>
      ) : (
        <button onClick={onStart} title="再做一次" className="text-xs text-teal-deep opacity-60 hover:opacity-100 flex-shrink-0">↺</button>
      )}
      <SingleDeleteButton instance={t} popover />
    </div>
  );
}

/** 竖向时间轴：TODO ｜ TIME ｜ DONE 三栏，07:00 – 24:00，24 小时制 */
function TimeAxis({
  todoTimed,
  doneTimed,
  showNow,
  onToggle,
  onOpen,
  onStart,
}: {
  todoTimed: TaskInstance[];
  doneTimed: TaskInstance[];
  showNow: boolean;
  onToggle: (t: TaskInstance) => void;
  onOpen: (t: TaskInstance) => void;
  onStart: (t: TaskInstance) => void;
}) {
  // 同侧按时间排序并防止重叠
  const layout = (items: TaskInstance[]) => {
    const sorted = [...items].sort((a, b) => timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime));
    let prev = -999;
    return sorted.map((t) => {
      const top = Math.max(topFor(timeToMinutes(t.scheduledTime)), prev + CARD_MIN_GAP);
      prev = top;
      return { t, top };
    });
  };
  const left = layout(todoTimed);
  const right = layout(doneTimed);

  const hours: number[] = [];
  for (let h = 7; h <= 24; h++) hours.push(h);

  const nowMin = timeToMinutes(nowTimeString());
  const nowTop = showNow && nowMin >= START_MIN && nowMin <= END_MIN ? (nowMin - START_MIN) * PX_PER_MIN : null;

  return (
    <div>
      {/* 表头：TO DO | TIME | DONE */}
      <div className="grid items-end mb-1" style={{ gridTemplateColumns: '1fr 88px 1fr' }}>
        <span className="text-center text-[11px] font-semibold tracking-[0.2em] text-ink-soft">TODO</span>
        <span className="text-center text-[10px] text-ink-faint">TIME</span>
        <span className="text-center text-[11px] font-semibold tracking-[0.2em] text-ink-soft">DONE</span>
      </div>

      {/* 方格纸时间轴 */}
      <div className="relative timeline-grid border border-stroke/40" style={{ height: AXIS_HEIGHT }}>
        {/* 中央时间列：竖线 + 每小时刻度 */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[88px] -translate-x-1/2 bg-[var(--canvas)]/70">
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-stroke/50 -translate-x-1/2" />
          {hours.map((h) => {
            const top = (h * 60 - START_MIN) * PX_PER_MIN;
            return (
              <div
                key={h}
                className="absolute left-1/2 -translate-x-1/2 text-[10px] text-ink-faint tabular-nums px-1"
                style={{ top: top - 7 }}
              >
                {h === 24 ? '24:00' : `${String(h).padStart(2, '0')}:00`}
              </div>
            );
          })}
        </div>

        {/* 每小时横虚线（贯穿整行） */}
        {hours.map((h) => {
          const top = (h * 60 - START_MIN) * PX_PER_MIN;
          return <div key={h} className="absolute left-0 right-0 border-t border-dashed border-stroke/30 pointer-events-none" style={{ top }} />;
        })}

        {/* 当前时间指示线（柔和，不做任何状态判定） */}
        {nowTop !== null && (
          <div className="absolute left-0 right-0 now-line pointer-events-none" style={{ top: nowTop }}>
            <span className="absolute left-1/2 -translate-x-1/2 -top-[3px] w-2 h-2 rounded-full bg-[#e6c9b8]" />
          </div>
        )}

        {/* 左侧：待办卡片（按计划时间定位） */}
        {left.map(({ t, top }) => (
          <div key={t.id} className="absolute" style={{ top, left: 4, width: 'calc(50% - 52px)' }}>
            <div className="axis-card relative">
              <button onClick={() => onOpen(t)} className="flex-1 min-w-0 truncate text-sm text-ink">
                {t.title}
              </button>
              <DifficultyBadge difficulty={t.difficulty} />
              <button onClick={() => onStart(t)} title="专注开始" className="text-xs text-teal-deep opacity-60 hover:opacity-100 flex-shrink-0">▶</button>
              <TaskCircle status={t.status} onClick={() => onToggle(t)} points={pointsForDifficulty(t.difficulty)} />
              <SingleDeleteButton instance={t} popover />
            </div>
          </div>
        ))}

        {/* 右侧：已完成卡片（完成后自动移过来，保留原计划位置） */}
        {right.map(({ t, top }) => (
          <div key={t.id} className="absolute" style={{ top, right: 4, width: 'calc(50% - 52px)' }}>
            <div className="axis-card bg-sage-soft/40 relative">
              <TaskCircle status="done" onClick={() => onToggle(t)} points={pointsForDifficulty(t.difficulty)} />
              <button onClick={() => onOpen(t)} className="flex-1 min-w-0 truncate text-sm task-title done">
                {t.title}
              </button>
              <DifficultyBadge difficulty={t.difficulty} />
              <button onClick={() => onStart(t)} title="再做一次" className="text-xs text-teal-deep opacity-60 hover:opacity-100 flex-shrink-0">↺</button>
              <SingleDeleteButton instance={t} popover />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 随时可以做区域的小卡片（按时间模式使用） */
function TaskCard({
  t,
  onToggle,
  onOpen,
  onStart,
}: {
  t: TaskInstance;
  onToggle: () => void;
  onOpen: () => void;
  onStart: () => void;
}) {
  const isDone = t.status === 'done';
  const pts = pointsForDifficulty(t.difficulty);
  return (
    <div className="flex items-center gap-2 min-w-0">
      {isDone ? (
        <>
          <TaskCircle status="done" onClick={onToggle} points={pts} />
          <button onClick={onOpen} className="task-title done text-left flex-1 min-w-0 truncate text-sm">{t.title}</button>
          <DifficultyBadge difficulty={t.difficulty} />
          {t.crossScope && <span className="flex-shrink-0 text-[10px] text-teal-deep bg-teal-soft/70 rounded-full px-1.5 py-0.5" title="同时出现在工作日和周末">工作日+周末</span>}
          <SingleDeleteButton instance={t} />
        </>
      ) : (
        <>
          <button onClick={onOpen} className="task-title text-left flex-1 min-w-0 truncate text-sm text-ink">{t.title}</button>
          <DifficultyBadge difficulty={t.difficulty} />
          {t.crossScope && <span className="flex-shrink-0 text-[10px] text-teal-deep bg-teal-soft/70 rounded-full px-1.5 py-0.5" title="同时出现在工作日和周末">工作日+周末</span>}
          <button onClick={onStart} title="专注开始" className="text-xs text-teal-deep opacity-60 hover:opacity-100 flex-shrink-0">▶</button>
          <TaskCircle status={t.status} onClick={onToggle} points={pts} />
          <SingleDeleteButton instance={t} />
        </>
      )}
    </div>
  );
}

function LowEnergyRow({ t, onToggle, onOpen, onStart }: { t: TaskInstance; onToggle: () => void; onOpen: () => void; onStart: () => void }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <TaskCircle status={t.status} onClick={onToggle} points={pointsForDifficulty(t.difficulty)} />
      <button onClick={onOpen} className={`task-title text-left flex-1 text-[15px] ${t.status === 'done' ? 'done' : 'text-ink'}`}>
        {t.title}
      </button>
      <DifficultyBadge difficulty={t.difficulty} />
      {t.status !== 'done' && (
        <button onClick={onStart} className="text-xs text-teal-deep border border-teal-soft rounded-full px-3 py-1">开始</button>
      )}
      <SingleDeleteButton instance={t} />
    </div>
  );
}

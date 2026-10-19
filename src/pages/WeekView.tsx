import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { TaskInstance } from '../types';
import { weekDays, addDays, formatWeekRange, nowLocalDate, timeToMinutes } from '../lib/dateUtils';
import { WeekRowDeleteButton } from '../components/TaskDelete';
import DifficultyBadge from '../components/DifficultyBadge';
import { emitCelebrate } from '../lib/celebrate';
import { pointsForDifficulty } from '../lib/difficulty';

interface Props {
  onSelectDay: (date: string) => void;
  openDetail: (t: TaskInstance) => void;
}

// 柔和低饱和配色轮换（填充 / 浅底）
const CELL_COLORS = [
  { fill: '#9DBBA1', soft: '#E9F1EA' }, // 鼠尾草绿
  { fill: '#A8A3D3', soft: '#EDEBF7' }, // 薰衣草紫
  { fill: '#8FB6C9', soft: '#E5EFF4' }, // 雾蓝
  { fill: '#D8C17C', soft: '#F6EFDC' }, // 奶油黄
  { fill: '#D9A48F', soft: '#F7EAE3' }, // 蜜桃
  { fill: '#8FC3B1', soft: '#E3F1EC' }, // 薄荷
  { fill: '#CFA0AC', soft: '#F5E7EB' }, // 藕粉
];

const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];

/** 取该行的任意一个实例（用于读取难度等随模板而来的信息） */
function rowAnyInstance(row: { perDay: Map<string, TaskInstance> }): TaskInstance | undefined {
  return [...row.perDay.values()][0];
}

export default function WeekView({ onSelectDay, openDetail }: Props) {
  const app = useApp();
  const { ensureDates } = app;
  const today = nowLocalDate();
  const weekStartsOn = app.prefs.weekStartsOn;
  const [weekOffset, setWeekOffset] = useState(0);
  const [clearAsk, setClearAsk] = useState(false);
  const days = useMemo(
    () => weekDays(addDays(today, weekOffset * 7), weekStartsOn),
    [today, weekStartsOn, weekOffset],
  );

  useEffect(() => {
    ensureDates(days);
  }, [ensureDates, days]);

  // 按 SOP 分组（大框架：「工作日」「周末」……），组内按 SOP 页的任务顺序（sortOrder）排列。
  // 工作日与周末重复的任务各归各自的框架，不合并到一起。
  const sections = useMemo(() => {
    const byTemplate = new Map(app.templates.map((t) => [t.id, t]));
    type Row = {
      key: string;
      title: string;
      templateId: string | null;
      perDay: Map<string, TaskInstance>;
      earliest: number;
      color: number;
    };
    // 框架顺序 = SOP 页顺序；不属于任何 SOP 的任务归入「临时任务」放最后
    const buckets = new Map<string, { name: string; rows: Map<string, Row> }>();
    for (const sop of app.sops) buckets.set(sop.id, { name: sop.name, rows: new Map() });
    buckets.set('__none__', { name: '临时任务', rows: new Map() });

    for (const i of app.instances) {
      if (!days.includes(i.localDate)) continue;
      const tpl = i.templateId ? byTemplate.get(i.templateId) : undefined;
      const key = tpl?.sopId ?? '__none__';
      const sec = buckets.get(key) ?? buckets.get('__none__')!;
      const rowKey = i.templateId || `single-${i.id}`;
      let row = sec.rows.get(rowKey);
      if (!row) {
        row = { key: rowKey, title: i.title, templateId: i.templateId, perDay: new Map(), earliest: 9999, color: 0 };
        sec.rows.set(rowKey, row);
      }
      row.perDay.set(i.localDate, i);
      const m = timeToMinutes(i.scheduledTime);
      if (m >= 0 && m < row.earliest) row.earliest = m;
    }

    // 组内按 SOP 页顺序（sortOrder）排序；配色全局轮换，避免同色相邻
    let colorIdx = 0;
    return [...buckets.entries()]
      .map(([key, sec]) => ({
        key,
        name: sec.name,
        rows: [...sec.rows.values()].sort((a, b) => {
          const ta = a.templateId ? byTemplate.get(a.templateId) : undefined;
          const tb = b.templateId ? byTemplate.get(b.templateId) : undefined;
          const sa = ta?.sortOrder ?? 9999;
          const sb = tb?.sortOrder ?? 9999;
          if (sa !== sb) return sa - sb;
          return a.title.localeCompare(b.title, 'zh');
        }),
      }))
      .filter((sec) => sec.rows.length > 0)
      .map((sec) => {
        for (const row of sec.rows) row.color = colorIdx++ % CELL_COLORS.length;
        return sec;
      });
  }, [app.instances, app.templates, app.sops, days]);

  const anyTask = sections.some((s) => s.rows.length > 0);

  return (
    <div className="animate-fade-in">
      {/* 顶部：周切换 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">本周</h1>
          <p className="text-sm text-ink-faint">{formatWeekRange(days[0], days[6])}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="w-8 h-8 rounded-full border border-stroke text-ink-soft hover:border-teal"
            aria-label="上一周"
          >
            ‹
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 rounded-full bg-white border border-stroke text-xs text-ink-soft hover:border-teal"
            >
              回到本周
            </button>
          )}
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="w-8 h-8 rounded-full border border-stroke text-ink-soft hover:border-teal"
            aria-label="下一周"
          >
            ›
          </button>
        </div>
      </div>

      {/* 打卡网格卡片 */}
      <div className="card p-4 sm:p-6">
        {/* 星期表头：点击某天 → 在今日打开该天 */}
        <div className="grid week-grid mb-2">
          <div />
          {days.map((d, idx) => {
            const isToday = d === today;
            const weekend = idx >= 5;
            return (
              <button
                key={d}
                onClick={() => onSelectDay(d)}
                className="flex flex-col items-center gap-0.5 focus:outline-none"
                title="在今日打开这一天"
              >
                <span className={`text-[11px] ${weekend ? 'text-ink-faint/70' : 'text-ink-faint'} ${isToday ? 'text-teal-deep font-semibold' : ''}`}>
                  {WEEKDAY_HEADERS[idx]}
                </span>
                <span
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs ${
                    isToday ? 'bg-teal text-white font-semibold' : 'text-ink-soft'
                  }`}
                >
                  {Number(d.slice(8, 10))}
                </span>
              </button>
            );
          })}
        </div>

        {!anyTask && (
          <p className="text-sm text-ink-faint text-center py-10">
            这一周还没有安排。
          </p>
        )}

        {/* 按 SOP 框架分组的任务行 */}
        <div className="space-y-5">
          {sections.map((sec) => (
            <div key={sec.key}>
              {/* 大框架标题，如「工作日」「周末」 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold tracking-[0.15em] text-ink-soft bg-canvas border border-stroke/50 px-2.5 py-1 rounded-full flex-shrink-0">
                  {sec.name}
                </span>
                <span className="flex-1 h-px bg-stroke/40" />
                <span className="text-[11px] text-ink-faint flex-shrink-0">{sec.rows.length} 项</span>
              </div>
              <div className="space-y-2.5">
                {sec.rows.map((row) => (
                  <div key={row.key} className="grid week-grid items-center">
                    {/* 任务名：点击查看详情（取今天或本周第一个实例）；右侧 × 删除单个任务 */}
                    <div className="relative flex items-center gap-1 min-w-0 pr-1">
                      <button
                        onClick={() => {
                          const pick = row.perDay.get(today) || row.perDay.get(days[0]) || [...row.perDay.values()][0];
                          if (pick) openDetail(pick);
                        }}
                        className="text-left text-[13px] sm:text-sm text-ink truncate min-w-0 flex items-center gap-1.5 flex-1"
                        title={row.title}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CELL_COLORS[row.color].fill }}
                        />
                        <span className="truncate">{row.title}</span>
                      </button>
                      <DifficultyBadge difficulty={rowAnyInstance(row)?.difficulty} />
                      <WeekRowDeleteButton perDay={row.perDay} days={days} title={row.title} />
                    </div>
                    {days.map((d) => {
                      const inst = row.perDay.get(d);
                      const c = CELL_COLORS[row.color];
                      let cell: Record<string, string> = {};
                      let title = row.title;
                      if (!inst) {
                        // 这一天没有该任务：留白
                        cell = {};
                      } else if (inst.status === 'done') {
                        cell = { backgroundColor: c.fill };
                        title = `${row.title} · 已完成，点击撤销`;
                      } else if (inst.status === 'skipped') {
                        cell = { border: '1.5px dashed ' + c.fill, opacity: 0.55 };
                        title = `${row.title} · 稍后再说，点击恢复`;
                      } else {
                        cell = { backgroundColor: c.soft };
                        title = `${row.title} · 点击完成`;
                      }
                      return (
                        <button
                          key={d}
                          onClick={(e) => {
                            if (!inst) return;
                            if (inst.status === 'skipped') {
                              app.restoreTask(inst.id);
                              return;
                            }
                            let x = e.clientX;
                            let y = e.clientY;
                            if (!x && !y) {
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              x = r.left + r.width / 2;
                              y = r.top + r.height / 2;
                            }
                            emitCelebrate(x, y, pointsForDifficulty(inst.difficulty));
                            app.toggleComplete(inst.id);
                          }}
                          disabled={!inst}
                          title={title}
                          className="week-cell focus:outline-none"
                          style={cell}
                          aria-label={title}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 温和的图例（非评价） */}
        {anyTask && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-5 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: CELL_COLORS[0].fill }} /> 已完成
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: CELL_COLORS[0].soft }} /> 待办
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded border border-dashed border-stroke" /> 稍后再说
            </span>
            <span>点击格子可以完成 / 撤销；点击星期几可去当天安排</span>
          </div>
        )}
      </div>

      <p className="text-xs text-ink-faint text-center mt-4">
        这只是记录的样子，不评判这一周过得好不好。
      </p>

      {/* 清空本周所有任务（两步确认） */}
      <div className="mt-4">
        <p className="text-xs text-ink-faint mb-2">只想删掉某一个任务？点任务行右侧的 × 即可，不影响其他任务。</p>
        {!clearAsk ? (
          <button
            onClick={() => setClearAsk(true)}
            className="text-sm text-ink-faint hover:text-[#b07a6e] underline-offset-2 hover:underline"
          >
            清空本周的全部任务
          </button>
        ) : (
          <div className="card p-3.5 space-y-2.5">
            <p className="text-sm text-ink-soft leading-relaxed">
              清空 {formatWeekRange(days[0], days[6])} 这一周的所有任务吗？
              <br />
              它们会先从本周消失；SOP 仍保留，其他周仍会按安排出现。
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setClearAsk(false)} className="btn-ghost">取消</button>
              <button
                onClick={async () => {
                  await app.clearInstancesForDates(days);
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

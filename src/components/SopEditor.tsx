import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { parseSopText } from '../lib/sopParser';
import type { RecurrenceRule, RecurrenceType, SopType, TimeOfDay, TaskDifficulty } from '../types';
import { nowLocalDate } from '../lib/dateUtils';
import { DIFFICULTY_ORDER, DIFFICULTY_LABEL } from '../lib/difficulty';

interface Props {
  onClose: () => void;
}

interface EditTask {
  id: string;
  title: string;
  scheduledTime: string;
  timeOfDay: TimeOfDay;
  durationMinutes: string;
  recType: RecurrenceType;
  recDays: number[];
  recDayOfMonth: string;
  lowEnergyPreferred: boolean;
  difficulty: TaskDifficulty;
  crossScope: boolean; // 跨框架：同时出现在工作日和周末
}

interface EditSop {
  name: string;
  type: SopType;
  customDays: number[];
  tasks: EditTask[];
}

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

function uid(p = 'e') {
  return `${p}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildRec(t: EditTask): RecurrenceRule {
  switch (t.recType) {
    case 'daily':
      return { type: 'daily' };
    case 'weekly':
      return { type: 'weekly', daysOfWeek: t.recDays.length ? t.recDays : [1] };
    case 'monthly':
      return { type: 'monthly', dayOfMonth: t.recDayOfMonth ? Number(t.recDayOfMonth) : undefined, skipIfNotExists: true };
    case 'custom':
      return { type: 'custom', interval: 1, unit: 'day', anchorDate: nowLocalDate() };
    case 'once':
      return { type: 'once', date: nowLocalDate() };
  }
}

function daysForType(type: SopType, custom: number[]): number[] {
  if (type === 'weekdays') return [1, 2, 3, 4, 5];
  if (type === 'weekends') return [0, 6];
  if (type === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  return custom.length ? custom : [1, 2, 3, 4, 5];
}

// 轻量推断：学习/工作/创作类任务默认「中等」，其余默认「简单」。用户可在预览里改。
const HARD_KEYWORDS = ['学', '英语', '读书', '看书', '阅读', '视频', '写作', '复盘', '工作', '练', '背', '论文', '备考'];
function inferDifficulty(title: string): TaskDifficulty {
  return HARD_KEYWORDS.some((k) => title.includes(k)) ? 'medium' : 'easy';
}

const DEFAULT_TASK: EditTask = {
  id: uid(),
  title: '',
  scheduledTime: '',
  timeOfDay: null,
  durationMinutes: '',
  recType: 'daily',
  recDays: [],
  recDayOfMonth: '',
  lowEnergyPreferred: false,
  difficulty: 'easy',
  crossScope: false,
};

export default function SopEditor({ onClose }: Props) {
  const app = useApp();
  const [mode, setMode] = useState<'nl' | 'manual'>('nl');
  const [text, setText] = useState('');
  const [sops, setSops] = useState<EditSop[]>([]);
  const [parsed, setParsed] = useState(false);

  const sample = `我的工作日安排：
早上7:00起床。
7:30洗漱。
8:00吃早餐。
8:30出门。
晚上19:00学习英语30分钟。
每天阅读15分钟。
睡前整理房间。

我的周末安排：
早上9:00起床。
10:00吃早餐。
下午打扫房间。
周六下午学习英语1小时。
每月最后一个周日整理财务。`;

  const runParse = () => {
    const parsedList = parseSopText(text || sample);
    const mapped: EditSop[] = parsedList.map((p) => ({
      name: p.name,
      type: p.type,
      customDays: p.daysOfWeek,
      tasks: p.tasks.map((t) => ({
        id: uid(),
        title: t.title,
        scheduledTime: t.scheduledTime ?? '',
        timeOfDay: t.timeOfDay,
        durationMinutes: t.durationMinutes != null ? String(t.durationMinutes) : '',
        recType: t.recurrence.type,
        recDays: t.recurrence.type === 'weekly' ? t.recurrence.daysOfWeek : [],
        recDayOfMonth: t.recurrence.type === 'monthly' && t.recurrence.dayOfMonth ? String(t.recurrence.dayOfMonth) : '',
        lowEnergyPreferred: false,
        difficulty: inferDifficulty(t.title),
        crossScope: false,
      })),
    }));
    setSops(mapped.length ? mapped : [blankSop()]);
    setParsed(true);
  };

  const startManual = () => {
    setSops([blankSop()]);
    setParsed(true);
    setMode('manual');
  };

  const addSop = () => setSops((s) => [...s, blankSop()]);

  const save = async () => {
    for (const sop of sops) {
      const valid = sop.tasks.filter((t) => t.title.trim());
      if (!valid.length && !sop.name.trim()) continue;
      const created = await app.createSop({
        name: sop.name.trim() || '未命名 SOP',
        type: sop.type,
        daysOfWeek: daysForType(sop.type, sop.customDays),
        enabled: true,
      });
          let order = 0;
      for (const t of valid) {
        await app.createTemplate({
          sopId: created.id,
          title: t.title.trim(),
          recurrence: buildRec(t),
          scheduledTime: t.scheduledTime || null,
          timeOfDay: t.timeOfDay,
          durationMinutes: t.durationMinutes ? Number(t.durationMinutes) : null,
          firstStep: null,
          notes: null,
          pinned: false,
          lowEnergyPreferred: t.lowEnergyPreferred,
          difficulty: t.difficulty,
          sortOrder: order++,
          enabled: true,
          crossScope: t.crossScope,
        });
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-2" onClick={onClose}>
      <div className="bg-canvas rounded-2xl shadow-soft w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-canvas z-10">
          <h2 className="text-lg font-semibold text-ink">创建 SOP</h2>
          <button onClick={onClose} className="text-ink-faint text-2xl leading-none px-2">×</button>
        </div>

        {!parsed ? (
          <div className="px-5 pb-6 space-y-4">
            <div className="flex gap-2">
              <button onClick={() => setMode('nl')} className={`px-4 py-2 rounded-full text-sm ${mode === 'nl' ? 'bg-teal text-white' : 'bg-white border border-stroke text-ink-soft'}`}>直接告诉我你的日常</button>
              <button onClick={startManual} className="px-4 py-2 rounded-full text-sm bg-white border border-stroke text-ink-soft hover:border-teal">手动添加</button>
            </div>
            <textarea
              className="input-base h-64 resize-none font-mono text-sm leading-relaxed"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={sample}
            />
            <p className="text-xs text-ink-faint">支持自然语言：时间（如 7:00 / 晚上）、时长（如 30分钟 / 1小时）、循环（每天 / 每周六 / 每月最后一个周日）。不确定的时间只会记为「时间段」，不会擅自定义精确时刻。</p>
            <div className="flex gap-2">
              <button onClick={runParse} className="btn-primary flex-1">解析并预览</button>
              <button onClick={onClose} className="btn-ghost">取消</button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-6 space-y-4 overflow-y-auto">
            {sops.map((sop, si) => (
              <div key={si} className="rounded-xl border border-[#efeae1] p-3 bg-white">
                <div className="flex gap-2 items-center mb-2">
                  <input className="input-base !py-1.5 flex-1" value={sop.name} onChange={(e) => updateSop(si, { name: e.target.value })} placeholder="SOP 名称" />
                  <select className="input-base !py-1.5 !w-32" value={sop.type} onChange={(e) => updateSop(si, { type: e.target.value as SopType })}>
                    <option value="weekdays">工作日</option>
                    <option value="weekends">周末</option>
                    <option value="daily">每日</option>
                    <option value="custom">自定义</option>
                    <option value="monthly">每月</option>
                  </select>
                </div>
                {sop.type === 'custom' && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {WEEKDAY_LABEL.map((w, i) => (
                      <button
                        key={i}
                        onClick={() => toggleCustomDay(si, i)}
                        className={`w-8 h-8 rounded-full text-xs ${sop.customDays.includes(i) ? 'bg-teal text-white' : 'bg-white border border-stroke text-ink-soft'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {sop.tasks.map((t, ti) => (
                    <TaskRow key={t.id} t={t} showCrossScope={sop.type === 'weekdays' || sop.type === 'weekends'} onChange={(patch) => updateTask(si, ti, patch)} onRemove={() => removeTask(si, ti)} />
                  ))}
                </div>
                <button onClick={() => addTask(si)} className="text-sm text-teal-deep mt-2 hover:underline">＋ 添加任务</button>
              </div>
            ))}
            <button onClick={addSop} className="text-sm text-teal-deep hover:underline">＋ 添加另一套 SOP</button>

            <div className="flex gap-2 pt-2 sticky bottom-0 bg-canvas">
              <button onClick={save} className="btn-primary flex-1">确认，帮我安排好</button>
              <button onClick={() => { setParsed(false); }} className="btn-ghost">返回</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function blankSop(): EditSop {
    return { name: '', type: 'weekdays', customDays: [1, 2, 3, 4, 5], tasks: [{ ...DEFAULT_TASK, id: uid() }] };
  }
  function updateSop(si: number, patch: Partial<EditSop>) {
    setSops((s) => s.map((x, i) => (i === si ? { ...x, ...patch } : x)));
  }
  function updateTask(si: number, ti: number, patch: Partial<EditTask>) {
    setSops((s) => s.map((x, i) => (i === si ? { ...x, tasks: x.tasks.map((t, j) => (j === ti ? { ...t, ...patch } : t)) } : x)));
  }
  function removeTask(si: number, ti: number) {
    setSops((s) => s.map((x, i) => (i === si ? { ...x, tasks: x.tasks.filter((_, j) => j !== ti) } : x)));
  }
  function addTask(si: number) {
    setSops((s) => s.map((x, i) => (i === si ? { ...x, tasks: [...x.tasks, { ...DEFAULT_TASK, id: uid() }] } : x)));
  }
  function toggleCustomDay(si: number, day: number) {
    setSops((s) => s.map((x, i) => (i === si ? { ...x, customDays: x.customDays.includes(day) ? x.customDays.filter((d) => d !== day) : [...x.customDays, day] } : x)));
  }
}

function TaskRow({ t, showCrossScope, onChange, onRemove }: { t: EditTask; showCrossScope: boolean; onChange: (p: Partial<EditTask>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg bg-canvas/60 border border-[#efeae1] p-2 space-y-1.5">
      <div className="flex gap-1.5">
        <input className="input-base !py-1 flex-1 text-sm" value={t.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="任务名称" />
        <button onClick={onRemove} className="text-ink-faint px-2 text-sm hover:text-[#b07a6e]">删除</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <input className="input-base !py-1 !w-28 text-sm" type="time" value={t.scheduledTime} onChange={(e) => onChange({ scheduledTime: e.target.value })} />
        <select className="input-base !py-1 !w-20 text-sm" value={t.recType} onChange={(e) => onChange({ recType: e.target.value as RecurrenceType })}>
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
          <option value="custom">自定义</option>
          <option value="once">单次</option>
        </select>
        <input className="input-base !py-1 !w-20 text-sm" inputMode="numeric" value={t.durationMinutes} onChange={(e) => onChange({ durationMinutes: e.target.value.replace(/\D/g, '') })} placeholder="时长分" />
        <select
          className="input-base !py-1 !w-20 text-sm"
          value={t.difficulty}
          onChange={(e) => onChange({ difficulty: e.target.value as TaskDifficulty })}
          title="难度（决定完成可得积分：简单1/中等3/困难5）"
        >
          {DIFFICULTY_ORDER.map((d) => (
            <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
          ))}
        </select>
        <select className="input-base !py-1 !w-20 text-sm" value={t.timeOfDay ?? ''} onChange={(e) => onChange({ timeOfDay: (e.target.value || null) as TimeOfDay })}>
          <option value="">时段-</option>
          <option value="morning">早上</option>
          <option value="afternoon">下午</option>
          <option value="evening">晚上</option>
        </select>
        <label className="flex items-center gap-1 text-xs text-ink-soft px-1">
          <input type="checkbox" checked={t.lowEnergyPreferred} onChange={(e) => onChange({ lowEnergyPreferred: e.target.checked })} />
          低能量优先
        </label>
        {showCrossScope && (
          <label className="flex items-center gap-1 text-xs text-ink-soft px-1" title="同时出现在工作日和周末两套框架里">
            <input type="checkbox" checked={t.crossScope} onChange={(e) => onChange({ crossScope: e.target.checked })} />
            工作日+周末
          </label>
        )}
      </div>
      {t.recType === 'weekly' && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_LABEL.map((w, i) => (
            <button
              key={i}
              onClick={() => onChange({ recDays: t.recDays.includes(i) ? t.recDays.filter((d) => d !== i) : [...t.recDays, i] })}
              className={`w-7 h-7 rounded-full text-xs ${t.recDays.includes(i) ? 'bg-teal text-white' : 'bg-white border border-stroke text-ink-soft'}`}
            >
              {w}
            </button>
          ))}
        </div>
      )}
      {t.recType === 'monthly' && (
        <input className="input-base !py-1 !w-28 text-sm" inputMode="numeric" value={t.recDayOfMonth} onChange={(e) => onChange({ recDayOfMonth: e.target.value.replace(/\D/g, '') })} placeholder="每月几号" />
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useApp } from '../store/AppContext';
import type { RecurrenceRule, RecurrenceType, TaskInstance, TaskDifficulty } from '../types';
import { formatFullDate, nowLocalDate } from '../lib/dateUtils';
import { DIFFICULTY_ORDER, DIFFICULTY_LABEL, DIFFICULTY_POINTS, difficultyOf } from '../lib/difficulty';

interface Props {
  instance: TaskInstance;
  onClose: () => void;
}

const WEEKDAY_LABEL = ['日', '一', '二', '三', '四', '五', '六'];

export default function TaskDetailDrawer({ instance, onClose }: Props) {
  const app = useApp();
  const isTemplateBased = !!instance.templateId;
  // 该模板被清空过的日期（只显示今天及以后，方便「从某天起重新出现」）
  const pausedDates = useMemo(() => {
    if (!instance.templateId) return [] as string[];
    const tpl = app.templates.find((t) => t.id === instance.templateId);
    const today = nowLocalDate();
    return (tpl?.pausedDates ?? []).filter((d) => d >= today).sort();
  }, [app.templates, instance.templateId]);
  const [title, setTitle] = useState(instance.title);
  const [localDate, setLocalDate] = useState(instance.localDate);
  const [scheduledTime, setScheduledTime] = useState(instance.scheduledTime ?? '');
  const [durationMinutes, setDurationMinutes] = useState(
    instance.durationMinutes != null ? String(instance.durationMinutes) : '',
  );
  const [firstStep, setFirstStep] = useState(instance.firstStep ?? '');
  const [notes, setNotes] = useState(instance.notes ?? '');
  const [pinned, setPinned] = useState(instance.pinned);
  const [lowEnergyPreferred, setLowEnergyPreferred] = useState(instance.lowEnergyPreferred);
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(difficultyOf(instance.difficulty));
  const [scope, setScope] = useState<'this' | 'future'>('this');

  // 跨框架（工作日/周末都出现）：仅当任务属于工作日或周末 SOP 时才有意义
  const tplOfInstance = instance.templateId
    ? app.templates.find((t) => t.id === instance.templateId)
    : undefined;
  const sopOfTpl = tplOfInstance?.sopId
    ? app.sops.find((s) => s.id === tplOfInstance.sopId)
    : undefined;
  const canCrossScope =
    isTemplateBased && !!sopOfTpl && (sopOfTpl.type === 'weekdays' || sopOfTpl.type === 'weekends');
  const [crossScope, setCrossScope] = useState<boolean>(!!tplOfInstance?.crossScope);

  // 循环类型（仅对模板任务在「未来」范围可改）
  const [recType, setRecType] = useState<RecurrenceType>(instance.recurrenceType);
  const [recDays, setRecDays] = useState<number[]>([]);
  const [recDayOfMonth, setRecDayOfMonth] = useState('');

  const buildRecurrence = (): RecurrenceRule => {
    switch (recType) {
      case 'once':
        return { type: 'once', date: localDate };
      case 'daily':
        return { type: 'daily' };
      case 'weekly':
        return { type: 'weekly', daysOfWeek: recDays.length ? recDays : [1] };
      case 'monthly':
        return {
          type: 'monthly',
          dayOfMonth: recDayOfMonth ? Number(recDayOfMonth) : undefined,
          skipIfNotExists: true,
        };
      case 'custom':
        return { type: 'custom', interval: 1, unit: 'day', anchorDate: localDate };
    }
  };

  const handleSave = async () => {
    const updated: TaskInstance = {
      ...instance,
      title: title.trim() || instance.title,
      localDate,
      scheduledTime: scheduledTime || null,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      firstStep: firstStep.trim() || null,
      notes: notes.trim() || null,
      pinned,
      lowEnergyPreferred,
      difficulty,
      crossScope,
    };
    await app.updateInstance(updated, isTemplateBased ? scope : 'this');
    // 若选择了未来范围且修改了循环 / 难度，同步到模板（影响以后每一天）
    if (isTemplateBased && scope === 'future') {
      const tpl = app.templates.find((t) => t.id === instance.templateId);
      if (tpl) {
        // 难度已在选择时立刻保存（setTaskDifficulty），这里只同步循环规则
        if (recType !== instance.recurrenceType) {
          await app.updateTemplate({ ...tpl, recurrence: buildRecurrence() });
        }
      }
    }
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm('确定删除这个任务吗？')) return;
    await app.deleteInstance(instance.id, isTemplateBased ? scope : 'this');
    onClose();
  };

  const handleSkip = async () => {
    await app.skipTask(instance.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center bg-black/30" onClick={onClose}>
      <div
        className="drawer-up bg-canvas w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-soft max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2 flex items-center justify-between sticky top-0 bg-canvas z-10">
          <h2 className="text-lg font-semibold text-ink">任务详情</h2>
          <button onClick={onClose} className="text-ink-faint text-2xl leading-none px-2">×</button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          <div>
            <label className="text-xs text-ink-faint">任务名称</label>
            <input className="input-base mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-faint">日期</label>
              <input type="date" className="input-base mt-1" value={localDate} onChange={(e) => setLocalDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-ink-faint">时间（可留空）</label>
              <input type="time" className="input-base mt-1" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-faint">预计时长（分钟）</label>
              <input className="input-base mt-1" inputMode="numeric" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value.replace(/\D/g, ''))} placeholder="可选" />
            </div>
            <div>
              <label className="text-xs text-ink-faint">循环（{recLabel(instance.recurrenceType)}）</label>
              {isTemplateBased ? (
                <select
                  className="input-base mt-1"
                  value={recType}
                  onChange={(e) => setRecType(e.target.value as RecurrenceType)}
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                  <option value="custom">自定义</option>
                  <option value="once">单次</option>
                </select>
              ) : (
                <input className="input-base mt-1" value="单次（一次性）" disabled />
              )}
            </div>
          </div>

          {recType === 'weekly' && (
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABEL.map((w, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setRecDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))
                  }
                  className={`w-9 h-9 rounded-full text-sm border ${
                    recDays.includes(i) ? 'bg-teal text-white border-teal' : 'border-stroke text-ink-soft'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          )}
          {recType === 'monthly' && (
            <div>
              <label className="text-xs text-ink-faint">每月几号（留空表示按星期）</label>
              <input className="input-base mt-1" inputMode="numeric" value={recDayOfMonth} onChange={(e) => setRecDayOfMonth(e.target.value.replace(/\D/g, ''))} placeholder="如 15" />
            </div>
          )}

          <div>
            <label className="text-xs text-ink-faint">最容易开始的第一步</label>
            <input className="input-base mt-1" value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="例如：打开书" />
          </div>

          <div>
            <label className="text-xs text-ink-faint">备注</label>
            <textarea className="input-base mt-1 h-20 resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-ink-soft">今天优先做（置顶）</span>
            <button
              onClick={() => setPinned((p) => !p)}
              className={`w-12 h-7 rounded-full transition ${pinned ? 'bg-teal' : 'bg-stroke'}`}
            >
              <span className={`block w-5 h-5 rounded-full bg-white transition ${pinned ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-ink-soft">低能量模式优先显示</span>
            <button
              onClick={() => setLowEnergyPreferred((p) => !p)}
              className={`w-12 h-7 rounded-full transition ${lowEnergyPreferred ? 'bg-teal' : 'bg-stroke'}`}
            >
              <span className={`block w-5 h-5 rounded-full bg-white transition ${lowEnergyPreferred ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {canCrossScope && (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-ink-soft">同时出现在工作日和周末</span>
              <button
                onClick={() => {
                  const next = !crossScope;
                  setCrossScope(next);
                  if (instance.templateId) void app.setCrossScope(instance.templateId, next);
                }}
                className={`w-12 h-7 rounded-full transition ${crossScope ? 'bg-teal' : 'bg-stroke'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white transition ${crossScope ? 'translate-x-6' : 'translate-x-1'}`} />
                <span className="sr-only">切换跨框架</span>
              </button>
            </div>
          )}
          {canCrossScope && (
            <p className="text-[11px] text-ink-faint -mt-1 mb-1">
              打开后，这个任务会同时出现在「工作日 SOP」和「周末 SOP」两套里，只需记一次。
            </p>
          )}

          <div className="py-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-ink-soft">难度（完成可得积分）</span>
              <span className="text-xs text-ink-faint">
                {DIFFICULTY_LABEL[difficulty]} +{DIFFICULTY_POINTS[difficulty]}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {DIFFICULTY_ORDER.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDifficulty(d);
                    // 立刻生效并保存（不用再点「保存」），同时同步到以后每一天
                    void app.setTaskDifficulty(instance.id, d);
                  }}
                  className={`py-2 rounded-lg text-sm transition ${
                    difficulty === d
                      ? 'bg-teal text-white font-medium'
                      : 'bg-white border border-stroke text-ink-soft hover:border-teal'
                  }`}
                >
                  {DIFFICULTY_LABEL[d]}
                  <span className="block text-[10px] opacity-80 mt-0.5">
                    {d === 'easy' ? '1 分' : d === 'medium' ? '3 分' : '5 分'}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-faint mt-1.5">点一下就生效，以后每一天都按这个分数算。</p>
          </div>

          {isTemplateBased && (
            <div className="bg-lilac-soft/60 rounded-xl p-3">
              <p className="text-xs text-ink-soft mb-2">修改范围（不会影响已完成的过去记录）：</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setScope('this')}
                  className={`flex-1 py-2 rounded-lg text-sm ${scope === 'this' ? 'bg-teal text-white' : 'bg-white text-ink-soft border border-stroke'}`}
                >
                  只修改这一天
                </button>
                <button
                  onClick={() => setScope('future')}
                  className={`flex-1 py-2 rounded-lg text-sm ${scope === 'future' ? 'bg-teal text-white' : 'bg-white text-ink-soft border border-stroke'}`}
                >
                  今天及以后
                </button>
              </div>
            </div>
          )}

          {isTemplateBased && pausedDates.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3">
              <p className="text-xs text-ink-soft mb-2">
                之前清空的某天（点一下，就能让它在那天重新出现）：
              </p>
              <div className="flex flex-wrap gap-2">
                {pausedDates.map((d) => (
                  <button
                    key={d}
                    onClick={async () => { await app.unpauseTemplateDates(instance.templateId!, [d]); }}
                    className="px-3 py-1.5 rounded-full bg-white border border-amber-200 text-xs text-ink-soft hover:border-teal hover:text-teal-deep"
                  >
                    {formatFullDate(d)} · 恢复
                  </button>
                ))}
              </div>
              <button
                onClick={async () => { await app.unpauseTemplateDates(instance.templateId!, pausedDates); }}
                className="mt-2 text-xs text-teal-deep hover:underline"
              >
                全部恢复
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} className="btn-primary flex-1">保存</button>
            <button onClick={handleSkip} className="btn-ghost">跳过这次</button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="btn-ghost flex-1 text-[#b07a6e] border-[#e6cfc8] hover:border-[#d9b3a8]">
              删除{isTemplateBased ? '（按范围）' : ''}
            </button>
          </div>
          <p className="text-center text-xs text-ink-faint pt-1">
            来自：{instance.sopName ?? '一次性任务'} · {formatFullDate(instance.localDate)}
          </p>
        </div>
      </div>
    </div>
  );
}

function recLabel(t: RecurrenceType): string {
  return { once: '单次', daily: '每天', weekly: '每周', monthly: '每月', custom: '自定义' }[t];
}

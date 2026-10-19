import { useState } from 'react';
import { useApp } from '../store/AppContext';
import type { RecurrenceRule, RecurrenceType } from '../types';

interface Props {
  defaultDate: string;
  onClose: () => void;
  /** 'habit'：以「习惯」方式新建——默认每天出现、专属文案 */
  preset?: 'habit';
}

const REC_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'once', label: '仅这一次' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'custom', label: '自定义' },
];

export default function QuickAdd({ defaultDate, onClose, preset }: Props) {
  const app = useApp();
  const [title, setTitle] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [recType, setRecType] = useState<RecurrenceType>(preset === 'habit' ? 'daily' : 'once');
  const [duration, setDuration] = useState('');
  const [firstStep, setFirstStep] = useState('');
  const [notes, setNotes] = useState('');
  const [lowEnergyPreferred, setLowEnergyPreferred] = useState(false);

  const buildRecurrence = (): RecurrenceRule => {
    switch (recType) {
      case 'once':
        return { type: 'once', date };
      case 'daily':
        return { type: 'daily' };
      case 'weekly':
        return { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5, 6, 0] };
      case 'monthly':
        return { type: 'monthly', skipIfNotExists: true };
      case 'custom':
        return { type: 'custom', interval: 1, unit: 'day', anchorDate: date };
    }
  };

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    const recurrence = buildRecurrence();
    await app.quickAdd({
      title: t,
      localDate: date,
      scheduledTime: time || null,
      recurrence: recType === 'once' ? undefined : recurrence,
      durationMinutes: duration ? Number(duration) : null,
      firstStep: firstStep.trim() || null,
      notes: notes.trim() || null,
      lowEnergyPreferred,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center bg-black/30" onClick={onClose}>
      <div
        className="drawer-up bg-canvas w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{preset === 'habit' ? '养成一个习惯 🌱' : '想做什么？'}</h2>
          <button onClick={onClose} className="text-ink-faint text-2xl leading-none px-2">×</button>
        </div>
        <div className="px-5 pb-6 space-y-3">
          <input
            autoFocus
            className="input-base text-base"
            placeholder={preset === 'habit' ? '例如：喝一杯温水' : '例如：买牛奶'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) save();
            }}
          />
          <p className="text-xs text-ink-faint">
            {preset === 'habit'
              ? '默认「每天」出现，慢慢养成就好；想改频率点下面「更多设置」。'
              : '按回车即可保存为「' + (recType === 'once' ? '单次' : '循环') + '」任务。'}
          </p>

          <button
            onClick={() => setAdvanced((a) => !a)}
            className="text-sm text-teal-deep underline-offset-2 hover:underline"
          >
            {advanced ? '收起高级选项' : '更多设置（时间 / 重复 / 备注）'}
          </button>

          {advanced && (
            <div className="space-y-3 pt-1 animate-fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-faint">日期</label>
                  <input type="date" className="input-base mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-ink-faint">时间（可留空）</label>
                  <input type="time" className="input-base mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-faint">重复规则</label>
                <select className="input-base mt-1" value={recType} onChange={(e) => setRecType(e.target.value as RecurrenceType)}>
                  {REC_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-faint">预计时长（分钟）</label>
                  <input className="input-base mt-1" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} placeholder="可选" />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    <input type="checkbox" checked={lowEnergyPreferred} onChange={(e) => setLowEnergyPreferred(e.target.checked)} />
                    低能量优先
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-faint">第一步行动</label>
                <input className="input-base mt-1" value={firstStep} onChange={(e) => setFirstStep(e.target.value)} placeholder="例如：打开购物 App" />
              </div>
              <div>
                <label className="text-xs text-ink-faint">备注</label>
                <textarea className="input-base mt-1 h-16 resize-none" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">保存</button>
            <button onClick={onClose} className="btn-ghost">取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../store/AppContext';
import type { TaskInstance } from '../types';

/**
 * 单个任务删除按钮（用于今日页的每个任务卡片）。
 * - 一次性任务：点 × → 确认「删除」这一个。
 * - 循环任务：点 × → 可「只删这次」（仅移除当天这一次，未来照常）或「连同以后」（整个日常任务都移除）。
 * 两步确认，避免误删；不评价、不惩罚。
 *
 * 窄卡片（如时间轴卡片）用 popover 模式：确认气泡浮在卡片下方，不挤占原本布局。
 */
export function SingleDeleteButton({
  instance,
  popover = false,
}: {
  instance: TaskInstance;
  popover?: boolean;
}) {
  const app = useApp();
  const [ask, setAsk] = useState(false);
  const recurring = !!instance.templateId;
  const title = instance.title;

  const trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setAsk(true);
      }}
      title="删除这一个任务"
      aria-label="删除这一个任务"
      className="flex-shrink-0 w-6 h-6 rounded-full text-ink-faint hover:text-[#b07a6e] hover:bg-[#f3e7e2] text-base leading-none flex items-center justify-center"
    >
      ×
    </button>
  );

  if (!ask) return trigger;

  if (popover) {
    return (
      <div className="absolute right-0 top-full mt-1 z-30 card p-3 space-y-2 w-44">
        <p className="text-xs text-ink-soft leading-relaxed">删除「{title}」？</p>
        <button
          type="button"
          onClick={async () => {
            await app.deleteInstance(instance.id, 'this');
            setAsk(false);
          }}
          className="btn-ghost w-full text-sm"
        >
          删除今天
        </button>
        {recurring && (
          <button
            type="button"
            onClick={async () => {
              await app.deleteInstance(instance.id, 'future');
              setAsk(false);
            }}
            className="btn-danger w-full text-sm"
          >
            删除以后所有日程
          </button>
        )}
        <button type="button" onClick={() => setAsk(false)} className="btn-ghost w-full text-sm">
          取消
        </button>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-ink-faint">删?</span>
      <button
        type="button"
        onClick={async () => {
          await app.deleteInstance(instance.id, 'this');
          setAsk(false);
        }}
        className="px-2 py-0.5 rounded-full bg-white border border-stroke text-ink-soft hover:border-[#d9b3a8]"
      >
        删除今天
      </button>
      {recurring && (
        <button
          type="button"
          onClick={async () => {
            await app.deleteInstance(instance.id, 'future');
            setAsk(false);
          }}
          className="px-2 py-0.5 rounded-full bg-white border border-[#e6cfc8] text-[#b07a6e] hover:bg-[#f3e7e2]"
        >
          删除以后所有日程
        </button>
      )}
      <button
        type="button"
        onClick={() => setAsk(false)}
        className="text-ink-faint px-1"
        aria-label="取消"
      >
        ✕
      </button>
    </span>
  );
}

/**
 * 本周页「任务行」删除按钮（位于每行标题右侧）。
 * 一行 = 一个重复任务（跨 7 天）。删除可选：
 * - 只删本周这几天（保留未来周，仅移除本周可见的几次）
 * - 删掉整个日常（含以后）：移除该循环任务本体与未来安排
 * 一次性任务则直接删除那一个。
 */
export function WeekRowDeleteButton({
  perDay,
  days,
  title,
}: {
  perDay: Map<string, TaskInstance>;
  days: string[];
  title: string;
}) {
  const app = useApp();
  const [ask, setAsk] = useState(false);
  const visible = days.map((d) => perDay.get(d)).filter(Boolean) as TaskInstance[];
  const first = visible[0];
  const recurring = !!first?.templateId;

  if (!ask) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAsk(true);
        }}
        title="删除这个任务"
        aria-label="删除这个任务"
        className="flex-shrink-0 w-5 h-5 rounded-full text-ink-faint hover:text-[#b07a6e] hover:bg-[#f3e7e2] text-sm leading-none flex items-center justify-center"
      >
        ×
      </button>
    );
  }

  return (
    <div className="absolute left-0 top-full mt-1 z-30 card p-3 space-y-2 w-52">
      <p className="text-xs text-ink-soft leading-relaxed">删除「{title}」？</p>
      {recurring ? (
        <>
          <button
            type="button"
            onClick={async () => {
              await Promise.all(visible.map((i) => app.deleteInstance(i.id, 'this')));
              setAsk(false);
            }}
            className="btn-ghost w-full text-sm"
          >
            只删本周这几天
          </button>
          <button
            type="button"
            onClick={async () => {
              await app.deleteInstance(first!.id, 'future');
              setAsk(false);
            }}
            className="btn-danger w-full text-sm"
          >
            删除以后所有日程
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={async () => {
            await app.deleteInstance(first!.id, 'this');
            setAsk(false);
          }}
          className="btn-danger w-full text-sm"
        >
          删除
        </button>
      )}
      <button type="button" onClick={() => setAsk(false)} className="btn-ghost w-full text-sm">
        取消
      </button>
    </div>
  );
}

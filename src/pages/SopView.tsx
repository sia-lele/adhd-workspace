import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import type { RecurrenceRule, RecurrenceType, Sop, TaskTemplate, TaskDifficulty } from '../types';
import SopEditor from '../components/SopEditor';
import { useVerticalDragSort } from '../lib/useVerticalDragSort';
import { DIFFICULTY_ORDER, DIFFICULTY_LABEL } from '../lib/difficulty';
import DifficultyBadge from '../components/DifficultyBadge';

const TYPE_LABEL: Record<Sop['type'], string> = {
  weekdays: '工作日',
  weekends: '周末',
  daily: '每日',
  custom: '自定义',
  monthly: '每月',
};

/** 卡片浮层（拖动时跟随手指的影子） */
function SopGhost({ name, type, count, top, left, width, height }: { name: string; type: Sop['type']; count: number; top: number; left: number; width: number; height: number }) {
  return (
    <div
      className="fixed z-50 card p-4 shadow-xl"
      style={{ top, left, width, height, transform: 'scale(1.02) rotate(-1deg)', pointerEvents: 'none', opacity: 0.96 }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2.5 h-2.5 rounded-full bg-sage flex-shrink-0" />
        <span className="font-semibold text-ink truncate">{name}</span>
        <span className="text-xs text-ink-faint bg-canvas px-2 py-0.5 rounded-full flex-shrink-0">{TYPE_LABEL[type]}</span>
        <span className="text-xs text-ink-faint flex-shrink-0">{count} 项</span>
      </div>
    </div>
  );
}

export default function SopView() {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTask, setNewTask] = useState({ title: '', time: '', rec: 'daily' as RecurrenceType, duration: '', low: false, diff: 'easy' as TaskDifficulty });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  // ---- 长按拖动排序相关 ----
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // 展开 SOP 后，内部小任务行的长按拖动排序
  const taskRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendRef = useRef<{ x: number; y: number; timer: number; id: string } | null>(null);
  const dragRef = useRef<{ id: string; startY: number; baseOrder: string[]; startRect: DOMRect; dy: number } | null>(null);
  const previewRef = useRef<string[] | null>(null);
  const didDrag = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [ghost, setGhost] = useState<{ top: number; left: number; width: number; height: number; id: string } | null>(null);

  const tasksBySop = useMemo(() => {
    const m: Record<string, TaskTemplate[]> = {};
    for (const t of app.templates) {
      if (!t.sopId) continue;
      (m[t.sopId] ??= []).push(t);
    }
    for (const k in m) m[k].sort((a, b) => a.sortOrder - b.sortOrder);
    return m;
  }, [app.templates]);

  // 展开 SOP 内小任务的长按拖动排序
  const expandedTasks = expanded ? tasksBySop[expanded] ?? [] : [];
  const {
    draggingId: draggingTaskId,
    preview: taskPreview,
    ghost: taskGhost,
    didDrag: taskDidDrag,
    beginPress: beginTaskPress,
  } = useVerticalDragSort({
    ids: expandedTasks.map((t) => t.id),
    getItemEl: (id) => taskRefs.current.get(id) ?? null,
    onReorder: (ordered) => expanded && app.reorderTemplates(expanded, ordered),
  });

  // 完成一次拖动后，把最新顺序写回状态/数据库
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      d.dy = dy;
      let idx = 0;
      for (const id of d.baseOrder) {
        if (id === d.id) continue;
        const r = cardRefs.current.get(id)?.getBoundingClientRect();
        if (r && e.clientY > r.top + r.height / 2) idx++;
      }
      const base = d.baseOrder.filter((x) => x !== d.id);
      const prev = [...base];
      prev.splice(idx, 0, d.id);
      previewRef.current = prev;
      setPreview(prev);
      setGhost((g) => (g ? { ...g, top: d.startRect.top + dy } : g));
    };
    const onUp = () => {
      const d = dragRef.current;
      const p = previewRef.current;
      if (d && p && p.join() !== d.baseOrder.join()) {
        app.reorderSops(p);
      }
      dragRef.current = null;
      previewRef.current = null;
      setDragging(false);
      setDraggingId(null);
      setPreview(null);
      setGhost(null);
      setTimeout(() => { didDrag.current = false; }, 350);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const prevent = (ev: Event) => ev.preventDefault();
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('touchmove', prevent);
    };
  }, [dragging, app]);

  // 按下/移动/抬起的「准备」阶段：超过 420ms 才进入拖动，避免与点击、滚动冲突
  useEffect(() => {
    const up = () => {
      if (pendRef.current) {
        clearTimeout(pendRef.current.timer);
        pendRef.current = null;
      }
    };
    const move = (e: PointerEvent) => {
      if (!pendRef.current) return;
      const dx = e.clientX - pendRef.current.x;
      const dy = e.clientY - pendRef.current.y;
      if (Math.hypot(dx, dy) > 8) {
        clearTimeout(pendRef.current.timer);
        pendRef.current = null;
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('pointermove', move);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  const beginPress = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rect = cardRefs.current.get(id)?.getBoundingClientRect();
    if (!rect) return;
    const timer = window.setTimeout(() => {
      if (!pendRef.current || pendRef.current.id !== id) return;
      didDrag.current = true;
      dragRef.current = {
        id,
        startY: pendRef.current.y,
        baseOrder: app.sops.map((s) => s.id),
        startRect: rect,
        dy: 0,
      };
      previewRef.current = app.sops.map((s) => s.id);
      setDragging(true);
      setDraggingId(id);
      setPreview(app.sops.map((s) => s.id));
      setGhost({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, id });
    }, 420);
    pendRef.current = { x: e.clientX, y: e.clientY, timer, id };
  };

  const buildRec = (rec: RecurrenceType): RecurrenceRule => {
    if (rec === 'weekly') return { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5, 6, 0] };
    if (rec === 'monthly') return { type: 'monthly', skipIfNotExists: true };
    if (rec === 'custom') return { type: 'custom', interval: 1, unit: 'day', anchorDate: new Date().toISOString().slice(0, 10) };
    return { type: 'daily' };
  };

  const handleAdd = async (sopId: string) => {
    if (!newTask.title.trim()) return;
    await app.createTemplate({
      sopId,
      title: newTask.title.trim(),
      recurrence: buildRec(newTask.rec),
      scheduledTime: newTask.time || null,
      timeOfDay: null,
      durationMinutes: newTask.duration ? Number(newTask.duration) : null,
      firstStep: null,
      notes: null,
      pinned: false,
      lowEnergyPreferred: newTask.low,
      difficulty: newTask.diff,
      sortOrder: (tasksBySop[sopId]?.length ?? 0),
      enabled: true,
    });
    setNewTask({ title: '', time: '', rec: 'daily', duration: '', low: false, diff: 'easy' });
    setAddingTo(null);
  };

  // ---- SOP 改名 ----
  const startRename = (sop: Sop) => { setRenamingId(sop.id); setRenameVal(sop.name); };
  const saveRename = async (sop: Sop) => {
    const name = renameVal.trim();
    setRenamingId(null);
    if (!name || name === sop.name) return;
    await app.updateSop({ ...sop, name });
  };

  // 渲染顺序：拖动中按 preview，否则按 SOP 的 sortOrder
  const order = dragging && preview ? preview : app.sops.map((s) => s.id);

  return (
    <div className="animate-fade-in">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">我的 SOP</h1>
          <p className="text-sm text-ink-faint">设置一次，之后每天自动安排好。</p>
        </div>
        <button onClick={() => setEditing(true)} className="btn-primary text-sm">＋ 新建 SOP</button>
      </div>

      <p className="text-xs text-ink-faint mb-3 -mt-1">点开卡片可重命名、增删里面的小任务；长按卡片可上下拖动调整顺序；展开后，长按里面的小任务也能拖动排序。小任务的难度（完成得几分）在点开任务后的详情里改，点一下就生效。</p>

      {app.sops.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-ink-soft mb-4">还没有任何 SOP。</p>
          <button onClick={() => setEditing(true)} className="btn-primary">输入我的日常</button>
        </div>
      )}

      <div className="space-y-3">
        {order.map((sid) => {
          const sop = app.sops.find((s) => s.id === sid);
          if (!sop) return null;
          const tasks = tasksBySop[sop.id] ?? [];
          const isOpen = expanded === sop.id;
          const isGhost = dragging && draggingId === sop.id;
          return (
            <div key={sop.id} ref={(el) => { if (el) cardRefs.current.set(sop.id, el); }}>
              {/* 拖动时，原卡片位置用占位虚线框代替，浮层跟随手指 */}
              {isGhost ? (
                <div
                  className="rounded-2xl border-2 border-dashed border-[#d9cfc6] bg-[#faf6f1]"
                  style={{ height: ghost?.height ?? 64 }}
                />
              ) : (
                <div
                  className={`card p-4 select-none cursor-grab active:cursor-grabbing ${dragging ? 'transition-transform duration-200' : ''}`}
                  style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none' }}
                  onPointerDown={(e) => beginPress(e, sop.id)}
                  onClickCapture={(e) => { if (didDrag.current) { e.stopPropagation(); e.preventDefault(); } }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {renamingId === sop.id ? (
                        <input
                          className="input-base !py-1 flex-1 min-w-0 text-sm font-semibold"
                          value={renameVal}
                          autoFocus
                          onChange={(e) => setRenameVal(e.target.value)}
                          onBlur={() => saveRename(sop)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(sop);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                        />
                      ) : (
                        <button
                          onClick={() => { if (didDrag.current) return; setExpanded(isOpen ? null : sop.id); }}
                          className="flex items-center gap-2 min-w-0 flex-1"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sop.enabled ? 'bg-sage' : 'bg-stroke'}`} />
                          <span className="font-semibold text-ink truncate">{sop.name}</span>
                          <span className="text-xs text-ink-faint bg-canvas px-2 py-0.5 rounded-full flex-shrink-0">{TYPE_LABEL[sop.type]}</span>
                          <span className="text-xs text-ink-faint flex-shrink-0 ml-auto">{tasks.length} 项</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button onClick={() => app.toggleSop(sop.id)} className={`text-xs px-2.5 py-1 rounded-full border ${sop.enabled ? 'border-sage text-sage-deep bg-sage-soft' : 'border-stroke text-ink-faint'}`}>
                        {sop.enabled ? '已启用' : '已停用'}
                      </button>
                      <button onClick={() => startRename(sop)} className="text-xs text-ink-soft px-2 py-1 rounded-full hover:bg-canvas" title="重命名 SOP">改名</button>
                      <button onClick={() => app.duplicateSop(sop.id)} className="text-xs text-ink-soft px-2 py-1 rounded-full hover:bg-canvas" title="复制">复制</button>
                      <button onClick={() => { if (confirm(`删除 SOP「${sop.name}」及其未来安排？`)) app.deleteSop(sop.id); }} className="text-xs text-[#b07a6e] px-2 py-1 rounded-full hover:bg-canvas" title="删除">删除</button>
                    </div>
                  </div>

                  {isOpen && (() => {
                    // 拖动中按 preview 顺序，否则按模板 sortOrder
                    const taskMap = new Map(tasks.map((t) => [t.id, t]));
                    const taskOrderIds = draggingTaskId && taskPreview ? taskPreview : tasks.map((t) => t.id);
                    return (
                    <div className="mt-3 pt-3 border-t border-[#efeae1] space-y-1.5 animate-fade-in">
                      {taskOrderIds.map((tid) => {
                        const t = taskMap.get(tid);
                        if (!t) return null;
                        const isGhost = draggingTaskId === tid;
                        return (
                          <div
                            key={tid}
                            data-task-id={tid}
                            ref={(el) => { if (el) taskRefs.current.set(tid, el); else taskRefs.current.delete(tid); }}
                          >
                            {isGhost ? (
                              <div className="rounded-lg border-2 border-dashed border-[#d9cfc6] bg-[#faf6f1]" style={{ height: taskGhost?.height ?? 28 }} />
                            ) : (
                              <div
                                data-drag-handle="task"
                                className="flex items-center gap-2 text-sm select-none cursor-grab active:cursor-grabbing"
                                style={{ touchAction: 'none', WebkitTouchCallout: 'none', userSelect: 'none' }}
                                onPointerDown={(e) => { e.stopPropagation(); beginTaskPress(e, tid); }}
                                onClickCapture={(e) => { if (taskDidDrag.current) { e.stopPropagation(); e.preventDefault(); } }}
                                onContextMenu={(e) => e.preventDefault()}
                              >
                                <span className="text-ink-faint text-xs leading-none flex-shrink-0" title="长按可拖动排序">⠿</span>
                                <span className="w-1.5 h-1.5 rounded-full bg-stroke flex-shrink-0" />
                                <span className="flex-1 min-w-0 truncate text-ink">{t.title}</span>
                                {t.scheduledTime && <span className="text-ink-faint text-xs">{t.scheduledTime}</span>}
                                <DifficultyBadge difficulty={t.difficulty} />
                                {t.lowEnergyPreferred && <span className="text-[10px] text-sage-deep bg-sage-soft px-1.5 rounded">低能量</span>}
                                <button
                                  onClick={() => { if (confirm(`确定删除任务「${t.title}」？`)) app.deleteTemplate(t.id, 'future'); }}
                                  className="text-ink-faint text-base leading-none w-5 text-center hover:text-[#b07a6e] flex-shrink-0"
                                  title="删除这个任务"
                                >×</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {tasks.length === 0 && <p className="text-xs text-ink-faint">该 SOP 暂无任务。</p>}

                      {addingTo === sop.id ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <input className="input-base !py-1 !w-32 text-sm" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} placeholder="任务名称" />
                          <input className="input-base !py-1 !w-24 text-sm" type="time" value={newTask.time} onChange={(e) => setNewTask({ ...newTask, time: e.target.value })} />
                          <select className="input-base !py-1 !w-20 text-sm" value={newTask.rec} onChange={(e) => setNewTask({ ...newTask, rec: e.target.value as RecurrenceType })}>
                            <option value="daily">每天</option>
                            <option value="weekly">每周</option>
                            <option value="monthly">每月</option>
                            <option value="custom">自定义</option>
                          </select>
                          <select
                            className="input-base !py-1 !w-20 text-sm"
                            value={newTask.diff}
                            onChange={(e) => setNewTask({ ...newTask, diff: e.target.value as TaskDifficulty })}
                            title="难度（决定完成可得积分：简单1/中等3/困难5）"
                          >
                            {DIFFICULTY_ORDER.map((d) => (
                              <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
                            ))}
                          </select>
                          <button onClick={() => handleAdd(sop.id)} className="btn-primary !py-1 !px-3 text-sm">添加</button>
                          <button onClick={() => setAddingTo(null)} className="btn-ghost !py-1 !px-3 text-sm">取消</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingTo(sop.id); setNewTask({ title: '', time: '', rec: 'daily', duration: '', low: false }); }} className="text-sm text-teal-deep hover:underline pt-1">＋ 添加任务</button>
                      )}
                    </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editing && <SopEditor onClose={() => setEditing(false)} />}

      {ghost && draggingId && (
        <SopGhost
          name={app.sops.find((s) => s.id === ghost.id)?.name ?? ''}
          type={app.sops.find((s) => s.id === ghost.id)?.type ?? 'daily'}
          count={tasksBySop[ghost.id]?.length ?? 0}
          top={ghost.top}
          left={ghost.left}
          width={ghost.width}
          height={ghost.height}
        />
      )}

      {/* SOP 内小任务拖动时的浮层 */}
      {taskGhost && draggingTaskId && (
        <div
          className="fixed z-50 px-3 py-2 rounded-lg shadow-xl bg-white border border-[#efeae1] text-sm"
          style={{ top: taskGhost.top, left: taskGhost.left, width: taskGhost.width, transform: 'scale(1.02) rotate(-1deg)', pointerEvents: 'none', opacity: 0.96 }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-stroke flex-shrink-0" />
            <span className="truncate text-ink">{tasksBySop[expanded ?? '']?.find((t) => t.id === taskGhost.id)?.title ?? ''}</span>
          </span>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface GhostState {
  top: number;
  left: number;
  width: number;
  height: number;
  id: string;
}

interface Options {
  /** 当前顺序（id 数组） */
  ids: string[];
  /** 根据 id 取对应 DOM 元素（用于计算插入位置） */
  getItemEl: (id: string) => HTMLElement | null;
  /** 顺序变化后回调（仅在松手且顺序改变时触发） */
  onReorder: (orderedIds: string[]) => void;
  /** 长按触发阈值（ms） */
  durationMs?: number;
  /** 是否启用（如未展开时关闭） */
  enabled?: boolean;
}

/**
 * 通用「长按后上下拖动排序」逻辑（与 SOP 卡片交互一致）：
 * - 长按 durationMs 后进入拖动，原位置留虚线占位，浮层跟随手指；
 * - 抬手时若顺序变化，调用 onReorder；
 * - 返回 didDrag（ref）用于阻止误触点击，以及 beginPress（挂到每行 onPointerDown）。
 */
export function useVerticalDragSort({
  ids,
  getItemEl,
  onReorder,
  durationMs = 420,
  enabled = true,
}: Options) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);

  const didDrag = useRef(false);
  const pendRef = useRef<{ x: number; y: number; timer: number; id: string } | null>(null);
  const dragRef = useRef<{ id: string; startY: number; baseOrder: string[]; startRect: DOMRect; dy: number } | null>(null);
  const previewRef = useRef<string[] | null>(null);

  // 用 ref 保存最新值，避免 effect 频繁重建
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const getItemElRef = useRef(getItemEl);
  getItemElRef.current = getItemEl;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  // 准备阶段：超过阈值才进入拖动；移动超过 8px 取消
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  const beginPress = useCallback(
    (e: ReactPointerEvent, id: string) => {
      if (!enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = getItemElRef.current(id);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const timer = window.setTimeout(() => {
        if (!pendRef.current || pendRef.current.id !== id) return;
        didDrag.current = true;
        dragRef.current = {
          id,
          startY: pendRef.current.y,
          baseOrder: idsRef.current.slice(),
          startRect: rect,
          dy: 0,
        };
        previewRef.current = idsRef.current.slice();
        setDraggingId(id);
        setPreview(idsRef.current.slice());
        setGhost({ top: rect.top, left: rect.left, width: rect.width, height: rect.height, id });
      }, durationMs);
      pendRef.current = { x: e.clientX, y: e.clientY, timer, id };
    },
    [enabled, durationMs],
  );

  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      d.dy = dy;
      let idx = 0;
      for (const id of d.baseOrder) {
        if (id === d.id) continue;
        const r = getItemElRef.current(id)?.getBoundingClientRect();
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
        onReorderRef.current(p);
      }
      dragRef.current = null;
      previewRef.current = null;
      setDraggingId(null);
      setPreview(null);
      setGhost(null);
      setTimeout(() => {
        didDrag.current = false;
      }, 350);
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
  }, [draggingId]);

  return { draggingId, preview, ghost, didDrag, beginPress };
}

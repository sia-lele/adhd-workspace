// ============================================================
// 全局状态管理
// 负责：数据加载、任务生成触发、所有真实交互动作、IndexedDB 持久化
// ============================================================

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type {
  Sop,
  TaskTemplate,
  TaskInstance,
  UserPreferences,
  LowEnergyState,
  RecurrenceRule,
  PointsState,
  PointEvent,
  Prize,
  TaskDifficulty,
} from '../types';
import {
  sopDB,
  templateDB,
  instanceDB,
  prefsDB,
  lowEnergyDB,
  pointsDB,
  exportAll,
  importAll,
} from '../db/database';
import {
  ensureInstancesForDates,
  makeOneOffInstance,
} from '../lib/taskGenerator';
import { parseSopText, ParsedSop } from '../lib/sopParser';
import { nowLocalDate, addDays, isWeekday, isWeekend } from '../lib/dateUtils';
import { pointsForDifficulty } from '../lib/difficulty';

function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_PREFS: UserPreferences = {
  id: 'prefs',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
  weekStartsOn: 1,
  theme: 'light',
  reducedMotion: false,
  notificationsEnabled: false,
  soundEnabled: false,
  lowEnergyDefaultOff: true,
};

const DEFAULT_POINTS: PointsState = {
  id: 'main',
  total: 0,
  earned: 0,
  hardEarned: 0,
  targetPrizeId: null,
  prizes: [],
  history: [],
};

/** 归一化历史积分数据：补齐新增字段，兼容旧版（无 hardEarned/targetPrizeId） */
function normalizePoints(p: PointsState | null | undefined): PointsState {
  if (!p) return { ...DEFAULT_POINTS };
  return {
    ...p,
    hardEarned: p.hardEarned ?? 0,
    targetPrizeId: p.targetPrizeId ?? null,
  };
}

interface AppState {
  ready: boolean;
  sops: Sop[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
  prefs: UserPreferences;
  lowEnergy: LowEnergyState[];
  points: PointsState;
  onboarded: boolean;
}

interface EditScope {
  scope: 'this' | 'future';
}

interface AppActions {
  ready: boolean;
  sops: Sop[];
  templates: TaskTemplate[];
  instances: TaskInstance[];
  prefs: UserPreferences;
  lowEnergy: LowEnergyState[];
  points: PointsState;
  onboarded: boolean;
  // 数据加载
  ensureDates: (dates: string[]) => Promise<void>;
  // 任务实例操作
  toggleComplete: (instanceId: string) => Promise<void>;
  skipTask: (instanceId: string) => Promise<void>;
  restoreTask: (instanceId: string) => Promise<void>;
  deleteInstance: (instanceId: string, scope: EditScope['scope']) => Promise<void>;
  clearInstancesForDates: (dates: string[]) => Promise<void>;
  updateInstance: (instance: TaskInstance, scope: EditScope['scope']) => Promise<void>;
  moveInstance: (instanceId: string, newDate: string) => Promise<void>;
  // 模板操作
  createTemplate: (t: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTemplate: (t: TaskTemplate) => Promise<void>;
  setCrossScope: (templateId: string, value: boolean) => Promise<void>;
  deleteTemplate: (templateId: string, scope: EditScope['scope']) => Promise<void>;
  // SOP 操作
  createSopFromText: (text: string) => Promise<number>;
  createSop: (sop: Omit<Sop, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Sop>;
  updateSop: (sop: Sop) => Promise<void>;
  deleteSop: (sopId: string) => Promise<void>;
  duplicateSop: (sopId: string) => Promise<void>;
  toggleSop: (sopId: string) => Promise<void>;
  reorderSops: (orderedIds: string[]) => Promise<void>;
  // SOP 内小任务排序（长按拖动）
  reorderTemplates: (sopId: string, orderedIds: string[]) => Promise<void>;
  // 恢复被清空/删除的某天：从模板 pausedDates 移除并重新生成那天实例
  unpauseTemplateDates: (templateId: string, dates: string[]) => Promise<void>;
  // 设置难度：点一下立刻生效，并同步到模板及「今天及以后」未完成的所有实例
  setTaskDifficulty: (instanceId: string, difficulty: TaskDifficulty) => Promise<void>;
  // 快速添加
  quickAdd: (input: {
    title: string;
    localDate: string;
    scheduledTime?: string | null;
    recurrence?: RecurrenceRule;
    durationMinutes?: number | null;
    firstStep?: string | null;
    notes?: string | null;
    pinned?: boolean;
    lowEnergyPreferred?: boolean;
    difficulty?: TaskDifficulty;
  }) => Promise<void>;
  // 低能量模式
  getLowEnergy: (date: string) => LowEnergyState;
  setLowEnergy: (date: string, patch: Partial<LowEnergyState>) => Promise<void>;
  // 积分系统
  addPrize: (p: { title: string; cost: number; emoji?: string; note?: string | null; tier?: 'normal' | 'milestone'; hardRatioRequired?: number }) => Promise<void>;
  updatePrize: (prizeId: string, p: { title: string; cost: number; emoji?: string; tier?: 'normal' | 'milestone'; hardRatioRequired?: number }) => Promise<void>;
  removePrize: (prizeId: string) => Promise<void>;
  redeemPrize: (prizeId: string) => Promise<{ ok: boolean; reason?: string }>;
  // 设/取消当前正在攒的目标奖品（里程碑）
  setTargetPrize: (prizeId: string | null) => Promise<void>;
  // 撤回某条加分记录：把对应分数扣回（total、earned 同步），并从流水里移除该条
  withdrawEvent: (eventId: string) => Promise<void>;
  // 偏好 / 引导
  updatePrefs: (patch: Partial<UserPreferences>) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  // 备份
  exportData: () => Promise<string>;
  importData: (json: string) => Promise<void>;
}

const Ctx = createContext<AppActions | null>(null);

/** 按 sortOrder 升序排列 SOP（未设置的排最后，再按创建时间） */
function sortSops(sops: Sop[]): Sop[] {
  return [...sops].sort((a, b) => {
    const sa = a.sortOrder ?? Infinity;
    const sb = b.sortOrder ?? Infinity;
    if (sa !== sb) return sa - sb;
    return a.createdAt - b.createdAt;
  });
}

export function useApp(): AppActions {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp 必须在 AppProvider 内使用');
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    ready: false,
    sops: [],
    templates: [],
    instances: [],
    prefs: DEFAULT_PREFS,
    lowEnergy: [],
    points: DEFAULT_POINTS,
    onboarded: false,
  });

  // 始终持有最新 state 的引用，供异步动作在计算后立即（同步）拿到当前数据，
  // 避免把「实例更新 / 积分变更」赋值到 setState 的 updater 闭包里、却在 updater
  // 真正执行前就去 await 数据库写入（那样 updated/pointsUpdated 还是 null，写入被跳过，
  // 导致「界面显示已完成、刷新后却没打卡、积分却还在/被重复累加」的 bug）。
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- 初始化 ----
  useEffect(() => {
    (async () => {
      const [sops, templates, instances, prefs, lowEnergy, points] = await Promise.all([
        sopDB.all(),
        templateDB.all(),
        instanceDB.all(),
        prefsDB.get(),
        lowEnergyDB.all(),
        pointsDB.get(),
      ]);
      // 首次进入：确保未来/过去一段时间有实例（按需生成范围）
      const today = nowLocalDate();
      const buffer: string[] = [];
      for (let i = -7; i <= 60; i++) buffer.push(addDays(today, i));
      await ensureInstancesForDates(buffer);
      const freshInstances = await instanceDB.all();
      setState({
        ready: true,
        sops: sortSops(sops),
        templates,
        instances: freshInstances,
        prefs: prefs || DEFAULT_PREFS,
        lowEnergy,
        points: normalizePoints(points),
        onboarded: !!prefs?.id ? true : false, // 已有偏好视为已引导
      });
    })();
  }, []);

  // ---- 生成并加载指定日期 ----
  const ensureDates = useCallback(async (dates: string[]) => {
    await ensureInstancesForDates(dates);
    const fresh = await instanceDB.all();
    // 合并而非覆盖：优先保留内存中（用户刚操作的）状态，避免读库把刚完成的任务冲掉
    setState((s) => {
      const mem = new Map(s.instances.map((i) => [i.id, i]));
      const merged: TaskInstance[] = [];
      for (const f of fresh) merged.push(mem.get(f.id) ?? f);
      for (const i of s.instances) if (!mem.has(i.id)) merged.push(i);
      return { ...s, instances: merged };
    });
  }, []);

  // ---- 任务实例：完成 / 撤销（按难度加分：简单1/中等3/困难5；撤销按原额扣回，防止反复刷分）----
  const toggleComplete = useCallback(async (instanceId: string) => {
    const cur = stateRef.current;
    const it = cur.instances.find((x) => x.id === instanceId);
    if (!it) return; // 找不到实例直接返回，避免无效写入
    const now = Date.now();
    const done = it.status === 'done';
    const weight = pointsForDifficulty(it.difficulty);
    // 撤销时按「当时实际发放的分数」扣回，避免之后改过难度导致多扣/少扣
    const revoke = it.awardedPoints ?? weight;
    // 防御：若实例仍记为「已发放（awardedPoints 非空）」但状态被外部意外重置为 todo，
    // 则不再重复加分，避免刷新/重新打卡导致积分被重复累加
    const alreadyAwarded = !done && it.awardedPoints != null;
    const delta = done ? -revoke : alreadyAwarded ? 0 : weight;
    // 困难分：完成按当前难度记，撤销按当时实际发放的困难分扣回（中等/困难才计入）
    const hardPart = (it.difficulty === 'medium' || it.difficulty === 'hard') ? weight : 0;
    const hardDelta = done ? -(it.awardedHard ?? 0) : alreadyAwarded ? 0 : hardPart;
    const updated: TaskInstance = {
      ...it,
      status: done ? 'todo' : 'done',
      completedAt: done ? null : now,
      skippedAt: null,
      awardedPoints: done ? undefined : weight,
      awardedHard: done ? undefined : hardPart,
      updatedAt: now,
    };
    const ev: PointEvent = {
      id: uid('pe'),
      type: 'earn',
      amount: delta,
      reason: delta > 0
        ? `完成任务「${it.title}」+${delta}`
        : done
          ? `撤销完成「${it.title}」${delta}`
          : `完成任务「${it.title}」（已计分，不重复加分）`,
      at: Date.now(),
      hard: hardDelta > 0 ? hardDelta : 0,
    };
    const pointsUpdated: PointsState = {
      ...cur.points,
      total: Math.max(0, cur.points.total + delta),
      earned: Math.max(0, cur.points.earned + delta),
      hardEarned: Math.max(0, (cur.points.hardEarned ?? 0) + hardDelta),
      history: [ev, ...cur.points.history].slice(0, 300),
    };
    // 同步计算完成后再 setState 与写库，确保 updated / pointsUpdated 必然是有效值
    setState((s) => ({
      ...s,
      instances: s.instances.map((x) => (x.id === instanceId ? updated : x)),
      points: pointsUpdated,
    }));
    await instanceDB.put(updated);
    await pointsDB.put(pointsUpdated);
  }, []);

  const skipTask = useCallback(async (instanceId: string) => {
    const cur = stateRef.current;
    const it = cur.instances.find((x) => x.id === instanceId);
    if (!it) return;
    const updated: TaskInstance = { ...it, status: 'skipped', skippedAt: Date.now(), updatedAt: Date.now() };
    setState((s) => ({ ...s, instances: s.instances.map((x) => (x.id === instanceId ? updated : x)) }));
    await instanceDB.put(updated);
  }, []);

  const restoreTask = useCallback(async (instanceId: string) => {
    const cur = stateRef.current;
    const it = cur.instances.find((x) => x.id === instanceId);
    if (!it) return;
    const updated: TaskInstance = { ...it, status: 'todo', completedAt: null, skippedAt: null, updatedAt: Date.now() };
    setState((s) => ({ ...s, instances: s.instances.map((x) => (x.id === instanceId ? updated : x)) }));
    await instanceDB.put(updated);
  }, []);

  const deleteInstance = useCallback(async (instanceId: string, scope: EditScope['scope']) => {
    const inst = state.instances.find((i) => i.id === instanceId);
    if (!inst) return;
    await instanceDB.del(instanceId);
    setState((s) => ({ ...s, instances: s.instances.filter((i) => i.id !== instanceId) }));
    if (inst.templateId) {
      const tpl = state.templates.find((t) => t.id === inst.templateId);
      if (!tpl) return;
      if (scope === 'future') {
        // 连同以后：停掉整个循环任务（保留历史完成记录）
        await deleteTemplateInternal(inst.templateId, 'future', setState, state);
      } else {
        // 只删这一次：把这一天写入模板的 pausedDates，刷新 / 重新生成后不再复活
        const paused = new Set(tpl.pausedDates ?? []);
        paused.add(inst.localDate);
        const patched: TaskTemplate = { ...tpl, pausedDates: Array.from(paused), updatedAt: Date.now() };
        await templateDB.put(patched);
        setState((s) => ({ ...s, templates: s.templates.map((t) => (t.id === tpl.id ? patched : t)) }));
      }
    }
  }, [state]);

  // 清空指定日期范围内的任务实例（保留 SOP 与模板；被清空的日期标记为不生成，刷新后不再自动复活）
  const clearInstancesForDates = useCallback(async (dates: string[]) => {
    const set = new Set(dates);
    const toDel = state.instances.filter((i) => set.has(i.localDate));
    await Promise.all(toDel.map((i) => instanceDB.del(i.id)));
    // 把被清空日期加入对应模板的 pausedDates，避免重新生成
    const tplIds = new Set(toDel.map((i) => i.templateId).filter(Boolean) as string[]);
    const patchedTpls: TaskTemplate[] = [];
    for (const id of tplIds) {
      const tpl = state.templates.find((t) => t.id === id);
      if (tpl) {
        const paused = new Set(tpl.pausedDates ?? []);
        dates.forEach((d) => paused.add(d));
        patchedTpls.push({ ...tpl, pausedDates: Array.from(paused), updatedAt: Date.now() });
      }
    }
    if (patchedTpls.length) {
      await templateDB.bulkPut(patchedTpls);
    }
    setState((s) => ({
      ...s,
      instances: s.instances.filter((i) => !set.has(i.localDate)),
      templates: s.templates.map((t) => patchedTpls.find((p) => p.id === t.id) ?? t),
    }));
  }, [state]);

  const updateInstance = useCallback(async (instance: TaskInstance, scope: EditScope['scope']) => {
    const now = Date.now();
    if (scope === 'this') {
      const patched = { ...instance, isException: true, updatedAt: now };
      await instanceDB.put(patched);
      setState((s) => ({ ...s, instances: s.instances.map((i) => (i.id === patched.id ? patched : i)) }));
    } else {
      // 修改未来所有重复安排 -> 更新模板 + 未来未完成的实例
      if (instance.templateId) {
        const tpl = state.templates.find((t) => t.id === instance.templateId);
        if (tpl) {
          const updatedTpl: TaskTemplate = {
            ...tpl,
            title: instance.title,
            scheduledTime: instance.scheduledTime,
            timeOfDay: instance.timeOfDay,
            durationMinutes: instance.durationMinutes,
            firstStep: instance.firstStep,
            notes: instance.notes,
            pinned: instance.pinned,
            lowEnergyPreferred: instance.lowEnergyPreferred,
            difficulty: instance.difficulty ?? 'easy',
            updatedAt: now,
          };
          await templateDB.put(updatedTpl);
          // 同步未来未完成、未例外的实例
          const today = nowLocalDate();
          const toPatch = state.instances
            .filter(
              (i) =>
                i.templateId === tpl.id &&
                i.localDate >= today &&
                i.status === 'todo' &&
                !i.isException,
            )
            .map((i) => ({ ...i, ...updatedTpl, id: i.id, localDate: i.localDate, status: i.status, completedAt: i.completedAt, isException: i.isException, updatedAt: now }));
          await instanceDB.bulkPut(toPatch);
          setState((s) => ({
            ...s,
            templates: s.templates.map((t) => (t.id === tpl.id ? updatedTpl : t)),
            instances: s.instances.map((i) => {
              const p = toPatch.find((x) => x.id === i.id);
              return p ? p : i;
            }),
          }));
        }
      } else {
        // 单次任务，直接更新实例
        const patched = { ...instance, updatedAt: now };
        await instanceDB.put(patched);
        setState((s) => ({ ...s, instances: s.instances.map((i) => (i.id === patched.id ? patched : i)) }));
      }
    }
  }, [state]);

  const moveInstance = useCallback(async (instanceId: string, newDate: string) => {
    const cur = stateRef.current;
    const it = cur.instances.find((x) => x.id === instanceId);
    if (!it) return;
    const updated: TaskInstance = { ...it, localDate: newDate, isException: true, updatedAt: Date.now() };
    setState((s) => ({ ...s, instances: s.instances.map((x) => (x.id === instanceId ? updated : x)) }));
    await instanceDB.put(updated);
    await ensureDates([newDate]);
  }, [ensureDates]);

  // ---- 模板操作 ----
  const createTemplate = useCallback(async (t: Omit<TaskTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    const full: TaskTemplate = { ...t, id: uid('tpl'), difficulty: t.difficulty ?? 'easy', createdAt: now, updatedAt: now };
    await templateDB.put(full);
    setState((s) => ({ ...s, templates: [...s.templates, full] }));
    // 为未来/今天生成一次
    const dates = new Set<string>();
    dates.add(nowLocalDate());
    await ensureDates([nowLocalDate()]);
  }, [ensureDates]);

  const updateTemplate = useCallback(async (t: TaskTemplate) => {
    const patched = { ...t, updatedAt: Date.now() };
    await templateDB.put(patched);
    setState((s) => ({ ...s, templates: s.templates.map((x) => (x.id === t.id ? patched : x)) }));
  }, []);

  // 跨框架开关：工作日/周末 SOP 的任务勾选后，同时在另一套框架（周末/工作日）出现
  const setCrossScope = useCallback(async (templateId: string, value: boolean) => {
    const tpl = state.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const sop = state.sops.find((s) => s.id === tpl.sopId);
    const patched: TaskTemplate = { ...tpl, crossScope: value, updatedAt: Date.now() };
    await templateDB.put(patched);
    setState((s) => ({ ...s, templates: s.templates.map((x) => (x.id === templateId ? patched : x)) }));
    if (value) {
      // 开启：重新生成缓冲期实例，让另一套框架的日期也自动出现
      const today = nowLocalDate();
      const buffer: string[] = [];
      for (let i = -7; i <= 60; i++) buffer.push(addDays(today, i));
      await ensureDates(buffer);
    } else if (sop && (sop.type === 'weekdays' || sop.type === 'weekends')) {
      // 关闭：清理未来、未完成、且落在「另一套框架」日期上的实例（避免残留）
      const oppositeWeekend = sop.type === 'weekdays';
      const today = nowLocalDate();
      const toRemove = state.instances.filter(
        (i) =>
          i.templateId === templateId &&
          i.localDate >= today &&
          i.status !== 'done' &&
          (oppositeWeekend ? isWeekend(i.localDate) : isWeekday(i.localDate)),
      );
      for (const it of toRemove) await instanceDB.del(it.id);
      setState((s) => ({ ...s, instances: s.instances.filter((i) => !toRemove.some((r) => r.id === i.id)) }));
    }
  }, [ensureDates, state.templates, state.sops, state.instances]);

  const deleteTemplateInternal = async (
    templateId: string,
    scope: EditScope['scope'],
    set: React.Dispatch<React.SetStateAction<AppState>>,
    current: AppState,
  ) => {
    const tpl = current.templates.find((t) => t.id === templateId);
    if (!tpl) return;
    if (scope === 'this') {
      // 仅删除单次模板本身（理论上单次用实例承载）
      await templateDB.del(templateId);
      set((s) => ({ ...s, templates: s.templates.filter((t) => t.id !== templateId) }));
      return;
    }
    // 删除整个循环：停掉模板 + 删除未来未完成实例，保留历史完成记录
    await templateDB.del(templateId);
    const today = nowLocalDate();
    const futureTodo = current.instances.filter(
      (i) => i.templateId === templateId && i.localDate >= today && i.status !== 'done',
    );
    for (const it of futureTodo) await instanceDB.del(it.id);
    set((s) => ({
      ...s,
      templates: s.templates.filter((t) => t.id !== templateId),
      instances: s.instances.filter(
        (i) => !(i.templateId === templateId && i.localDate >= today && i.status !== 'done'),
      ),
    }));
  };

  const deleteTemplate = useCallback(
    async (templateId: string, scope: EditScope['scope']) => {
      await deleteTemplateInternal(templateId, scope, setState, state);
    },
    [state],
  );

  // ---- SOP 操作 ----
  const createSop = useCallback(async (sop: Omit<Sop, 'id' | 'createdAt' | 'updatedAt'>): Promise<Sop> => {
    const now = Date.now();
    const full: Sop = { ...sop, id: uid('sop'), createdAt: now, updatedAt: now };
    await sopDB.put(full);
    setState((s) => ({ ...s, sops: [...s.sops, full] }));
    await ensureDates([nowLocalDate()]);
    return full;
  }, [ensureDates]);

  const createSopFromText = useCallback(async (text: string): Promise<number> => {
    const parsed: ParsedSop[] = parseSopText(text);
    const now = Date.now();
    const today = nowLocalDate();
    let created = 0;
    for (const p of parsed) {
      const sop: Sop = {
        id: uid('sop'),
        name: p.name,
        type: p.type,
        daysOfWeek: p.daysOfWeek,
        monthlyRule: p.monthlyRule,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await sopDB.put(sop);
      let sortOrder = 0;
      for (const task of p.tasks) {
        const tpl: TaskTemplate = {
          id: uid('tpl'),
          sopId: sop.id,
          title: task.title,
          recurrence: task.recurrence,
          scheduledTime: task.scheduledTime,
          timeOfDay: task.timeOfDay,
          durationMinutes: task.durationMinutes,
          firstStep: null,
          notes: null,
          pinned: false,
          lowEnergyPreferred: false,
          sortOrder: sortOrder++,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        await templateDB.put(tpl);
      }
      created++;
    }
    // 重新加载
    const [sops, templates] = await Promise.all([sopDB.all(), templateDB.all()]);
    setState((s) => ({ ...s, sops, templates }));
    await ensureDates([today]);
    return created;
  }, [ensureDates]);

  const updateSop = useCallback(async (sop: Sop) => {
    const patched = { ...sop, updatedAt: Date.now() };
    await sopDB.put(patched);
    setState((s) => ({ ...s, sops: s.sops.map((x) => (x.id === sop.id ? patched : x)) }));
    await ensureDates([nowLocalDate()]);
  }, [ensureDates]);

  const deleteSop = useCallback(async (sopId: string) => {
    const templates = state.templates.filter((t) => t.sopId === sopId);
    for (const t of templates) await templateDB.del(t.id);
    await sopDB.del(sopId);
    // 删除这些模板产生的未来未完成实例，保留历史完成
    const today = nowLocalDate();
    for (const t of templates) {
      const future = state.instances.filter(
        (i) => i.templateId === t.id && i.localDate >= today && i.status !== 'done',
      );
      for (const it of future) await instanceDB.del(it.id);
    }
    setState((s) => ({
      ...s,
      sops: s.sops.filter((x) => x.id !== sopId),
      templates: s.templates.filter((x) => x.sopId !== sopId),
      instances: s.instances.filter(
        (i) =>
          !(templates.some((t) => t.id === i.templateId) && i.localDate >= today && i.status !== 'done'),
      ),
    }));
  }, [state]);

  const duplicateSop = useCallback(async (sopId: string) => {
    const sop = state.sops.find((s) => s.id === sopId);
    if (!sop) return;
    const now = Date.now();
    const copy: Sop = { ...sop, id: uid('sop'), name: sop.name + ' 副本', createdAt: now, updatedAt: now };
    await sopDB.put(copy);
    const tpls = state.templates.filter((t) => t.sopId === sopId);
    for (const t of tpls) {
      const c: TaskTemplate = { ...t, id: uid('tpl'), sopId: copy.id, createdAt: now, updatedAt: now };
      await templateDB.put(c);
    }
    const [sops, templates] = await Promise.all([sopDB.all(), templateDB.all()]);
    setState((s) => ({ ...s, sops, templates }));
  }, [state]);

  const toggleSop = useCallback(async (sopId: string) => {
    const sop = state.sops.find((s) => s.id === sopId);
    if (!sop) return;
    const patched = { ...sop, enabled: !sop.enabled, updatedAt: Date.now() };
    await sopDB.put(patched);
    setState((s) => ({ ...s, sops: s.sops.map((x) => (x.id === sopId ? patched : x)) }));
    if (!sop.enabled) {
      // 重新启用：为今天/未来补齐
      await ensureDates([nowLocalDate()]);
    } else {
      // 停用：删除未来未完成的该 SOP 实例（保留历史完成）
      const today = nowLocalDate();
      const tplIds = new Set(state.templates.filter((t) => t.sopId === sopId).map((t) => t.id));
      const toDel = state.instances.filter(
        (i) => i.templateId && tplIds.has(i.templateId) && i.localDate >= today && i.status !== 'done',
      );
      for (const it of toDel) await instanceDB.del(it.id);
      const remaining = new Set(toDel.map((i) => i.id));
      setState((s) => ({
        ...s,
        instances: s.instances.filter((i) => !remaining.has(i.id)),
      }));
    }
  }, [state, ensureDates]);

  const reorderSops = useCallback(async (orderedIds: string[]) => {
    const map = new Map(state.sops.map((s) => [s.id, s]));
    const updates = orderedIds
      .map((id, idx) => map.get(id))
      .filter((s): s is Sop => !!s)
      .map((s, idx) => ({ ...s, sortOrder: idx, updatedAt: Date.now() }));
    await sopDB.bulkPut(updates);
    setState((s) => ({
      ...s,
      sops: sortSops(s.sops.map((x) => updates.find((u) => u.id === x.id) ?? x)),
    }));
  }, [state.sops]);

  // 重排某个 SOP 内的小任务顺序（更新各模板 sortOrder 并持久化）
  const reorderTemplates = useCallback(async (sopId: string, orderedIds: string[]) => {
    const map = new Map(state.templates.filter((t) => t.sopId === sopId).map((t) => [t.id, t]));
    const updates = orderedIds
      .map((id, idx) => {
        const t = map.get(id);
        return t ? { ...t, sortOrder: idx, updatedAt: Date.now() } : null;
      })
      .filter((t): t is TaskTemplate => !!t);
    if (!updates.length) return;
    await templateDB.bulkPut(updates);
    setState((s) => ({ ...s, templates: s.templates.map((x) => updates.find((u) => u.id === x.id) ?? x) }));
  }, [state.templates]);

  // 恢复被清空/删除的某天：从模板 pausedDates 移除指定日期，并为其重新生成实例
  const unpauseTemplateDates = useCallback(async (templateId: string, dates: string[]) => {
    const tpl = state.templates.find((t) => t.id === templateId);
    if (!tpl || !dates.length) return;
    const remove = new Set(dates);
    const paused = (tpl.pausedDates ?? []).filter((d) => !remove.has(d));
    const patched: TaskTemplate = {
      ...tpl,
      pausedDates: paused.length ? paused : undefined,
      updatedAt: Date.now(),
    };
    await templateDB.put(patched);
    setState((s) => ({ ...s, templates: s.templates.map((t) => (t.id === templateId ? patched : t)) }));
    await ensureDates(dates);
  }, [state.templates, ensureDates]);

  // 设置难度：立刻持久化。为免「改了却只改到某一天」，同时写入模板，
  // 并把「今天及以后」所有未完成的同模板实例一起同步（各视图、各天看到的分数一致）。
  const setTaskDifficulty = useCallback(
    async (instanceId: string, difficulty: TaskDifficulty) => {
      const inst = state.instances.find((i) => i.id === instanceId);
      if (!inst) return;
      const now = Date.now();
      const today = nowLocalDate();

      const patchedInst: TaskInstance = { ...inst, difficulty, updatedAt: now };
      await instanceDB.put(patchedInst);

      let patchedTpl: TaskTemplate | null = null;
      const toPatch: TaskInstance[] = [];
      if (inst.templateId) {
        const tpl = state.templates.find((t) => t.id === inst.templateId);
        if (tpl) {
          patchedTpl = { ...tpl, difficulty, updatedAt: now };
          await templateDB.put(patchedTpl);
          for (const i of state.instances) {
            if (i.templateId !== tpl.id) continue;
            if (i.localDate < today) continue; // 过去的记录不动
            if (i.status === 'done') continue; // 已完成的保留当时分值
            if (i.id === patchedInst.id) continue;
            toPatch.push({ ...i, difficulty, updatedAt: now });
          }
          if (toPatch.length) await instanceDB.bulkPut(toPatch);
        }
      }
      const tplId = patchedTpl?.id;
      const finalTpl = patchedTpl;
      setState((s) => ({
        ...s,
        instances: s.instances.map((i) => {
          if (i.id === patchedInst.id) return patchedInst;
          return toPatch.find((x) => x.id === i.id) ?? i;
        }),
        templates: finalTpl && tplId ? s.templates.map((t) => (t.id === tplId ? finalTpl : t)) : s.templates,
      }));
    },
    [state.instances, state.templates],
  );

  // ---- 快速添加 ----
  const quickAdd = useCallback(
    async (input: {
      title: string;
      localDate: string;
      scheduledTime?: string | null;
      recurrence?: RecurrenceRule;
      durationMinutes?: number | null;
      firstStep?: string | null;
      notes?: string | null;
      pinned?: boolean;
      lowEnergyPreferred?: boolean;
      difficulty?: TaskDifficulty;
    }) => {
      if (!input.recurrence || input.recurrence.type === 'once') {
        const inst = makeOneOffInstance({
          localDate: input.localDate,
          title: input.title,
          scheduledTime: input.scheduledTime ?? null,
          timeOfDay: input.scheduledTime ? null : null,
          durationMinutes: input.durationMinutes ?? null,
          firstStep: input.firstStep ?? null,
          notes: input.notes ?? null,
          pinned: input.pinned ?? false,
          lowEnergyPreferred: input.lowEnergyPreferred ?? false,
          difficulty: input.difficulty ?? 'easy',
          sortOrder: 0,
          sopName: null,
          recurrenceType: 'once',
        });
        await instanceDB.put(inst);
        setState((s) => ({ ...s, instances: [...s.instances, inst] }));
      } else {
        // 带循环：创建模板 + 生成今天/该日实例
        const now = Date.now();
        const tpl: TaskTemplate = {
          id: uid('tpl'),
          sopId: null,
          title: input.title,
          recurrence: input.recurrence,
          scheduledTime: input.scheduledTime ?? null,
          timeOfDay: null,
          durationMinutes: input.durationMinutes ?? null,
          firstStep: input.firstStep ?? null,
          notes: input.notes ?? null,
          pinned: input.pinned ?? false,
          lowEnergyPreferred: input.lowEnergyPreferred ?? false,
          difficulty: input.difficulty ?? 'easy',
          sortOrder: 0,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        await templateDB.put(tpl);
        setState((s) => ({ ...s, templates: [...s.templates, tpl] }));
        await ensureDates([input.localDate]);
      }
    },
    [ensureDates],
  );

  // ---- 低能量模式 ----
  const getLowEnergy = useCallback(
    (date: string): LowEnergyState => {
      const found = state.lowEnergy.find((l) => l.id === date);
      if (found) return found;
      return { id: date, localDate: date, enabled: false, shownTaskIds: [], manualReplacedIds: [] };
    },
    [state.lowEnergy],
  );

  const setLowEnergy = useCallback(async (date: string, patch: Partial<LowEnergyState>) => {
    const existing = state.lowEnergy.find((l) => l.id === date);
    const merged: LowEnergyState = {
      id: date,
      localDate: date,
      enabled: existing?.enabled ?? false,
      shownTaskIds: existing?.shownTaskIds ?? [],
      manualReplacedIds: existing?.manualReplacedIds ?? [],
      ...patch,
    };
    await lowEnergyDB.put(merged);
    setState((s) => {
      const others = s.lowEnergy.filter((l) => l.id !== date);
      return { ...s, lowEnergy: [...others, merged] };
    });
  }, [state.lowEnergy]);

  // ---- 积分系统 ----
  const persistPoints = async (p: PointsState) => {
    await pointsDB.put(p);
  };

  const addPrize = useCallback(
    async (p: { title: string; cost: number; emoji?: string; note?: string | null; tier?: 'normal' | 'milestone'; hardRatioRequired?: number }) => {
      const prize: Prize = {
        id: uid('prize'),
        title: p.title.trim(),
        cost: Math.max(1, Math.round(p.cost)),
        emoji: p.emoji?.trim() || '🎁',
        note: p.note ?? null,
        tier: p.tier ?? 'normal',
        hardRatioRequired: p.tier === 'milestone' ? (p.hardRatioRequired ?? 0) : undefined,
        createdAt: Date.now(),
      };
      const pointsUpdated: PointsState = { ...stateRef.current.points, prizes: [...stateRef.current.points.prizes, prize] };
      setState((s) => ({ ...s, points: pointsUpdated }));
      await persistPoints(pointsUpdated);
    },
    [],
  );

  // 编辑奖品：可改标题/积分/图标/分级/困难分占比，立即生效
  const updatePrize = useCallback(async (prizeId: string, p: { title: string; cost: number; emoji?: string; tier?: 'normal' | 'milestone'; hardRatioRequired?: number }) => {
    const cur = stateRef.current.points;
    const prizes = cur.prizes.map((x) => {
      if (x.id !== prizeId) return x;
      const tier = p.tier ?? 'normal';
      return {
        ...x,
        title: p.title.trim() || x.title,
        cost: Math.max(1, Math.round(p.cost)),
        emoji: p.emoji?.trim() || x.emoji,
        tier,
        hardRatioRequired: tier === 'milestone' ? (p.hardRatioRequired ?? x.hardRatioRequired ?? 0) : undefined,
      };
    });
    const pointsUpdated: PointsState = { ...cur, prizes };
    setState((s) => ({ ...s, points: pointsUpdated }));
    await persistPoints(pointsUpdated);
  }, []);

  const removePrize = useCallback(async (prizeId: string) => {
    const cur = stateRef.current.points;
    const pointsUpdated: PointsState = {
      ...cur,
      prizes: cur.prizes.filter((p) => p.id !== prizeId),
      targetPrizeId: cur.targetPrizeId === prizeId ? null : cur.targetPrizeId,
    };
    setState((s) => ({ ...s, points: pointsUpdated }));
    await persistPoints(pointsUpdated);
  }, []);

  const redeemPrize = useCallback(async (prizeId: string): Promise<{ ok: boolean; reason?: string }> => {
    const cur = stateRef.current.points;
    const prize = cur.prizes.find((p) => p.id === prizeId);
    if (!prize) return { ok: false, reason: '奖品不存在' };
    if (cur.total < prize.cost) return { ok: false, reason: `还差 ${prize.cost - cur.total} 分` };
    // 里程碑门槛：困难分占比需达标才能兑换
    if (prize.tier === 'milestone' && prize.hardRatioRequired != null) {
      const ratio = cur.earned > 0 ? (cur.hardEarned ?? 0) / cur.earned : 0;
      if (ratio < prize.hardRatioRequired) {
        return {
          ok: false,
          reason: `困难分占比需 ≥ ${Math.round(prize.hardRatioRequired * 100)}%（当前 ${Math.round(ratio * 100)}%）`,
        };
      }
    }
    const ev: PointEvent = {
      id: uid('pe'),
      type: 'redeem',
      amount: -prize.cost,
      reason: `兑换奖品「${prize.title}」`,
      at: Date.now(),
    };
    const wasTarget = cur.targetPrizeId === prizeId;
    const pointsUpdated: PointsState = {
      ...cur,
      total: cur.total - prize.cost,
      targetPrizeId: wasTarget ? null : cur.targetPrizeId,
      history: [ev, ...cur.history].slice(0, 300),
    };
    setState((s) => ({ ...s, points: pointsUpdated }));
    await persistPoints(pointsUpdated);
    return { ok: true };
  }, []);

  const setTargetPrize = useCallback(async (prizeId: string | null) => {
    const pointsUpdated: PointsState = { ...stateRef.current.points, targetPrizeId: prizeId };
    setState((s) => ({ ...s, points: pointsUpdated }));
    await persistPoints(pointsUpdated);
  }, []);

  // 撤回某条加分记录：只针对 amount>0 的 earn 事件，把对应分数从 total、earned、hardEarned 扣回，并移除该条流水
  const withdrawEvent = useCallback(async (eventId: string) => {
    const cur = stateRef.current.points;
    const ev = cur.history.find((x) => x.id === eventId);
    if (!ev || ev.amount <= 0) return; // 仅加分记录可撤回
    const delta = -ev.amount; // 负数
    const pointsUpdated: PointsState = {
      ...cur,
      total: Math.max(0, cur.total + delta),
      earned: Math.max(0, cur.earned + delta),
      hardEarned: Math.max(0, (cur.hardEarned ?? 0) - (ev.hard ?? 0)),
      history: cur.history.filter((x) => x.id !== eventId),
    };
    setState((s) => ({ ...s, points: pointsUpdated }));
    await persistPoints(pointsUpdated);
  }, []);

  // ---- 偏好 / 引导 ----
  const updatePrefs = useCallback(async (patch: Partial<UserPreferences>) => {
    const merged = { ...state.prefs, ...patch, id: 'prefs' as const };
    await prefsDB.put(merged);
    setState((s) => ({ ...s, prefs: merged }));
  }, [state.prefs]);

  const finishOnboarding = useCallback(async () => {
    const merged = { ...state.prefs, id: 'prefs' as const };
    await prefsDB.put(merged);
    setState((s) => ({ ...s, onboarded: true, prefs: merged }));
  }, [state.prefs]);

  // ---- 备份 ----
  const exportData = useCallback(async (): Promise<string> => {
    return await exportAll();
  }, []);

  const importData = useCallback(async (json: string) => {
    await importAll(json);
    const [sops, templates, instances, prefs, lowEnergy, points] = await Promise.all([
      sopDB.all(),
      templateDB.all(),
      instanceDB.all(),
      prefsDB.get(),
      lowEnergyDB.all(),
      pointsDB.get(),
    ]);
    setState((s) => ({
      ...s,
      sops,
      templates,
      instances,
      prefs: prefs || s.prefs,
      lowEnergy,
      points: normalizePoints(points),
      onboarded: true,
    }));
  }, []);

  const value: AppActions = useMemo(
    () => ({
      ready: state.ready,
      sops: state.sops,
      templates: state.templates,
      instances: state.instances,
      prefs: state.prefs,
      lowEnergy: state.lowEnergy,
      points: state.points,
      onboarded: state.onboarded,
      ensureDates,
      toggleComplete,
      skipTask,
      restoreTask,
      deleteInstance,
      clearInstancesForDates,
      updateInstance,
      moveInstance,
      createTemplate,
      updateTemplate,
      setCrossScope,
      deleteTemplate,
      createSopFromText,
      createSop,
      updateSop,
      deleteSop,
      duplicateSop,
      toggleSop,
      reorderSops,
      reorderTemplates,
      unpauseTemplateDates,
      setTaskDifficulty,
      quickAdd,
      getLowEnergy,
      setLowEnergy,
      addPrize,
      updatePrize,
      removePrize,
      redeemPrize,
      setTargetPrize,
      withdrawEvent,
      updatePrefs,
      finishOnboarding,
      exportData,
      importData,
    }),
    [
      state.ready, state.sops, state.templates, state.instances, state.prefs, state.lowEnergy,
      state.points, state.onboarded, ensureDates, toggleComplete, skipTask, restoreTask, deleteInstance,
      updateInstance, moveInstance, createTemplate, updateTemplate, setCrossScope, deleteTemplate,
      createSopFromText, createSop, updateSop, deleteSop, duplicateSop, toggleSop,       reorderSops,
      reorderTemplates, unpauseTemplateDates, setTaskDifficulty,
      quickAdd, getLowEnergy, setLowEnergy, addPrize, updatePrize, removePrize, redeemPrize,
      setTargetPrize, withdrawEvent, updatePrefs, finishOnboarding, exportData, importData,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

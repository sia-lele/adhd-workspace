// ============================================================
// 任务生成器
// 按需为指定日期/范围生成每日实例；同一模板同一天仅一个实例
// 已存在的实例（含用户修改过的例外）不会被覆盖
// ============================================================

import type { Sop, TaskInstance, TaskTemplate } from '../types';
import { shouldGenerate } from './recurrence';
import { instanceDB, sopDB, templateDB } from '../db/database';

function buildInstance(t: TaskTemplate, date: string, sops: Sop[]): TaskInstance {
  const now = Date.now();
  const sop = t.sopId ? sops.find((s) => s.id === t.sopId) : null;
  return {
    id: `${t.id}__${date}`,
    templateId: t.id,
    localDate: date,
    title: t.title,
    scheduledTime: t.scheduledTime,
    timeOfDay: t.timeOfDay,
    durationMinutes: t.durationMinutes,
    status: 'todo',
    completedAt: null,
    skippedAt: null,
    isException: false,
    firstStep: t.firstStep,
    notes: t.notes,
    pinned: t.pinned,
    lowEnergyPreferred: t.lowEnergyPreferred,
    difficulty: t.difficulty ?? 'easy',
    sortOrder: t.sortOrder,
    crossScope: t.crossScope ?? false,
    sopName: sop ? sop.name : null,
    recurrenceType: t.recurrence.type,
    createdAt: now,
    updatedAt: now,
  };
}

/** 为单个日期补齐缺失的实例，返回该日期全部实例 */
export async function ensureInstancesForDate(date: string): Promise<TaskInstance[]> {
  const [templates, sops, allInstances] = await Promise.all([
    templateDB.all(),
    sopDB.all(),
    instanceDB.all(),
  ]);
  const existingForDate = allInstances.filter((e) => e.localDate === date);
  const existingKeys = new Set(
    existingForDate.map((e) => (e.templateId ? `${e.templateId}__${e.localDate}` : e.id)),
  );

  const toCreate: TaskInstance[] = [];
  for (const t of templates) {
    if (!shouldGenerate(t, sops, date)) continue;
    const key = `${t.id}__${date}`;
    if (existingKeys.has(key)) continue;
    toCreate.push(buildInstance(t, date, sops));
  }
  if (toCreate.length) await instanceDB.bulkPut(toCreate);
  return [...existingForDate, ...toCreate];
}

/** 为多个日期批量生成 */
export async function ensureInstancesForDates(dates: string[]): Promise<void> {
  for (const d of dates) {
    await ensureInstancesForDate(d);
  }
}

/** 根据模板直接构建一个一次性实例（供快速添加使用，templateId 为 null） */
export function makeOneOffInstance(
  partial: Omit<TaskInstance, 'id' | 'status' | 'completedAt' | 'skippedAt' | 'isException' | 'createdAt' | 'updatedAt' | 'templateId'>,
): TaskInstance {
  const now = Date.now();
  return {
    ...partial,
    id: `one_${now}_${Math.random().toString(36).slice(2, 8)}`,
    templateId: null,
    status: 'todo',
    completedAt: null,
    skippedAt: null,
    isException: false,
    createdAt: now,
    updatedAt: now,
  };
}

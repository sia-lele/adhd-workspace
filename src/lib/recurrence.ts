// ============================================================
// 循环规则引擎
// 决定：某模板在哪些日期应生成实例；某 SOP 在哪些日期生效
// 正确处理：月份天数不同、闰年、跨年、月末(如31日)跳过等边界
// ============================================================

import {
  fromLocalDate,
  getDayOfWeek,
  isWeekday,
  isWeekend,
  daysBetween,
  daysInMonth,
} from './dateUtils';
import type { RecurrenceRule, Sop, TaskTemplate } from '../types';

/** 该日期是当月的第几周（1..5，第5周即最后一周） */
function weekOfMonth(s: string): number {
  const d = fromLocalDate(s);
  const firstDow = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
  return Math.floor((d.getDate() + firstDow - 1) / 7) + 1;
}

function isLastWeek(s: string): boolean {
  const d = fromLocalDate(s);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  return d.getDate() > dim - 7;
}

/** 某 SOP 在指定日期是否生效 */
export function sopActiveOn(sop: Sop, date: string): boolean {
  switch (sop.type) {
    case 'weekdays':
      return isWeekday(date);
    case 'weekends':
      return isWeekend(date);
    case 'daily':
      return true;
    case 'custom':
      return sop.daysOfWeek.includes(getDayOfWeek(date));
    case 'monthly': {
      const r = sop.monthlyRule;
      if (!r) return false;
      if (r.dayOfMonth != null) {
        const dim = daysInMonth(...yM(date));
        if (r.dayOfMonth > dim) return false; // 该月无此日 -> 跳过
        return fromLocalDate(date).getDate() === r.dayOfMonth;
      }
      if (r.lastWeek && r.weekday != null) {
        return isLastWeek(date) && getDayOfWeek(date) === r.weekday;
      }
      if (r.weekOfMonth != null && r.weekday != null) {
        return weekOfMonth(date) === r.weekOfMonth && getDayOfWeek(date) === r.weekday;
      }
      return false;
    }
    default:
      return false;
  }
}

function yM(s: string): [number, number] {
  const d = fromLocalDate(s);
  return [d.getFullYear(), d.getMonth()];
}

function monthsBetween(a: string, b: string): number {
  const [ya, ma] = yM(a);
  const [yb, mb] = yM(b);
  return (ya - yb) * 12 + (ma - mb);
}

/** 循环规则是否匹配某日期 */
export function recurrenceMatches(rule: RecurrenceRule, date: string): boolean {
  switch (rule.type) {
    case 'once':
      return rule.date === date;
    case 'daily':
      return true;
    case 'weekly':
      return rule.daysOfWeek.includes(getDayOfWeek(date));
    case 'monthly': {
      const d = fromLocalDate(date);
      if (rule.dayOfMonth != null) {
        const dim = daysInMonth(d.getFullYear(), d.getMonth());
        // 该月不存在该日（如 31 日但只有 30 天）-> 按要求跳过
        if (rule.dayOfMonth > dim) return false;
        if (rule.skipIfNotExists === false && rule.dayOfMonth > dim) {
          // 若用户选择不跳过，则回退到月末最后一天
          return d.getDate() === dim;
        }
        return d.getDate() === rule.dayOfMonth;
      }
      if (rule.lastWeek && rule.weekday != null) {
        return isLastWeek(date) && getDayOfWeek(date) === rule.weekday;
      }
      if (rule.weekOfMonth != null && rule.weekday != null) {
        return weekOfMonth(date) === rule.weekOfMonth && getDayOfWeek(date) === rule.weekday;
      }
      return false;
    }
    case 'custom': {
      const diff = daysBetween(date, rule.anchorDate);
      if (diff < 0) return false;
      if (rule.unit === 'day') return diff % rule.interval === 0;
      if (rule.unit === 'week') return Math.floor(diff / 7) % rule.interval === 0;
      if (rule.unit === 'month') {
        const m = monthsBetween(date, rule.anchorDate);
        if (m < 0 || m % rule.interval !== 0) return false;
        // 保持与锚定日相同的“日”
        return fromLocalDate(date).getDate() === fromLocalDate(rule.anchorDate).getDate();
      }
      return false;
    }
    default:
      return false;
  }
}

/** 模板是否应在指定日期生成实例（综合：启用 + 循环 + SOP 生效） */
export function shouldGenerate(
  template: TaskTemplate,
  sops: Sop[],
  date: string,
): boolean {
  if (!template.enabled) return false;
  if (template.pausedDates?.includes(date)) return false;
  if (!recurrenceMatches(template.recurrence, date)) return false;
  if (template.sopId) {
    const sop = sops.find((s) => s.id === template.sopId);
    if (!sop || !sop.enabled) return false;
    // 跨框架：工作日 / 周末 SOP 的任务勾选后，同时在另一套框架（周末 / 工作日）出现
    const crossWeekParts =
      !!template.crossScope && (sop.type === 'weekdays' || sop.type === 'weekends');
    if (!crossWeekParts && !sopActiveOn(sop, date)) return false;
  }
  return true;
}

export { weekOfMonth, isLastWeek };

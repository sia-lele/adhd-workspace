// ============================================================
// 日期工具 —— 全部使用本地日期（避免 UTC/时区偏移）
// 内部表示统一为 YYYY-MM-DD 字符串
// ============================================================

export function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

/** Date -> YYYY-MM-DD（按本地时区） */
export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM-DD -> 本地午夜 Date */
export function fromLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(s: string, n: number): string {
  const d = fromLocalDate(s);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

export function addMonths(s: string, n: number): string {
  const d = fromLocalDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // 钳制到该月最大天数
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toLocalDate(d);
}

export function getDayOfWeek(s: string): number {
  return fromLocalDate(s).getDay(); // 0=周日
}

/** 距离（天），a - b */
export function daysBetween(a: string, b: string): number {
  const da = fromLocalDate(a).getTime();
  const db = fromLocalDate(b).getTime();
  return Math.round((da - db) / 86400000);
}

/** 某日期所在周的周一/指定起始日 */
export function startOfWeek(s: string, weekStartsOn = 1): string {
  const d = fromLocalDate(s);
  const dow = d.getDay(); // 0..6
  // 把周日(0)映射到 7，方便计算
  const diff = (dow - weekStartsOn + 7) % 7;
  return addDays(s, -diff);
}

/** 生成本周七天（含 s 所在周） */
export function weekDays(s: string, weekStartsOn = 1): string[] {
  const start = startOfWeek(s, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isWeekend(s: string): boolean {
  const dow = getDayOfWeek(s);
  return dow === 0 || dow === 6;
}

export function isWeekday(s: string): boolean {
  return !isWeekend(s);
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

export function weekdayLabel(s: string): string {
  return '周' + WEEKDAY_CN[getDayOfWeek(s)];
}

/** 月份天数 */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** 解析 HH:mm -> 分钟数，用于排序 */
export function timeToMinutes(t: string | null): number {
  if (!t) return 9999; // 无固定时间排最后
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** 当天的本地时间字符串 HH:mm */
export function nowTimeString(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function nowLocalDate(): string {
  return toLocalDate(new Date());
}

const MONTH_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 用于顶部周范围展示：10月12日—10月18日 */
export function formatWeekRange(start: string, end: string): string {
  const ds = fromLocalDate(start);
  const de = fromLocalDate(end);
  return `${MONTH_CN[ds.getMonth()]}${ds.getDate()}日 — ${MONTH_CN[de.getMonth()]}${de.getDate()}日`;
}

export function formatMonthDay(s: string): string {
  const d = fromLocalDate(s);
  return `${MONTH_CN[d.getMonth()]}${d.getDate()}日`;
}

export function formatFullDate(s: string): string {
  const d = fromLocalDate(s);
  return `${d.getFullYear()}年${MONTH_CN[d.getMonth()]}${d.getDate()}日`;
}

export { MONTH_CN };

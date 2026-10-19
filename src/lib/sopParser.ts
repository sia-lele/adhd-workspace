// ============================================================
// 自然语言 SOP 解析器（规则驱动，无需 AI 也可用）
// 输入自由文本 -> 解析为 SOP + 任务模板预览，供用户检查/修改后保存
// 明确的时间才会被识别为精确时间；模糊时间只记录时间段
// ============================================================

import type { RecurrenceRule, SopType, TimeOfDay } from '../types';

export interface ParsedTask {
  title: string;
  scheduledTime: string | null;
  timeOfDay: TimeOfDay;
  durationMinutes: number | null;
  recurrence: RecurrenceRule;
}

export interface ParsedSop {
  name: string;
  type: SopType;
  daysOfWeek: number[];
  monthlyRule?: Sop['monthlyRule'];
  tasks: ParsedTask[];
}

import type { Sop } from '../types';

const WEEKDAY_MAP: Record<string, number> = {
  日: 0, 天: 0, 0: 0,
  一: 1, 1: 1,
  二: 2, 2: 2,
  三: 3, 3: 3,
  四: 4, 4: 4,
  五: 5, 5: 5,
  六: 6, 6: 6,
};

function parseWeekdays(text: string): number[] {
  const result = new Set<number>();
  const re = /(?:周|星期|礼拜)\s*([一二三四五六日天\d])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = WEEKDAY_MAP[m[1]];
    if (v != null) result.add(v);
  }
  // 形如 "每周一、三、五" 的连续数字
  const numRe = /([123456日天])\s*[、,，]\s*([123456日天])/g;
  while ((m = numRe.exec(text))) {
    [m[1], m[2]].forEach((c) => {
      const v = WEEKDAY_MAP[c];
      if (v != null) result.add(v);
    });
  }
  return [...result];
}

/** 解析时间 HH:mm。支持 7:00 / 7点 / 7点半 / 19:00 */
function parseTime(text: string): string | null {
  let m = text.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const h = Math.min(23, +m[1]);
    const min = Math.min(59, +m[2]);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  m = text.match(/(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分?)?/);
  if (m) {
    const h = Math.min(23, +m[1]);
    let min = 0;
    if (m[2] === '半') min = 30;
    else if (m[3]) min = Math.min(59, +m[3]);
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return null;
}

/** 解析预计时长（分钟） */
function parseDuration(text: string): number | null {
  let minutes = 0;
  let found = false;
  let m = text.match(/(\d+(?:\.\d+)?)\s*小时/);
  if (m) {
    minutes += Math.round(parseFloat(m[1]) * 60);
    found = true;
  }
  m = text.match(/(\d+(?:\.\d+)?)\s*分钟/);
  if (m) {
    minutes += Math.round(parseFloat(m[1]));
    found = true;
  }
  if (/半小时/.test(text)) {
    minutes += 30;
    found = true;
  }
  return found ? minutes : null;
}

function parseTimeOfDay(text: string): TimeOfDay {
  if (/早上|早晨|上午|清晨/.test(text)) return 'morning';
  if (/下午|午后|中午/.test(text)) return 'afternoon';
  if (/晚上|傍晚|夜里|夜间|睡前|睡觉前/.test(text)) return 'evening';
  return null;
}

/** 解析某任务行的循环规则（结合所在 SOP 的默认类型） */
function parseRecurrence(line: string, sopType: SopType): RecurrenceRule {
  // 每月
  if (/每月|每个月|每月的/.test(line)) {
    let m = line.match(/每月\s*(\d{1,2})\s*日?/);
    if (m) {
      const day = +m[1];
      return { type: 'monthly', dayOfMonth: Math.min(31, day), skipIfNotExists: true };
    }
    if (/最后一天/.test(line)) {
      return { type: 'monthly', dayOfMonth: 31, skipIfNotExists: true };
    }
    if (/最后\s*一?\s*个?\s*(星期|周)/.test(line) || /最后一个/.test(line)) {
      const wd = parseWeekdays(line);
      return { type: 'monthly', lastWeek: true, weekday: wd[0] ?? 0 };
    }
    const wd = parseWeekdays(line);
    const wom = line.match(/第\s*([一二三四1-4])\s*个/);
    if (wom && wd[0] != null) {
      const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 1: 1, 2: 2, 3: 3, 4: 4 };
      return { type: 'monthly', weekOfMonth: map[wom[1]], weekday: wd[0] };
    }
    // 仅“每月”未指明 -> 默认每天
    return { type: 'daily' };
  }
  // 每两周 / 每N周
  if (/每\s*两?\s*周/.test(line)) {
    const wd = parseWeekdays(line);
    return {
      type: 'custom',
      interval: /每\s*两\s*周/.test(line) ? 2 : 1,
      unit: 'week',
      anchorDate: '2026-01-05', // 占位，保存时由调用方根据首次出现日调整
    };
  }
  // 每周
  if (/每周|每星期|每礼拜/.test(line)) {
    const wd = parseWeekdays(line);
    if (wd.length) return { type: 'weekly', daysOfWeek: wd };
    return { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5, 6, 0] };
  }
  // 仅指明星期（如「周六下午学习英语」）也识别为每周
  const wdBare = parseWeekdays(line);
  if (wdBare.length && !/每天|每日|天天/.test(line)) {
    return { type: 'weekly', daysOfWeek: wdBare };
  }
  // 每天 / 每日
  if (/每天|每日|天天/.test(line)) return { type: 'daily' };
  // 默认：跟随所在 SOP 的类型（工作日/周末/每日通常都是每天，靠 SOP 过滤）
  if (sopType === 'weekdays' || sopType === 'weekends' || sopType === 'daily' || sopType === 'monthly') {
    return { type: 'daily' };
  }
  return { type: 'daily' };
}

/** 从一行中去掉已识别的结构，得到任务标题 */
function extractTitle(line: string, time: string | null, duration: number | null, tod: TimeOfDay): string {
  let t = line;
  // 去掉时间
  if (time) t = t.replace(time, '');
  t = t.replace(/(\d{1,2}):(\d{2})/g, '');
  t = t.replace(/(\d{1,2})\s*点\s*(半|(\d{1,2})\s*分?)?/g, '');
  // 去掉时长
  t = t.replace(/\d+(?:\.\d+)?\s*小时/g, '');
  t = t.replace(/\d+(?:\.\d+)?\s*分钟/g, '');
  t = t.replace(/半小时/g, '');
  // 去掉循环关键词（只移除关键词本身，不吞掉任务名词）
  t = t.replace(/每天|每日|天天/g, '');
  t = t.replace(/每\s*两?\s*周/g, '');
  t = t.replace(/每\s*周\s*[一二三四五六日天\d]*(?:[、,，]\s*[一二三四五六日天\d]+)*/g, '');
  t = t.replace(/每\s*星期\s*[一二三四五六日天\d]*/g, '');
  t = t.replace(/每\s*礼拜\s*[一二三四五六日天\d]*/g, '');
  t = t.replace(/每月\s*(最后\s*一?\s*个?\s*)?(第\s*[一二三四1-4]\s*个\s*)?(星期|周)?\s*[一二三四五六日天\d]*\s*(日|号)?/g, '');
  // 去掉时间段
  t = t.replace(/早上|早晨|上午|中午|下午|午后|晚上|傍晚|夜里|夜间|清晨|睡前|睡觉前|起床后/g, '');
  // 去掉星期/月份描述残留
  t = t.replace(/(周|星期|礼拜)\s*[一二三四五六日天\d]/g, '');
  t = t.replace(/第\s*[一二三四1-4]\s*个/g, '');
  t = t.replace(/最后\s*一?\s*个/g, '');
  t = t.replace(/[，。、,.；;：:\s]+/g, ' ').trim();
  return t || '待办事项';
}

interface Section {
  type: SopType;
  name: string;
  daysOfWeek: number[];
  monthlyRule?: Sop['monthlyRule'];
}

function detectSection(line: string): Section | null {
  const stripped = line.replace(/[：:，。\s]/g, '');
  const isHeader =
    /安排|计划|日程|流程|表|SOP|设置|清单|分类/.test(line) ||
    ['工作日', '周末', '每日', '每天', '平时'].includes(stripped);
  if (!isHeader) return null;
  if (/工作日|平时|周[一到五]|星期[一到五]/.test(line)) {
    return { type: 'weekdays', name: '工作日 SOP', daysOfWeek: [1, 2, 3, 4, 5] };
  }
  if (/周末|周六|周日|星期六|星期日/.test(line)) {
    return { type: 'weekends', name: '周末 SOP', daysOfWeek: [0, 6] };
  }
  if (/每日|每天|全部|通用|日常/.test(line)) {
    return { type: 'daily', name: '每日 SOP', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
  }
  if (/每月|月度/.test(line)) {
    return { type: 'monthly', name: '每月 SOP', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
  }
  return null;
}

const TASK_LINE = /[一-龥A-Za-z0-9]/; // 含中英文或数字即视为可能的任务行

export function parseSopText(text: string): ParsedSop[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: { section: Section; tasks: ParsedTask[] }[] = [];
  let current: { section: Section; tasks: ParsedTask[] } | null = null;

  for (const line of lines) {
    const sec = detectSection(line);
    if (sec) {
      // 若只是“我的工作日安排”这类纯标题，不重复创建同名 section
      if (current && current.section.type === sec.type && current.section.name === sec.name) {
        continue;
      }
      current = { section: sec, tasks: [] };
      sections.push(current);
      continue;
    }
    // 跳过明显不是任务的行（太短且不含动作词）——仍尽量解析
    if (!TASK_LINE.test(line)) continue;
    if (!current) {
      current = {
        section: { type: 'daily', name: '我的日常安排', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
        tasks: [],
      };
      sections.push(current);
    }
    const time = parseTime(line);
    const duration = parseDuration(line);
    const tod = parseTimeOfDay(line);
    const recurrence = parseRecurrence(line, current.section.type);
    const title = extractTitle(line, time, duration, tod);
    current.tasks.push({ title, scheduledTime: time, timeOfDay: tod, durationMinutes: duration, recurrence });
  }

  return sections
    .filter((s) => s.tasks.length > 0)
    .map((s) => ({
      name: s.section.name,
      type: s.section.type,
      daysOfWeek: s.section.daysOfWeek,
      monthlyRule: s.section.monthlyRule,
      tasks: s.tasks,
    }));
}

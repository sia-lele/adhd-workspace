import 'fake-indexeddb/auto';
import { sopDB, templateDB, instanceDB } from '../src/db/database';
import { ensureInstancesForDates } from '../src/lib/taskGenerator';
import { parseSopText } from '../src/lib/sopParser';
import { toLocalDate, addDays, timeToMinutes, getDayOfWeek, isWeekend } from '../src/lib/dateUtils';
import type { Sop, TaskTemplate } from '../src/types';

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name + (extra ? ` — ${extra}` : ''));
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

async function getInstance(date: string, title: string) {
  const all = await instanceDB.all();
  return all.find((i) => i.localDate === date && i.title === title);
}

async function main() {
  const base = toLocalDate(new Date('2026-10-14')); // 周三
  const today = base;
  const tomorrow = addDays(base, 1);
  const dayAfter = addDays(base, 2);
  const futureDate = addDays(base, 10); // 全新日期，避免与前面已生成的日期重叠
  const friday = addDays(base, 2); // 周五
  const saturday = addDays(base, 3);
  const sunday = addDays(base, 4);
  const monday = addDays(base, 5);

  // ---- 测试1：每日循环 ----
  console.log('\n[测试1] 每日循环任务跨天生成');
  const dailySop: Sop = { id: 's1', name: '每日', type: 'daily', daysOfWeek: [0,1,2,3,4,5,6], enabled: true, createdAt: 1, updatedAt: 1 };
  await sopDB.put(dailySop);
  const readTpl: TaskTemplate = { id: 't_read', sopId: 's1', title: '阅读', recurrence: { type: 'daily' }, scheduledTime: null, timeOfDay: null, durationMinutes: 15, firstStep: null, notes: null, pinned: false, lowEnergyPreferred: false, sortOrder: 0, enabled: true, createdAt: 1, updatedAt: 1 };
  await templateDB.put(readTpl);
  await ensureInstancesForDates([today, tomorrow]);
  const t1 = await getInstance(today, '阅读');
  const t2 = await getInstance(tomorrow, '阅读');
  ok('今天生成阅读实例', !!t1 && t1.status === 'todo');
  ok('明天生成独立的新实例', !!t2 && t2.id !== t1?.id && t2.status === 'todo');

  // ---- 测试2：工作日与周末 ----
  console.log('\n[测试2] 工作日 / 周末 SOP 正确生效');
  const wdSop: Sop = { id: 's_wd', name: '工作日', type: 'weekdays', daysOfWeek: [1,2,3,4,5], enabled: true, createdAt: 1, updatedAt: 1 };
  const weSop: Sop = { id: 's_we', name: '周末', type: 'weekends', daysOfWeek: [0,6], enabled: true, createdAt: 1, updatedAt: 1 };
  await sopDB.put(wdSop); await sopDB.put(weSop);
  const wdTpl: TaskTemplate = { id: 't_wd', sopId: 's_wd', title: '工作日任务', recurrence: { type: 'daily' }, scheduledTime: '08:00', timeOfDay: null, durationMinutes: null, firstStep: null, notes: null, pinned: false, lowEnergyPreferred: false, sortOrder: 0, enabled: true, createdAt: 1, updatedAt: 1 };
  const weTpl: TaskTemplate = { id: 't_we', sopId: 's_we', title: '周末任务', recurrence: { type: 'daily' }, scheduledTime: '10:00', timeOfDay: null, durationMinutes: null, firstStep: null, notes: null, pinned: false, lowEnergyPreferred: false, sortOrder: 0, enabled: true, createdAt: 1, updatedAt: 1 };
  await templateDB.put(wdTpl); await templateDB.put(weTpl);
  await ensureInstancesForDates([friday, saturday, sunday, monday]);
  ok('周五出现工作日任务', !!(await getInstance(friday, '工作日任务')));
  ok('周六不出现工作日任务', !(await getInstance(saturday, '工作日任务')));
  ok('周六出现周末任务', !!(await getInstance(saturday, '周末任务')));
  ok('周一出现工作日任务', !!(await getInstance(monday, '工作日任务')));

  // ---- 测试3：完成与撤销（生成层不覆盖） ----
  console.log('\n[测试3] 已完成实例不被覆盖 / 双状态独立');
  const inst = await getInstance(today, '阅读');
  if (inst) {
    inst.status = 'done'; inst.completedAt = Date.now();
    await instanceDB.put(inst);
  }
  await ensureInstancesForDates([today]); // 模拟刷新/重生成
  const after = await getInstance(today, '阅读');
  ok('刷新后已完成状态保留', !!after && after.status === 'done');
  const tomorrowInst = await getInstance(tomorrow, '阅读');
  ok('明天仍为未完成新实例', !!tomorrowInst && tomorrowInst.status === 'todo');

  // ---- 测试4：时间经过不惩罚 ----
  console.log('\n[测试4] 时间过去后任务不逾期/不变红');
  const late = await getInstance(today, '工作日任务');
  ok('8:00 任务在时间经过后仍保持 todo', !!late && late.status === 'todo' && late.scheduledTime === '08:00');

  // ---- 测试5：跨天未完成不堆积 ----
  console.log('\n[测试5] 昨天未完成不自动堆积到今天');
  const yest = addDays(base, -1);
  // 昨天的工作日任务（未完成）
  await ensureInstancesForDates([yest]);
  const yestTask = await getInstance(yest, '工作日任务');
  ok('昨天存在未完成工作日任务', !!yestTask && yestTask.status === 'todo');
  ok('今天的工作日任务与昨天是不同实例', !!late && late.id !== yestTask?.id);

  // ---- 测试6：无固定时间 ----
  console.log('\n[测试6] 无固定时间任务归入「随时可以做」');
  ok('阅读任务 scheduledTime 为 null', t1?.scheduledTime === null);
  ok('无固定时间排序值最大（排最后）', timeToMinutes(null) === 9999);

  // ---- 测试10：数据持久化（IndexedDB 读写） ----
  console.log('\n[测试10] IndexedDB 持久化读写');
  const all = await instanceDB.all();
  ok('实例已写入并可读取', all.length > 0);
  const reread = await instanceDB.all();
  ok('重复读取数据一致', reread.length === all.length);

  // ---- 测试11：修改重复任务不覆盖历史 ----
  console.log('\n[测试11] 修改模板不影响已完成历史');
  const t = await getInstance(today, '阅读');
  if (t) { t.status = 'done'; t.title = '阅读(旧)'; await instanceDB.put(t); }
  const updatedTpl: TaskTemplate = { ...readTpl, title: '阅读(新)' };
  await templateDB.put(updatedTpl);
  await ensureInstancesForDates([futureDate]);
  const oldDone = await getInstance(today, '阅读(旧)');
  const futureNew = await getInstance(futureDate, '阅读(新)');
  ok('已完成历史标题保留为旧值', !!oldDone && oldDone.status === 'done');
  ok('未来新实例采用新标题', !!futureNew && futureNew.status === 'todo');

  // ---- 测试13：自然语言解析 ----
  console.log('\n[测试13] 自然语言 SOP 解析');
  const sample = `我的工作日安排：
早上7:00起床。
7:30洗漱。
8:00吃早餐。
晚上19:00学习英语30分钟。
每天阅读15分钟。
睡前整理房间。

我的周末安排：
早上9:00起床。
周六下午学习英语1小时。
每月最后一个周日整理财务。`;
  const parsed = parseSopText(sample);
  ok('解析出 2 套 SOP', parsed.length === 2, `实际 ${parsed.length}`);
  const wd = parsed.find((p) => p.name.includes('工作日'));
  const we = parsed.find((p) => p.name.includes('周末'));
  ok('工作日 SOP 存在', !!wd);
  ok('周末 SOP 存在', !!we);
  const qichuang = wd?.tasks.find((t) => t.title === '起床');
  ok('起床识别时间 07:00', qichuang?.scheduledTime === '07:00');
  const english = wd?.tasks.find((t) => t.title === '学习英语');
  ok('学习英语识别 19:00', english?.scheduledTime === '19:00');
  ok('学习英语识别时长 30 分钟', english?.durationMinutes === 30);
  ok('学习英语为每天循环', english?.recurrence.type === 'daily');
  const read = wd?.tasks.find((t) => t.title === '阅读');
  ok('阅读无精确时间', read?.scheduledTime === null);
  ok('阅读时长 15 分钟', read?.durationMinutes === 15);
  const tidy = wd?.tasks.find((t) => t.title === '整理房间');
  ok('睡前整理房间仅识别为晚上时段(无精确时间)', tidy?.timeOfDay === 'evening' && tidy?.scheduledTime === null);
  const weEnglish = we?.tasks.find((t) => t.title === '学习英语');
  ok('周末学习英语为每周六', weEnglish?.recurrence.type === 'weekly' && JSON.stringify((weEnglish?.recurrence as any).daysOfWeek) === '[6]');
  ok('周末学习英语时长 1 小时=60分', weEnglish?.durationMinutes === 60);
  ok('周末学习英语为下午时段(无精确时间)', weEnglish?.timeOfDay === 'afternoon' && weEnglish?.scheduledTime === null);
  const finance = we?.tasks.find((t) => t.title === '整理财务');
  ok('每月最后一个周日为 monthly/lastWeek', finance?.recurrence.type === 'monthly' && (finance?.recurrence as any).lastWeek === true && (finance?.recurrence as any).weekday === 0);

  // ---- 模糊时间不会被擅自转换为精确时间 ----
  const fuzzy = parseSopText('我的工作日安排：\n晚上学习英语。');
  const fe = fuzzy[0]?.tasks[0];
  ok('「晚上学习英语」不产生精确时间', fe?.scheduledTime === null && fe?.timeOfDay === 'evening');

  console.log(`\n==== 结果：通过 ${pass} / 失败 ${fail} ====`);
  if (fail > 0) {
    console.log('失败项：\n - ' + fails.join('\n - '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { chromium } from 'playwright';

const URL = 'http://localhost:4178/';
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name, extra); }
  else { fail++; console.log('  ✗', name, extra); }
};

const sample = `我的工作日安排：
早上7:00起床。
晚上19:00学习英语30分钟。
每天阅读15分钟。`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

const readPoints = async () => {
  await page.getByRole('button', { name: '积分' }).last().click();
  await page.waitForTimeout(300);
  const v = (await page.locator('span.text-4xl').first().textContent())?.trim();
  return parseInt(v || '0', 10);
};
const goToday = async () => {
  await page.getByRole('button', { name: '今天' }).last().click();
  await page.waitForTimeout(200);
};

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const dbs = await window.indexedDB.databases();
    await Promise.all((dbs || []).map((d) => new Promise((res) => {
      if (!d.name) return res();
      const req = window.indexedDB.deleteDatabase(d.name);
      req.onsuccess = res; req.onerror = res; req.onblocked = res;
    })));
  });
  await page.reload({ waitUntil: 'networkidle' });

  await page.getByText('先把你的日常交给这里。').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: '输入我的 SOP' }).click();
  await page.getByRole('button', { name: '＋ 新建 SOP' }).click();
  await page.getByText('创建 SOP').waitFor();
  await page.locator('textarea').fill(sample);
  await page.getByRole('button', { name: '解析并预览' }).click();
  await page.getByRole('button', { name: '确认，帮我安排好' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '确认，帮我安排好' }).click();
  await page.getByRole('button', { name: '＋ 新建 SOP' }).waitFor({ timeout: 5000 });

  // 进入今天，完成第一个任务
  await goToday();
  const firstCircle = page.locator('button.task-circle:not(.done):not(.skipped)').first();
  await firstCircle.click();
  await page.waitForTimeout(400);

  const p1 = await readPoints();
  ok('打卡后积分 > 0', p1 > 0, 'points=' + p1);

  // 刷新，积分应保留
  await page.reload({ waitUntil: 'networkidle' });
  await goToday();
  const p2 = await readPoints();
  ok('刷新后积分仍然保留（无丢失）', p2 === p1, `before=${p1} after=${p2}`);

  // 刷新后该任务应仍是已完成状态
  await goToday();
  const doneCount = await page.locator('button.task-circle.done').count();
  ok('刷新后任务仍显示已完成', doneCount >= 1, 'done=' + doneCount);

  // 再完成第二个任务，积分应累加（含难度加权），而非丢失或重复
  const secondCircle = page.locator('button.task-circle:not(.done):not(.skipped)').first();
  await secondCircle.click();
  await page.waitForTimeout(400);
  const p3 = await readPoints();
  ok('再打卡后积分正确累加（无丢失/无重复）', p3 > p1, `p1=${p1} p3=${p3}`);

  // 再次刷新，积分仍是累加值
  await page.reload({ waitUntil: 'networkidle' });
  await goToday();
  const p4 = await readPoints();
  ok('二次刷新后积分仍正确保留', p4 === p3, `before=${p3} after=${p4}`);

  // 积分页历史记录里应有加分流水
  await goToday();
  await page.getByRole('button', { name: '积分' }).last().click();
  await page.waitForTimeout(300);
  const earnCount = await page.getByText(/完成任务「/).count();
  ok('积分记录中存在加分流水', earnCount >= 2, 'count=' + earnCount);

} catch (e) {
  fail++;
  console.log('  ✗ 异常：', e.message);
}

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
if (errs.length) console.log('控制台错误：', errs.join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);

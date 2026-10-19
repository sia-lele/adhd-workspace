import { chromium } from 'playwright';
const URL = 'http://localhost:4178/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x); } };

const readIDB = () => page.evaluate(async () => {
  const open = (name) => new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const getAll = (db, store) => new Promise((res, rej) => { const t = db.transaction(store, 'readonly'); const r = t.objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await open('adhd-executive-workspace');
  const insts = await getAll(db, 'instances');
  const pts = await new Promise((res) => { const t = db.transaction('points', 'readonly'); const r = t.objectStore('points').get('main'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  return { instDone: insts.filter((i) => i.status === 'done').map((i) => i.title), pointsTotal: pts?.total, historyLen: pts?.history?.length };
});
const readPointsUI = async () => (await page.locator('span.text-4xl').first().textContent())?.trim();
async function goTodayWeekday() {
  await page.getByRole('button', { name: '今天' }).last().click();
  await page.waitForTimeout(120);
  const dow = new Date().getDay();
  let off = (1 - dow + 7) % 7; if (off === 0) off = 7;
  for (let i = 0; i < off; i++) { await page.getByRole('button', { name: '›' }).click(); await page.waitForTimeout(25); }
  await page.waitForTimeout(150);
}
const circleFor = (title) => page.locator('button.task-title', { hasText: title }).first().locator('xpath=preceding-sibling::*[1]');

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(async () => { const dbs = await window.indexedDB.databases(); await Promise.all((dbs || []).map((d) => new Promise((res) => { if (!d.name) return res(); const r = indexedDB.deleteDatabase(d.name); r.onsuccess = res; r.onerror = res; r.onblocked = res; }))); });
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('先把你的日常交给这里。').waitFor({ timeout: 8000 });
await page.getByRole('button', { name: '输入我的 SOP' }).click();
await page.getByRole('button', { name: '＋ 新建 SOP' }).click();
await page.getByText('创建 SOP').waitFor();
await page.locator('textarea').fill('我的工作日安排：\n每天喝水一杯。\n每天阅读15分钟。');
await page.getByRole('button', { name: '解析并预览' }).click();
await page.getByRole('button', { name: '确认，帮我安排好' }).waitFor({ timeout: 5000 });
await page.getByRole('button', { name: '确认，帮我安排好' }).click();
await page.getByRole('button', { name: '＋ 新建 SOP' }).waitFor({ timeout: 5000 });
await goTodayWeekday();
await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
await page.waitForTimeout(1500);

console.log('\n== 场景1：完成一个任务，立即（未刷新）应写入 IndexedDB ==');
await circleFor('喝水一杯').click();
await page.waitForTimeout(600);
let idb = await readIDB();
ok('完成后 IndexedDB 已记录「喝水一杯」为 done', idb.instDone.includes('喝水一杯'), JSON.stringify(idb));
await page.getByRole('button', { name: '积分' }).last().click();
await page.locator('span.text-4xl').first().waitFor({ timeout: 5000 });
ok('积分页显示 +1', (await readPointsUI()) === '1');
let hist = await page.getByText(/完成任务「喝水一杯」/).count();
ok('积分流水含该完成记录', hist > 0);

console.log('\n== 场景2：导航 本周→今日（无刷新），完成状态仍在 ==');
await goTodayWeekday();
await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
await page.getByRole('button', { name: '本周' }).last().click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: '今天' }).last().click();
await page.waitForTimeout(500);
idb = await readIDB();
ok('导航后 IndexedDB 仍记录 done', idb.instDone.includes('喝水一杯'), JSON.stringify(idb));

console.log('\n== 场景3：刷新（模拟“过一段时间再看”）==');
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: '今天' }).last().waitFor({ timeout: 5000 });
await goTodayWeekday();
await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
await page.waitForTimeout(500);
const doneAfterReload = await page.locator('button.task-circle.done').count();
ok('刷新后「喝水一杯」仍显示已完成', doneAfterReload >= 1, 'done=' + doneAfterReload);
idb = await readIDB();
ok('刷新后 IndexedDB 仍记录 done', idb.instDone.includes('喝水一杯'), JSON.stringify(idb));
await page.getByRole('button', { name: '积分' }).last().click();
await page.locator('span.text-4xl').first().waitFor({ timeout: 5000 });
ok('刷新后积分仍为 1（未丢失/未重复）', (await readPointsUI()) === '1', 'points=' + (await readPointsUI()));

console.log('\n== 场景4：重复点击已完成的任务不应再加分（撤销/再完成净 0）==');
await goTodayWeekday();
await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
await circleFor('喝水一杯').click(); // 撤销
await page.waitForTimeout(300);
await circleFor('喝水一杯').click(); // 再完成
await page.waitForTimeout(400);
await page.getByRole('button', { name: '积分' }).last().click();
await page.locator('span.text-4xl').first().waitFor({ timeout: 5000 });
ok('撤销后再完成，积分仍为 1', (await readPointsUI()) === '1', 'points=' + (await readPointsUI()));

console.log('\n== 控制台错误 ==');
ok('无控制台/页面错误', errors.length === 0, errors.join(' | '));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
await browser.close();
process.exit(fail ? 1 : 0);

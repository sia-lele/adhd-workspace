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

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  // 清空数据库，从全新状态开始
  await page.evaluate(async () => {
    const dbs = await window.indexedDB.databases();
    await Promise.all((dbs || []).map((d) => new Promise((res) => {
      if (!d.name) return res();
      const req = window.indexedDB.deleteDatabase(d.name);
      req.onsuccess = res; req.onerror = res; req.onblocked = res;
    })));
  });
  await page.reload({ waitUntil: 'networkidle' });

  // 欢迎页 → 输入 SOP
  await page.getByText('先把你的日常交给这里。').waitFor({ timeout: 8000 });
  await page.getByRole('button', { name: '输入我的 SOP' }).click();
  await page.getByRole('button', { name: '＋ 新建 SOP' }).click();
  await page.getByText('创建 SOP').waitFor();
  await page.locator('textarea').fill(sample);
  await page.getByRole('button', { name: '解析并预览' }).click();
  await page.getByRole('button', { name: '确认，帮我安排好' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '确认，帮我安排好' }).click();
  await page.getByRole('button', { name: '＋ 新建 SOP' }).waitFor({ timeout: 5000 });

  // 注入 20 条加分记录到 points 库
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const x = indexedDB.open('adhd-executive-workspace'); x.onsuccess = () => r(x.result); });
    const tx = db.transaction('points', 'readwrite');
    const store = tx.objectStore('points');
    const rec = await new Promise((r) => { const g = store.get('main'); g.onsuccess = () => r(g.result); });
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 20; i++) {
      history.push({ id: 'test-pe-' + i, type: 'earn', amount: (i % 3 === 0 ? 5 : 3), reason: '测试任务' + i, at: now - i * 60000, hard: 0 });
    }
    const merged = rec
      ? { ...rec, history: [...history, ...(rec.history || [])].slice(0, 300) }
      : { id: 'main', total: 100, earned: 100, hardEarned: 0, prizes: [], history, targetPrizeId: null };
    await new Promise((r) => { const p = store.put(merged); p.onsuccess = () => r(); });
    await new Promise((r) => { tx.oncomplete = () => r(); });
  });

  // 重新加载，进入积分页
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '积分' }).last().click();
  await page.waitForTimeout(500);

  // 全部记录渲染（无 8 条截断）
  const recordInfo = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')];
    const recordCard = cards.find((c) => c.querySelector('h3') && c.querySelector('h3').textContent.includes('积分记录'));
    const items = recordCard ? recordCard.querySelectorAll('li').length : 0;
    return { items };
  });
  ok('渲染全部 20 条（已移除 8 条截断）', recordInfo.items >= 20, 'items=' + recordInfo.items);
  ok('标题显示「共 20 条」', await page.evaluate(() => document.body.innerText.includes('共 20 条')));

  // 整个页面可滚动（不再被全局 height:100% 锁死）
  const pageScroll = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return { scrollHeight: el.scrollHeight, innerHeight: window.innerHeight, scrollable: el.scrollHeight > window.innerHeight + 10 };
  });
  ok('页面本身可滚动（scrollHeight > 视口）', pageScroll.scrollable, JSON.stringify(pageScroll));

  // 模拟上滑到底，确认能滚动到更早的记录
  const reachedBottom = await page.evaluate(async () => {
    const el = document.scrollingElement || document.documentElement;
    const before = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    await new Promise((r) => setTimeout(r, 100));
    return el.scrollTop > before;
  });
  ok('上滑可定位到更早的积分记录', reachedBottom);

} catch (e) {
  fail++;
  console.log('  ✗ 异常：', e.message);
}

console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
if (errs.length) console.log('控制台错误：', errs.join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);

import { chromium } from 'playwright';

const URL = 'http://localhost:4178/';
const errors = [];
let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

const sample = `我的工作日安排：
早上7:00起床。
晚上19:00学习英语30分钟。
每天阅读15分钟。
睡前整理房间。

我的周末安排：
周六下午学习英语1小时。
每月最后一个周日整理财务。`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // 手机尺寸
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('dialog', (d) => d.accept()); // 自动接受 confirm 弹窗（删除确认等）

// 统一导航到「今日」并确保落在工作日（下一个周一），避免运行当天是周末时工作日 SOP 任务不生成导致断言不稳
async function goTodayWeekday() {
  await page.getByRole('button', { name: '今天' }).last().click();
  await page.waitForTimeout(120);
  const dow = new Date().getDay(); // 0=周日..6=周六
  let off = (1 - dow + 7) % 7; if (off === 0) off = 7; // 推进到下一个周一
  for (let i = 0; i < off; i++) { await page.getByRole('button', { name: '›' }).click(); await page.waitForTimeout(25); }
  await page.waitForTimeout(150);
}

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  // 清空本地数据库，保证每次运行从全新状态开始（避免跨运行残留数据干扰断言）
  await page.evaluate(async () => {
    try {
      const dbs = await window.indexedDB.databases();
      await Promise.all((dbs || []).map((d) => new Promise((res) => {
        if (!d.name) return res();
        const req = window.indexedDB.deleteDatabase(d.name);
        req.onsuccess = res; req.onerror = res; req.onblocked = res;
      })));
    } catch (_) {}
  });
  await page.reload({ waitUntil: 'networkidle' });

  // 欢迎页
  await page.getByText('先把你的日常交给这里。').waitFor({ timeout: 8000 });
  ok('欢迎引导页显示', true);
  await page.getByRole('button', { name: '输入我的 SOP' }).click();

  // 进入 SOP 列表后，打开新建编辑器
  await page.getByRole('button', { name: '＋ 新建 SOP' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '＋ 新建 SOP' }).click();

  // SOP 页：自然语言输入
  await page.getByText('创建 SOP').waitFor();
  const ta = page.locator('textarea');
  await ta.fill(sample);
  await page.getByRole('button', { name: '解析并预览' }).click();

  // 预览出现（解析后显示确认按钮）
  await page.getByRole('button', { name: '确认，帮我安排好' }).waitFor({ timeout: 5000 });
  ok('NLP 解析并生成预览', true);
  // 校验识别字段：阅读（每天/15分钟）、学习英语（19:00/30分钟）
  const inputVals = await page.locator('input').evaluateAll((els) => els.map((e) => e.value));
  console.log('  DEBUG inputs:', JSON.stringify(inputVals));
  ok('预览识别「阅读」任务', inputVals.includes('阅读'));
  ok('预览识别「学习英语」任务', inputVals.includes('学习英语'));

  await page.getByRole('button', { name: '确认，帮我安排好' }).click();

  // 回到 SOP 列表（等待列表视图的「新建」按钮出现）
  await page.getByRole('button', { name: '＋ 新建 SOP' }).waitFor({ timeout: 5000 });
  await page.getByText('工作日 SOP').first().waitFor({ timeout: 5000 });
  const sopCards = (await page.getByText('工作日 SOP').count()) + (await page.getByText('周末 SOP').count());
  ok('保存后生成 SOP 卡片', sopCards >= 2, 'count=' + sopCards);

  // ---- SOP 改名 + 增删小任务 ----
  // 改名按钮在卡片头部常驻，无需先展开
  const wkCard = page.locator('div.card', { hasText: '工作日 SOP' }).first();
  await wkCard.getByRole('button', { name: '改名' }).click();
  const nameInput = page.locator('div.card input').first();
  await nameInput.fill('我的工作日例行');
  await nameInput.press('Enter');
  await page.waitForTimeout(300);
  ok('SOP 名字可重命名（行内编辑保存）', (await page.getByText('我的工作日例行', { exact: true }).count()) > 0);

  const wkCard2 = page.locator('div.card', { hasText: '我的工作日例行' }).first();
  await wkCard2.getByText('我的工作日例行', { exact: true }).first().click(); // 展开看小任务
  await page.waitForTimeout(200);
  await wkCard2.getByRole('button', { name: '＋ 添加任务' }).click();
  await wkCard2.locator('input').first().fill('喝一杯温水');
  await wkCard2.getByRole('button', { name: '添加', exact: true }).click();
  await page.waitForTimeout(300);
  ok('SOP 内可添加小任务', (await page.getByText('喝一杯温水', { exact: true }).count()) > 0);

  const taskRow = wkCard2.locator('div', { has: page.getByText('喝一杯温水', { exact: true }) }).last();
  await taskRow.locator('button[title="删除这个任务"]').first().click();
  await page.waitForTimeout(300);
  ok('SOP 内可删除小任务（确认后移除）', (await page.getByText('喝一杯温水', { exact: true }).count()) === 0);

  // 进入今天
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  ok('今日页面加载', true);

  // 统计当前 TO DO 圆圈数量
  const todoBefore = await page.locator('button.task-circle:not(.done):not(.skipped)').count();
  ok('今日存在待办任务', todoBefore > 0, 'todo=' + todoBefore);

  // 点击第一个圆圈 -> 完成（移动到 DONE）
  const firstCircle = page.locator('button.task-circle:not(.done):not(.skipped)').first();
  await firstCircle.click();
  await page.waitForTimeout(400);
  const doneAfter = await page.locator('button.task-circle.done').count();
  ok('点击后任务进入 DONE', doneAfter >= 1, 'done=' + doneAfter);

  // 再次点击 -> 撤销回 TO DO
  const doneCircle = page.locator('button.task-circle.done').first();
  await doneCircle.click();
  await page.waitForTimeout(400);
  const todoAfter = await page.locator('button.task-circle:not(.done):not(.skipped)').count();
  ok('再次点击撤销回 TO DO', todoAfter >= todoBefore, 'todo=' + todoAfter);

  // ---- 积分功能 ----
  const readPoints = async () => (await page.locator('span.text-4xl').first().textContent())?.trim();
  const goPoints = async () => {
    await page.getByRole('button', { name: '积分' }).last().click();
    await page.locator('span.text-4xl').first().waitFor({ timeout: 5000 });
  };
  // 在今日页按标题定位某个任务的圆圈（TaskCircle 紧跟在标题按钮之前）
  const circleFor = (title) =>
    page.locator('button.task-title', { hasText: title })
      .first()
      .locator('xpath=preceding-sibling::*[1]');
  await goPoints();
  ok('积分页加载（含规则说明）', true);
  ok('初始积分为 0（完成又撤销，净 0 分）', (await readPoints()) === '0', 'points=' + (await readPoints()));

  // 完成一个任务 → +1
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await page.locator('button.task-circle:not(.done):not(.skipped)').first().click();
  await page.waitForTimeout(250);
  ok('完成任务弹出 +1 ⭐ 庆祝动画', (await page.locator('[data-testid="celebrate"]').count()) > 0);
  await page.waitForTimeout(200);
  await goPoints();
  ok('完成任务后积分 +1', (await readPoints()) === '1', 'points=' + (await readPoints()));
  ok('积分记录显示完成任务', (await page.getByText(/完成任务「/).count()) > 0);

  // 添加奖品 → 兑换 → 扣分
  await page.getByRole('button', { name: '＋ 添加奖品' }).click();
  await page.getByPlaceholder('奖品名称，例如：看一集喜欢的剧').fill('小奖励');
  await page.getByPlaceholder('所需积分').fill('1');
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.waitForTimeout(300);
  const redeemBtn = page.getByRole('button', { name: '兑换', exact: true });
  ok('奖品已入池且积分足够可兑换', (await redeemBtn.count()) > 0);
  await redeemBtn.first().click();
  await page.waitForTimeout(400);
  ok('兑换成功提示出现', (await page.getByText('已兑换「小奖励」').count()) > 0);
  ok('兑换后积分扣减为 0', (await readPoints()) === '0', 'points=' + (await readPoints()));

  // 再完成 → 加分，撤销 → 扣回（防刷分）。用「整理房间」这一简单任务，分值确定为 1
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await goPoints();
  const p0 = parseInt((await readPoints()) || '0', 10);
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await circleFor('整理房间').click();
  await page.waitForTimeout(400);
  await goPoints();
  const p1 = parseInt((await readPoints()) || '0', 10);
  ok('完成简单任务积分 +1', p1 === p0 + 1, `p0=${p0} p1=${p1}`);
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await circleFor('整理房间').click(); // 再点一次 = 撤销
  await page.waitForTimeout(400);
  await goPoints();
  const p2 = parseInt((await readPoints()) || '0', 10);
  ok('撤销完成后积分 -1（防刷分）', p2 === p0, `p0=${p0} p2=${p2}`);
  // 回到今天页，继续后续测试
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });

  // 低能量模式
  await page.getByRole('button', { name: /低能量模式/ }).click();
  await page.getByText('今天先做一点点就好。').waitFor({ timeout: 3000 });
  ok('低能量模式开启并显示精简视图', true);
  await page.getByRole('button', { name: /低能量模式/ }).click();
  await page.waitForTimeout(300);

  // 帮我开始
  await page.getByRole('button', { name: '帮我开始' }).click();
  await page.getByText('现在可以做').waitFor({ timeout: 3000 });
  ok('「帮我开始」弹出单任务建议', true);
  // 换一件
  if (await page.getByRole('button', { name: '换一件' }).count()) {
    await page.getByRole('button', { name: '换一件' }).click();
    ok('可「换一件」', true);
  }
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.getByText('正在专注').waitFor({ timeout: 3000 });
  ok('进入专注模式', true);
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.waitForTimeout(400);
  ok('退出专注模式回到今日', (await page.getByText('正在专注').count()) === 0);

  // 持久化：刷新后数据仍在
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '今天' }).last().waitFor({ timeout: 5000 });
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(500);
  const todoPersist = await page.locator('button.task-circle:not(.done):not(.skipped)').count();
  ok('刷新后任务持久化（IndexedDB）', todoPersist > 0, 'todo=' + todoPersist);

  // 单任务删除：点任务上的 × → 确认「这次」，仅移除那一个，其余保留
  const beforeDel = await page.locator('button.task-circle').count();
  await page.getByRole('button', { name: '删除这一个任务' }).first().click();
  await page.waitForTimeout(200);
  let confirmBtn = page.getByRole('button', { name: '删除今天' });
  ok('点 × 后出现单个删除确认', (await confirmBtn.count()) > 0);
  await confirmBtn.first().click();
  await page.waitForTimeout(400);
  const afterDel = await page.locator('button.task-circle').count();
  ok('单任务删除仅移除那一个（其余保留）', afterDel === beforeDel - 1, `before=${beforeDel} after=${afterDel}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '今天' }).last().waitFor({ timeout: 5000 });
  await goTodayWeekday();
  await page.waitForTimeout(500);
  const afterDelReload = await page.locator('button.task-circle').count();
  ok('单任务删除后刷新不再复活', afterDelReload === afterDel, `reload=${afterDelReload}`);

  // 清空今天的任务（两步确认），且刷新后不复活
  await page.getByRole('button', { name: '清空今天的全部任务' }).click();
  await page.getByRole('button', { name: '确认清空' }).click();
  await page.waitForTimeout(400);
  const afterClear = await page.locator('button.task-circle').count();
  ok('清空今天后任务卡片消失', afterClear === 0, 'circle=' + afterClear);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '今天' }).last().waitFor({ timeout: 5000 });
  await goTodayWeekday();
  await page.waitForTimeout(500);
  const afterReload = await page.locator('button.task-circle').count();
  ok('清空后刷新不再自动复活', afterReload === 0, 'circle=' + afterReload);

  // 本周网格：点击格子变色，再点消色
  await page.getByRole('button', { name: '本周' }).last().click();
  await page.getByText('本周').first().waitFor({ timeout: 5000 });

  // 单任务删除入口：每行右侧 × 可弹出删除选项
  const rowDel = page.getByRole('button', { name: '删除这个任务' }).first();
  ok('本周每行有单独删除按钮', (await rowDel.count()) > 0);
  await rowDel.click();
  await page.waitForTimeout(200);
  const rowDelPopover = page.getByText('只删本周这几天');
  ok('点 × 弹出单行删除选项', (await rowDelPopover.count()) > 0);
  await page.getByRole('button', { name: '取消' }).first().click();
  await page.waitForTimeout(200);

  const cell = page.locator('button.week-cell:not([disabled])').first();
  await cell.waitFor({ timeout: 5000 });
  const before = await cell.evaluate((el) => el.style.backgroundColor || '');
  ok('待办格子有浅色底（非完成色）', before.trim() !== '', 'bg=' + JSON.stringify(before));
  await cell.click();
  await page.waitForTimeout(300);
  const filled = await cell.evaluate((el) => el.style.backgroundColor || '');
  ok('点击后格子变为完成深填充色', filled.trim() !== '' && filled !== before, 'before=' + before + ' filled=' + filled);
  await cell.click();
  await page.waitForTimeout(300);
  const after = await cell.evaluate((el) => el.style.backgroundColor || '');
  ok('再次点击后颜色恢复为待办浅色（撤销）', after === before, 'after=' + after + ' before=' + before);

  // 长按拖动排序 SOP
  await page.getByRole('button', { name: '我的 SOP' }).last().click();
  await page.getByText('长按卡片可上下拖动').waitFor({ timeout: 5000 });
  ok('SOP 页显示长按排序提示', true);

  const cardBox = async (text) => (await page.locator('div.card', { hasText: text }).first().boundingBox());
  const aBefore = await cardBox('我的工作日例行');
  const bBefore = await cardBox('周末 SOP');
  ok('存在两个 SOP 卡片且工作日在前', !!aBefore && !!bBefore && aBefore.y < bBefore.y,
    `aY=${aBefore?.y} bY=${bBefore?.y}`);

  // 模拟长按第一张卡并向下拖到第二张之后
  const cx = aBefore.x + aBefore.width / 2;
  const cy = aBefore.y + aBefore.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(520); // 超过长按阈值（420ms）
  const targetY = bBefore.y + bBefore.height + 40;
  await page.mouse.move(cx, targetY, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const aAfter = await cardBox('我的工作日例行');
  ok('长按拖动后卡片位置下移（顺序改变）', !!aAfter && aAfter.y > aBefore.y + 10,
    `beforeY=${aBefore.y} afterY=${aAfter?.y}`);

  // 刷新后顺序保持（sortOrder 已持久化）
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '我的 SOP' }).last().click();
  await page.getByText('长按卡片可上下拖动').waitFor({ timeout: 5000 });
  const aReload = await cardBox('我的工作日例行');
  const bReload = await cardBox('周末 SOP');
  ok('刷新后 SOP 顺序持久化（工作日已排到周末之后）', !!aReload && !!bReload && aReload.y > bReload.y,
    `aY=${aReload?.y} bY=${bReload?.y}`);

  // ---- SOP 内小任务长按拖动排序 ----
  const expandSop = async (name) => {
    const card = page.locator('div.card', { hasText: name }).first();
    await card.getByText(name, { exact: true }).first().click();
    await page.waitForTimeout(250);
  };
  const taskBox = async (title) => (await page.locator('div[data-task-id]', { hasText: title }).first().boundingBox());

  await expandSop('我的工作日例行');
  const t1 = await taskBox('起床');
  const t2 = await taskBox('学习英语');
  ok('SOP 内存在可排序的小任务', !!t1 && !!t2 && t1.y < t2.y, `t1Y=${t1?.y} t2Y=${t2?.y}`);

  const row1 = page.locator('div[data-task-id]', { hasText: '起床' }).first();
  const b1 = await row1.boundingBox();
  const tCx = b1.x + b1.width / 2;
  const tCy = b1.y + b1.height / 2;
  await page.mouse.move(tCx, tCy);
  await page.mouse.down();
  await page.waitForTimeout(520); // 超过长按阈值
  const tTargetY = t2.y + b1.height + 15;
  await page.mouse.move(tCx, tTargetY, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const t1After = await taskBox('起床');
  ok('长按拖动后小任务位置下移（顺序改变）', !!t1After && t1After.y > t1.y + 10, `beforeY=${t1?.y} afterY=${t1After?.y}`);

  // 刷新后保持
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '我的 SOP' }).last().click();
  await page.getByText('长按卡片可上下拖动').waitFor({ timeout: 5000 });
  await expandSop('我的工作日例行');
  const t1Reload = await taskBox('起床');
  ok('刷新后 SOP 内小任务顺序持久化', !!t1Reload && t1Reload.y > t1.y + 10, `reloadY=${t1Reload?.y}`);

  // 验证小任务拖动手柄已禁用浏览器手势接管（移动端长按拖动不再被中断）
  const handleRow = page.locator('[data-drag-handle="task"]', { hasText: '起床' }).first();
  const handleStyle = await handleRow.evaluate((el) => getComputedStyle(el).touchAction);
  ok('小任务行禁用浏览器手势接管（touch-action:none，避免拖动被中断）', handleStyle === 'none', 'touchAction=' + handleStyle);

  // ---- 恢复被删的某天（从模板 pausedDates 移除并重新生成实例）----
  await page.getByRole('button', { name: '本周' }).last().click();
  await page.getByText('本周').first().waitFor({ timeout: 5000 });

  // 「阅读」是每天循环，整周都会出现。先删掉整周以制造 pausedDates
  const readRow = page.locator('div.grid.week-grid', { hasText: '阅读' }).first();
  await readRow.waitFor({ timeout: 5000 });
  await readRow.getByRole('button', { name: '删除这个任务' }).first().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '只删本周这几天' }).click();
  await page.waitForTimeout(400);
  const readRowGone = await page.locator('div.grid.week-grid', { hasText: '阅读' }).count();
  ok('删除整周后「阅读」行从本周消失（写入 pausedDates）', readRowGone === 0, 'count=' + readRowGone);

  // 切到下一週：阅读仍按规则出现；打开详情看恢复入口
  await page.locator('button[aria-label="下一周"]').click();
  await page.waitForTimeout(300);
  const readRowNext = page.locator('div.grid.week-grid', { hasText: '阅读' }).first();
  await readRowNext.waitFor({ timeout: 5000 });
  await readRowNext.getByText('阅读', { exact: true }).first().click();
  await page.getByText('任务详情').first().waitFor({ timeout: 5000 });
  const restoreBtns = page.locator('button', { hasText: '· 恢复' });
  const restoreCount = await restoreBtns.count();
  ok('详情里显示被清空的某天（恢复入口）', restoreCount > 0, 'count=' + restoreCount);

  // 恢复第一个被清空的日期
  await restoreBtns.first().click();
  await page.waitForTimeout(500);
  const restoreCountAfter = await page.locator('button', { hasText: '· 恢复' }).count();
  ok('点击恢复后该天从 pausedDates 移除（入口减少）', restoreCountAfter === restoreCount - 1,
    `before=${restoreCount} after=${restoreCountAfter}`);

  // 关闭抽屉，回到本周，确认那一天重新生成了实例
  await page.locator('div.fixed.inset-0').first().click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '本周' }).last().click();
  await page.waitForTimeout(500);
  const readRowBack = page.locator('div.grid.week-grid', { hasText: '阅读' }).first();
  let enabledInWeek = 0;
  if (await readRowBack.count()) {
    enabledInWeek = await readRowBack.locator('button.week-cell:not([disabled])').count();
  }
  ok('恢复后本周重新出现「阅读」且那天有可打卡格子', enabledInWeek > 0, 'enabled=' + enabledInWeek);

  // 清理「阅读」的 pausedDates，避免前面删除/恢复操作残留的暂停日期（与持久化修复无关，
  // 仅让下面的难度加权测试在干净的日期上验证，不被暂停状态干扰）
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const x = indexedDB.open('adhd-executive-workspace'); x.onsuccess = () => r(x.result); x.onerror = () => r(null); });
    if (!db) return;
    const tx = db.transaction('templates', 'readwrite');
    const store = tx.objectStore('templates');
    const all = await new Promise((r) => { const g = store.getAll(); g.onsuccess = () => r(g.result); });
    for (const t of all) { if (t.title && t.title.includes('阅读') && t.pausedDates) { t.pausedDates = undefined; store.put(t); } }
    await new Promise((r) => { tx.oncomplete = r; });
  });
  await page.reload({ waitUntil: 'networkidle' });

  // ---- 难度加权：把「阅读」设为困难，完成后应得 5 分 ----
  // 在今日页操作：打开的就是今天那个实例，完成的也是它，避免周格子索引错位
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  const readTitle = page.locator('button.task-title', { hasText: '阅读' }).first();
  await readTitle.waitFor({ timeout: 5000 });
  await readTitle.click();
  await page.getByText('任务详情').first().waitFor({ timeout: 5000 });
  ok('详情里可按难度加权（有简单/中等/困难三档）',
    (await page.getByRole('button', { name: '简单' }).count()) > 0 &&
    (await page.getByRole('button', { name: '中等' }).count()) > 0 &&
    (await page.getByRole('button', { name: '困难' }).count()) > 0);
  await page.getByRole('button', { name: '困难' }).first().click();
  await page.getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(400); // 保存后抽屉自动关闭，回到今日

  await goPoints();
  const ptsBeforeHard = parseInt((await readPoints()) || '0', 10);
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await circleFor('阅读').click();
  await page.waitForTimeout(250);
  const hardCelebrate = await page.locator('[data-testid="celebrate"]').first().textContent();
  ok('困难任务完成弹出 +5 ⭐ 动画', (hardCelebrate || '').includes('+5'), 'text=' + hardCelebrate);
  await page.waitForTimeout(200);
  await goPoints();
  const ptsAfterHard = parseInt((await readPoints()) || '0', 10);
  ok('困难任务完成后积分 +5（难度加权生效）', ptsAfterHard === ptsBeforeHard + 5,
    `before=${ptsBeforeHard} after=${ptsAfterHard}`);
  ok('积分记录标注本次加分值', (await page.getByText(/完成任务「阅读」\+5/).count()) > 0);

  // 撤销应扣回同样的 5 分
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await circleFor('阅读').click();
  await page.waitForTimeout(300);
  await goPoints();
  const ptsUndoHard = parseInt((await readPoints()) || '0', 10);
  ok('撤销困难任务扣回 5 分', ptsUndoHard === ptsBeforeHard, `after=${ptsUndoHard} expect=${ptsBeforeHard}`);

  // 改难度后「不点保存」也应立刻生效（避免选完直接关掉抽屉却没变）
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await page.locator('button.task-title', { hasText: '阅读' }).first().click();
  await page.getByText('任务详情').first().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '中等' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('div.fixed.inset-0.z-40').first().click({ position: { x: 4, y: 4 } }); // 不点保存，直接关闭
  await page.waitForTimeout(300);
  await goPoints();
  const ptsB = parseInt((await readPoints()) || '0', 10);
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await circleFor('阅读').click();
  await page.waitForTimeout(300);
  await goPoints();
  const ptsC = parseInt((await readPoints()) || '0', 10);
  ok('改难度不点保存也立刻生效（中等 +3）', ptsC === ptsB + 3, `before=${ptsB} after=${ptsC}`);

  // 积分页显示难度对照说明
  ok('积分页显示难度加权说明', (await page.getByText('按难度加权').count()) > 0);

  // ---- 积分记录逐条撤回 ----
  await goPoints();
  const pA2 = parseInt((await readPoints()) || '0', 10);
  const firstUndo = page.getByRole('button', { name: '撤回' }).first();
  const undoBefore = await firstUndo.count();
  ok('加分记录旁出现「撤回」按钮', undoBefore > 0, 'count=' + undoBefore);
  if (undoBefore > 0) {
    const liSig = (await firstUndo.locator('xpath=ancestor::li').innerText()).split('\n')[0];
    await firstUndo.click();
    await page.waitForTimeout(150);
    const pB2 = parseInt((await readPoints()) || '0', 10);
    ok('点击撤回后积分减少', pB2 < pA2, `pA=${pA2} pB=${pB2}`);
    ok('撤回后该条记录从列表消失', (await page.getByText(liSig, { exact: true }).count()) === 0, liSig);
  }

  // ---- 习惯（独立任务，不在任何 SOP 里，默认每天）----
  await goTodayWeekday();
  await page.getByText('帮我开始').first().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: '🌱 习惯' }).click();
  await page.getByText('养成一个习惯 🌱').waitFor({ timeout: 4000 });
  await page.getByPlaceholder('例如：喝一杯温水').fill('每天喝水');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  ok('新建习惯出现在今日「习惯」区', (await page.getByText('习惯', { exact: true }).count()) > 0);
  ok('习惯任务已加入今日列表', (await page.getByText('每天喝水').count()) > 0);

  // ---- 成就感计数：今天 / 本周完成件数 ----
  const readToday = async () => parseInt((await page.getByTestId('stat-today').textContent())?.trim() || '0', 10);
  const readWeek = async () => parseInt((await page.getByTestId('stat-week').textContent())?.trim() || '0', 10);
  const td0 = await readToday();
  await circleFor('每天喝水').click();
  await page.waitForTimeout(300);
  const td1 = await readToday();
  ok('完成习惯后「今天完成」计数 +1', td1 === td0 + 1, `td0=${td0} td1=${td1}`);
  ok('「本周完成」计数同步存在', (await readWeek()) >= td1);

  // ---- 目标 / 里程碑 + 困难分门槛 ----
  await goPoints();
  const curPts = parseInt((await readPoints()) || '0', 10);
  await page.getByRole('button', { name: '＋ 添加奖品' }).click();
  await page.getByPlaceholder('奖品名称，例如：看一集喜欢的剧').fill('出去旅游');
  await page.getByPlaceholder('所需积分').fill(String(Math.max(1, curPts)));
  await page.getByRole('button', { name: '🏆 里程碑' }).click();
  await page.getByPlaceholder('60').fill('100'); // 困难分占比要求 100%，当前必不达标
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.waitForTimeout(300);
  ok('里程碑奖品带「🏆 里程碑」徽标', (await page.getByText('🏆 里程碑').count()) > 0);

  // 设为当前目标，验证进度卡
  await page.locator('select').first().selectOption({ index: 1 });
  await page.waitForTimeout(200);
  ok('目标卡出现「我的目标」', (await page.getByText('我的目标').count()) > 0);
  ok('目标卡显示兑换进度', (await page.getByText(/还差 .* 分就到|分够了/).count()) > 0);
  ok('目标卡提示需多做困难任务解锁', (await page.getByText(/再多做一些中等\/困难的任务/).count()) > 0);

  // 困难分门槛未达标 → 不能直接兑换（按钮不是「兑换」）
  const travelCard = page.locator('div.card', { hasText: '出去旅游' }).filter({ has: page.getByRole('button', { name: '编辑奖品' }) }).first();
  const travelBtn = travelCard.getByRole('button').last();
  const travelBtnText = (await travelBtn.textContent()) || '';
  ok('里程碑门槛未达标时不可直接兑换', !travelBtnText.includes('兑换'), 'btn=' + travelBtnText);

  // ---- 编辑奖品：改积分与困难分占比，保存后即时生效 ----
  const travelEditBtn = travelCard.getByRole('button', { name: '编辑奖品' });
  ok('奖品卡提供「编辑」入口', (await travelEditBtn.count()) > 0);
  if ((await travelEditBtn.count()) > 0) {
    await travelEditBtn.click();
    await page.getByPlaceholder('奖品名称').waitFor({ timeout: 3000 });
    await page.getByPlaceholder('所需积分').fill('9999');
    await page.getByRole('button', { name: '🏆 里程碑' }).click(); // 保持里程碑
    await page.getByPlaceholder('60').fill('50'); // 困难分占比改 100%→50%
    await page.getByRole('button', { name: '保存修改' }).click();
    await page.waitForTimeout(300);
    ok('编辑后积分更新为 9999', (await page.getByText('🪙 9999 分').count()) > 0);
    ok('编辑后困难分占比更新为 50%', (await page.getByText(/困难分需 ≥50%/).count()) > 0);
  }

  // ---- 跨框架：一个任务同时出现在工作日与周末 SOP ----
  await page.getByRole('button', { name: '我的 SOP' }).last().click();
  await page.getByRole('button', { name: '＋ 新建 SOP' }).click();
  await page.getByPlaceholder(/我的工作日安排/).first().fill('我的工作日安排：\n每天喝水。');
  await page.getByRole('button', { name: '解析并预览' }).click();
  await page.waitForTimeout(200);
  // 勾选该任务的「工作日+周末」跨框架开关
  await page.locator('label[title*="同时出现在工作日和周末"]').click();
  await page.getByRole('button', { name: '确认，帮我安排好' }).click();
  await page.waitForTimeout(300);
  // 回到今天，应能看到「喝水」
  await goTodayWeekday();
  await page.waitForTimeout(200);
  ok('跨框架任务出现在今日（工作日 SOP）', (await page.getByText('喝水').count()) > 0);

  // 切到下一个周末（周六/周日），验证它也在周末出现（未跨框架则工作日 SOP 任务周末不会生成）
  for (let i = 0; i < 7; i++) {
    if ((await page.getByText('周六').count()) > 0 || (await page.getByText('周日').count()) > 0) break;
    await page.getByRole('button', { name: '›' }).click();
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(350);
  ok('跨框架任务在周六也出现', (await page.getByText('喝水').count()) > 0);
  ok('跨框架任务带「工作日+周末」标识', (await page.getByText('工作日+周末').count()) > 0);

  ok('运行期间无控制台错误', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.error('SMOKE ERROR:', e.message);
  fail++;
} finally {
  await browser.close();
}

console.log(`\n==== 浏览器冒烟测试：通过 ${pass} / 失败 ${fail} ====`);
if (fail > 0) process.exit(1);

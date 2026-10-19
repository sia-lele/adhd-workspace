import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = 'http://localhost:4178/';
const DIR = '/workspace/adhd-executive-workspace/screenshots';
mkdirSync(DIR, { recursive: true });

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });

await page.screenshot({ path: `${DIR}/01-welcome.png` });

await page.getByRole('button', { name: '输入我的 SOP' }).click();
await page.getByRole('button', { name: '＋ 新建 SOP' }).waitFor();
await page.getByRole('button', { name: '＋ 新建 SOP' }).click();
await page.locator('textarea').fill(sample);
await page.getByRole('button', { name: '解析并预览' }).click();
await page.getByRole('button', { name: '确认，帮我安排好' }).waitFor();
await page.screenshot({ path: `${DIR}/02-sop-preview.png` });
await page.getByRole('button', { name: '确认，帮我安排好' }).click();

await page.getByRole('button', { name: '今天' }).last().click();
await page.getByText('帮我开始').first().waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/03-today.png` });

// 完成一个任务
const c = page.locator('button.task-circle:not(.done):not(.skipped)').first();
await c.click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/04-today-done.png` });

// 低能量模式
await page.getByRole('button', { name: /低能量模式/ }).click();
await page.getByText('今天先做一点点就好。').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${DIR}/05-low-energy.png` });
await page.getByRole('button', { name: /低能量模式/ }).click();

// 帮我开始
await page.getByRole('button', { name: '帮我开始' }).click();
await page.getByText('现在可以做').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${DIR}/06-help-me-start.png` });
await page.getByRole('button', { name: '开始', exact: true }).click();
await page.getByText('正在专注').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${DIR}/07-focus.png` });
await page.getByRole('button', { name: '退出', exact: true }).click();

// 本周
await page.getByRole('button', { name: '本周' }).last().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/08-week.png` });

// SOP 列表
await page.getByRole('button', { name: '我的 SOP' }).last().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/09-sop-list.png` });

// 桌面尺寸
await page.setViewportSize({ width: 1180, height: 800 });
await page.getByRole('button', { name: '今天' }).last().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${DIR}/10-today-desktop.png` });

await browser.close();
console.log('screenshots saved to', DIR);

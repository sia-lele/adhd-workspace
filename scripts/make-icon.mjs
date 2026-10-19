// 将 SVG 图标栅格化为各尺寸 PNG（含 maskable 与 apple-touch-icon）
// 用法：node scripts/make-icon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pub = resolve(root, 'public');

const targets = [
  { svg: 'icon.svg', size: 192, out: 'icon-192.png' },
  { svg: 'icon.svg', size: 512, out: 'icon-512.png' },
  { svg: 'icon-maskable.svg', size: 512, out: 'maskable-512.png' },
  { svg: 'icon.svg', size: 180, out: 'apple-touch-icon.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const t of targets) {
  const svg = readFileSync(resolve(pub, t.svg), 'utf8');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{width:${t.size}px!important;height:${t.size}px!important;display:block}
  </style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.screenshot({
    path: resolve(pub, t.out),
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  });
  console.log('generated', t.out, `${t.size}x${t.size}`);
}

await browser.close();
console.log('done');

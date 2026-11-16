// ============================================================
// 执行大脑 Service Worker
// 目标：新版本部署后，用户在已安装的 PWA 里「刷新一次」即可应用更新，
//       无需从主屏幕删除再重新添加。
// 策略：
//   - 导航请求（HTML）：网络优先，失败回退缓存（保证始终拿到最新 index.html）
//   - 静态资源（带 hash 的 js/css/图片/字体）：缓存优先，命中即用；新版换 hash 自动失效
//   - install 时 skipWaiting，activate 时 clients.claim + 清理旧缓存
// 注意：仅缓存静态资源，绝不触碰 IndexedDB / 用户数据。
// ============================================================

const CACHE = 'exec-brain-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // 立刻接管，不等旧 SW 退出
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        /* 预缓存失败不影响主流程 */
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      // 立即让所有已打开的页面受新 SW 控制
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只处理同源请求；跨域（图标 CDN、分析等）一律放行
  if (url.origin !== self.location.origin) return;

  // 导航（HTML）：网络优先，离线时回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match('./index.html')).then((r) => r || Response.error()),
        ),
    );
    return;
  }

  // 静态资源：缓存优先（带 hash 的文件名不会变，新版会换 hash 自然失效）
  if (/\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|ico|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached || Response.error());
      }),
    );
  }
});

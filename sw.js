// オフラインでも開けるようにアプリのファイルを保存する。
// アプリを更新したら VERSION を変えること（利用者は次回起動時に新しい版になる）。
const VERSION = 'kakusapo-v0.1.3';
const RUNTIME = 'kakusapo-runtime';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/extract.js',
  './js/categories.js',
  './js/ocr.js',
  './js/backup.js',
  './js/format.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];
// OCRプログラム・フォントの配信元（初回に取得してから保存）
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // 画面はネット優先（更新をすぐ反映）、つながらなければ保存した版
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
      return;
    }
    event.respondWith(
      caches.match(req).then((hit) => {
        const update = fetch(req).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || update;
      })
    );
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
  }
});

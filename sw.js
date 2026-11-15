// Service worker: makes the app shell load fast and open even on a weak connection.
// Network first (so updates appear immediately), cache as fallback. API calls are never cached.
const CACHE = 'dsm-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'backend/Code.js',
  'js/app.js', 'js/api.js', 'js/config.js', 'js/format.js', 'js/i18n.js', 'js/router.js', 'js/store.js', 'js/ui.js',
  'js/i18n/en.js', 'js/i18n/si.js', 'js/i18n/ta.js',
  'js/pages/common.js', 'js/pages/auth.js', 'js/pages/dashboard.js', 'js/pages/students.js', 'js/pages/attendance.js',
  'js/pages/exams.js', 'js/pages/events.js', 'js/pages/prefects.js', 'js/pages/settings.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

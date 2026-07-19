// sw.js — service worker for cel's headspace PWA
// Offline-first for assets + decks; network-first for the page; API never cached.
const CACHE = 'cel-headspace-v6';
const PRECACHE = [
  './',
  'manifest.json',
  'assets/douyin/quotes.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'decks/korean-grammar.json', 'decks/korean-cheatsheet.json',
  'decks/japanese-core2000.json', 'decks/japanese-eggrolls-jlpt.json'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u)))));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(client => client.postMessage({ type: 'APP_UPDATED', cache: CACHE })))
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never cache writes (sync PUTs)
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;     // sync API always hits network

  // the page itself: network-first so edits show, fall back to cache offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then(m => m || caches.match('./')))
    );
    return;
  }

  // assets (decks, icons, fonts, css): cache-first
  const isAsset = /\.(json|png|jpe?g|webp|gif|svg|ttf|woff2?|css)$/i.test(url.pathname) || url.pathname.includes('/decks/');
  if (isAsset) {
    e.respondWith(
      caches.match(req).then(m => m || fetch(req).then(r => {
        const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r;
      }))
    );
  }
});

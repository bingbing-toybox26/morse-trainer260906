'use strict';

// Bump VERSION whenever any file in SHELL changes. Updates wait until all app
// tabs close, so code and assets cannot change in the middle of a practice round.
const VERSION = 'v3';
const PREFIX = 'morse-room:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;
const SHELL = [
  './', './index.html', './assets/styles.css', './assets/app.js',
  './assets/offline.js', './manifest.webmanifest', './assets/icon.svg',
  './assets/icon-192.png', './assets/icon-512.png'
].map(path => new URL(path, self.registration.scope).href);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  if (!SHELL.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.href) || fetch(event.request);
  })());
});

const CACHE = 'lifetempo-shell-v7';
const SHELL = ['/', '/index.html', '/calendar-core.js', '/vendor/ical.js', '/calendar-ics.js', '/ai-request.js', '/booking-client.js', '/enhancements.js', '/localization-data.js', '/localization-core.js', '/localization-client.js', '/localization.css', '/manifest.webmanifest', '/LifeTempo-Icons/source/LifeTempo-rounded.svg', '/LifeTempo-Icons/android/play-store-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('lifetempo-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache authenticated APIs, guest pages, or booking results.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match(url.pathname))));
});

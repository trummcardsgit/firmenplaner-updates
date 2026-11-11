'use strict';
const CACHE = 'firmenplaner-v1.1.1';
const STATIC = ['/', '/styles.css', '/app.js', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const clone = response.clone();
      event.waitUntil(caches.open(CACHE).then(c => c.put(event.request, clone)));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))));
});
self.addEventListener('push', event => {
  let data = {title:'FirmenPlaner',body:'Eine Aufgabe ist fällig.'};
  try { if (event.data) data = event.data.json(); } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'FirmenPlaner', {
    body: data.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: data.tag || undefined,
    data: { taskId: data.taskId || null, url: '/' }, requireInteraction: true
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin === self.location.origin) {
        if (event.notification.data?.taskId) client.postMessage({ taskId: event.notification.data.taskId });
        return client.focus();
      }
    }
    return self.clients.openWindow('/');
  })());
});

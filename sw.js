/**
 * sw.js — Service Worker for Sunrise Family Clinic & Maternity Home PWA
 * AQ MedTech Innovations © 2024
 *
 * Strategies:
 *  - Navigation requests  → Cache-only (SPA offline fallback: /index.html)
 *  - CDN / unpkg assets   → Cache-First (serve cache, fallback network, re-cache)
 *  - Supabase API calls   → Network-First (try network, fallback JSON error)
 *  - Everything else      → Stale-While-Revalidate
 */

'use strict';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CACHE_NAME = 'aq-clinic-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './clinic-config.js',
  './manifest.json',
  './icons/icon.svg',
  // CDN assets
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/dexie@latest/dist/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
];

/* ─── Install ─────────────────────────────────────────────────────────────── */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

/* ─── Activate ────────────────────────────────────────────────────────────── */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* ─── Fetch ───────────────────────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Navigation requests → SPA offline fallback (index.html from cache)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(
        (cached) =>
          cached ||
          caches.match('/index.html').then(
            (rootCached) =>
              rootCached ||
              fetch(request).catch(
                () =>
                  new Response('<h1>Offline</h1><p>Please check your connection.</p>', {
                    headers: { 'Content-Type': 'text/html' },
                  })
              )
          )
      )
    );
    return;
  }

  // 2. CDN / unpkg assets → Cache-First
  if (url.includes('cdn') || url.includes('unpkg')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
            return networkResponse;
          })
          .catch(() => {
            // No network, nothing cached — return empty 503
            return new Response('', { status: 503, statusText: 'Service Unavailable' });
          });
      })
    );
    return;
  }

  // 3. Supabase API requests → Network-First
  if (url.includes('.supabase.co')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({
            error: 'offline',
            message:
              'You are currently offline. Please reconnect to sync your data with the server.',
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
    );
    return;
  }

  // 4. Everything else → Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cached); // If network fails and nothing cached, returns undefined → browser handles

        // Return cached immediately if available, otherwise wait for network
        return cached || networkFetch;
      })
    )
  );
});

/* ─── Message ─────────────────────────────────────────────────────────────── */

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ─── Push Notifications ──────────────────────────────────────────────────── */

self.addEventListener('push', (event) => {
  let data = {
    title: 'Sunrise Family Clinic',
    body: 'You have a new notification from the clinic.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = {
        title: parsed.title || data.title,
        body: parsed.body || data.body,
        icon: parsed.icon || data.icon,
        badge: parsed.badge || data.badge,
        tag: parsed.tag || undefined,
        data: parsed.data || {},
      };
    } catch {
      // If not JSON, use text as the body
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200],
      requireInteraction: false,
    })
  );
});

/* ─── Notification Click ──────────────────────────────────────────────────── */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = self.registration.scope || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing window if one is already open
        for (const client of clientList) {
          if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

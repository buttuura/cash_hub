const CACHE_NAME = 'cashhub-cache-v3';
const WRITE_QUEUE_DB = 'cashhub-offline-writes';
const WRITE_QUEUE_STORE = 'requests';
const WRITE_QUEUE_TAG = 'cashhub-write-queue';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/classOne-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

const openWriteQueue = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(WRITE_QUEUE_DB, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(WRITE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const isQueueableWrite = (request) => {
  if (!request.url.includes('/api/')) return false;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return false;
  return !/\/api\/auth\/(login|register|forgot-password|reset-password)/.test(request.url);
};

const queueWrite = async (request) => {
  const headers = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  const body = request.method === 'DELETE' ? null : await request.clone().arrayBuffer();
  const db = await openWriteQueue();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(WRITE_QUEUE_STORE, 'readwrite');
    transaction.objectStore(WRITE_QUEUE_STORE).add({
      url: request.url,
      method: request.method,
      headers,
      body,
      queuedAt: Date.now(),
    });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  if ('sync' in self.registration) {
    await self.registration.sync.register(WRITE_QUEUE_TAG);
  }
  return new Response(JSON.stringify({ queued: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};

const readQueuedWrites = () => openWriteQueue().then((db) => new Promise((resolve, reject) => {
  const request = db.transaction(WRITE_QUEUE_STORE, 'readonly').objectStore(WRITE_QUEUE_STORE).getAll();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
}));

const removeQueuedWrite = (id) => openWriteQueue().then((db) => new Promise((resolve, reject) => {
  const transaction = db.transaction(WRITE_QUEUE_STORE, 'readwrite');
  transaction.objectStore(WRITE_QUEUE_STORE).delete(id);
  transaction.oncomplete = resolve;
  transaction.onerror = () => reject(transaction.error);
}));

const replayQueuedWrites = async () => {
  const queuedWrites = await readQueuedWrites();
  for (const queuedWrite of queuedWrites) {
    try {
      const response = await fetch(queuedWrite.url, {
        method: queuedWrite.method,
        headers: queuedWrite.headers,
        body: queuedWrite.body,
      });
      if (response.ok) await removeQueuedWrite(queuedWrite.id);
    } catch (error) {
      // Leave the request queued and let the next sync attempt retry it.
      return;
    }
  }
};

const getApiCacheKey = async (request) => {
  const authorization = request.headers.get('authorization');
  if (!authorization || !self.crypto?.subtle) return request.url;
  const bytes = new TextEncoder().encode(authorization);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const tokenKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${request.url}${request.url.includes('?') ? '&' : '?'}__cashhub_user=${tokenKey}`;
};

self.addEventListener('sync', (event) => {
  if (event.tag === WRITE_QUEUE_TAG) event.waitUntil(replayQueuedWrites());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'REPLAY_OFFLINE_WRITES') {
    replayQueuedWrites().catch(() => {});
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.some((client) => client.visibilityState === 'visible')) return;
      return self.registration.showNotification(data.title || 'Cash Hub', {
        body: data.body || 'You have a new notification',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.type || 'cash-hub-notification',
        data: { url: data.url || '/' },
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => 'focus' in client);
      if (existingClient) {
        existingClient.navigate(targetUrl);
        return existingClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    if (isQueueableWrite(event.request)) {
      event.respondWith(fetch(event.request.clone()).catch(() => queueWrite(event.request)));
    }
    return;
  }

  // Keep the app usable offline by returning the cached shell for navigation.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
        return response;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Use fresh API data when available, but keep the last successful response.
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      getApiCacheKey(event.request).then((cacheKey) => fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
          }
          return response;
        })
        .catch(() => caches.match(cacheKey))
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          });
        }))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((resp) => {
      return resp || fetch(event.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          try { cache.put(event.request, response.clone()); } catch (e) {}
          return response;
        });
      }).catch(() => caches.match('/offline.html'));
    })
  );
});

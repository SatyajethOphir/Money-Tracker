const CACHE_NAME = 'emi-tracker-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/logo.jpg',
  '/icon.png',
  '/icon-512.png',
  '/icon-72.png',
  '/icon-96.png',
  '/icon-128.png',
  '/icon-144.png',
  '/icon-152.png',
  '/icon-192.png',
  '/icon-384.png'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip chrome-extension, etc.
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle API Requests (Network First, Cache Fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone response to put in cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          console.log('[Service Worker] Serving API request from Cache:', url.pathname);
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return empty error response if nothing cached
            return new Response(JSON.stringify({ 
              error: 'You are offline and this data was not cached yet.',
              isOfflineFallback: true 
            }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
  } else {
    // Handle Static Assets (Cache First, Network Fallback)
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        }).catch(() => {
          // If HTML request fails and offline, return the index.html fallback
          const acceptHeader = request.headers.get('accept');
          if (request.mode === 'navigate' || (acceptHeader && acceptHeader.includes('text/html'))) {
            return caches.match('/');
          }
        });
      })
    );
  }
});

// Push Event Listener for Web Push Notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  let data = { title: 'EMI Tracker', body: 'New notification!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'EMI Tracker', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: data.vibrate || [100, 50, 100],
    data: {
      notificationId: data.notificationId,
      category: data.category
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event Listener
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close();

  // Focus or open application window
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const url = new URL(client.url);
        if (url.pathname === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Skip waiting message handler for automatic application updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

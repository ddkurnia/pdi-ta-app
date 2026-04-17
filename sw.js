// ============================================================
// PDI TA App - Service Worker v1
// Handles: Cache, Push Notifications, Background Sync
// ============================================================

const CACHE_NAME = 'pdi-ta-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/ta.html',
  '/admin.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json'
];

// --- Install: Cache static assets ---
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// --- Activate: Clean old caches ---
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// --- Fetch: Network-first with cache fallback ---
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  // Skip Firebase and Cloudinary requests (always network)
  if (event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('cloudinary.com') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback to index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// --- Push Event: Show notification when FCM message arrives ---
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  let data = { title: 'PDI TA App', body: 'Ada notifikasi baru' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || '',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Logo_PDI_Perjuangan.svg/120px-Logo_PDI_Perjuangan.svg.png',
    badge: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Logo_PDI_Perjuangan.svg/120px-Logo_PDI_Perjuangan.svg.png',
    tag: data.tag || 'pdi-ta-push-' + Date.now(),
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// --- Notification Click: Open app and focus ---
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const urlToOpen = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes('pdi-ta-app') && 'focus' in client) {
          client.focus();
          return;
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// --- Background Sync: Sync pending data when back online ---
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  // This can be used to retry failed notification reads
  console.log('[SW] Syncing notifications...');
}

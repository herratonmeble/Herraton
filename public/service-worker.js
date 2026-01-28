// Herraton PWA Service Worker
const CACHE_NAME = 'herraton-v1';
const RUNTIME_CACHE = 'herraton-runtime';

// Pliki do cache'owania przy instalacji
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Instalacja - cache'uj podstawowe pliki
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('PWA: Cache otwarty');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.log('PWA: Niektóre pliki nie zostały zcache\'owane:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Aktywacja - usuń stare cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('PWA: Usuwam stary cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - strategia Network First z fallback do cache
self.addEventListener('fetch', event => {
  // Pomijaj nie-GET requesty
  if (event.request.method !== 'GET') {
    return;
  }

  // Pomijaj requesty do API (Firebase, wFirma itp.)
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || 
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis')) {
    return;
  }

  event.respondWith(
    // Próbuj sieć
    fetch(event.request)
      .then(response => {
        // Jeśli sukces, zapisz do cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Brak sieci - użyj cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Jeśli to nawigacja, pokaż stronę główną
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Brak połączenia z internetem', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Obsługa wiadomości od aplikacji
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notifications (na przyszłość)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nowe powiadomienie',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/'
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Herraton', options)
    );
  }
});

// Kliknięcie w powiadomienie
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      // Jeśli aplikacja jest otwarta, skup się na niej
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      // W przeciwnym razie otwórz nowe okno
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

// Herraton PWA Service Worker
const CACHE_NAME = 'herraton-v2';
const RUNTIME_CACHE = 'herraton-runtime';

// ============================================
// FIREBASE CLOUD MESSAGING
// ============================================
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Konfiguracja Firebase
firebase.initializeApp({
  apiKey: "AIzaSyDPno2WcoauLnjkWq0NjGjuWr5wuG64xMI",
  authDomain: "herraton-332d0.firebaseapp.com",
  projectId: "herraton-332d0",
  storageBucket: "herraton-332d0.firebasestorage.app",
  messagingSenderId: "620331362290",
  appId: "1:620331362290:web:6ce157738f7ae7e2f02d6b"
});

const messaging = firebase.messaging();

// Obsługa powiadomień w tle (gdy aplikacja jest zamknięta/w tle)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Otrzymano powiadomienie w tle:', payload);
  
  const notificationTitle = payload.notification?.title || 'Herraton';
  const notificationOptions = {
    body: payload.notification?.body || 'Masz nowe powiadomienie',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.data?.tag || 'herraton-notification',
    data: {
      url: payload.data?.url || '/',
      orderId: payload.data?.orderId,
      type: payload.data?.type
    },
    vibrate: [200, 100, 200],
    requireInteraction: payload.data?.requireInteraction === 'true',
    actions: [
      { action: 'open', title: '📂 Otwórz' },
      { action: 'close', title: '✕ Zamknij' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// ============================================
// PWA CACHING
// ============================================

// Pliki do cache'owania przy instalacji
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/static/css/main.css',
  '/static/js/main.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instalacja - cache'uj podstawowe pliki
self.addEventListener('install', event => {
  console.log('[SW] Instalacja...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache otwarty');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.log('[SW] Niektóre pliki nie zostały zcache\'owane:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Aktywacja - usuń stare cache
self.addEventListener('activate', event => {
  console.log('[SW] Aktywacja...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[SW] Usuwam stary cache:', cacheName);
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
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
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

// ============================================
// PUSH NOTIFICATIONS - KLIKNIĘCIE
// ============================================

self.addEventListener('notificationclick', event => {
  console.log('[SW] Kliknięto powiadomienie:', event.action);
  
  event.notification.close();
  
  // Jeśli użytkownik kliknął "Zamknij"
  if (event.action === 'close') {
    return;
  }
  
  // Otwórz aplikację
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Sprawdź czy aplikacja jest już otwarta
        for (const client of windowClients) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            // Wyślij informację do aplikacji o kliknięciu
            client.postMessage({ 
              type: 'NOTIFICATION_CLICK', 
              data: event.notification.data 
            });
            return client.focus();
          }
        }
        // Jeśli nie jest otwarta, otwórz nowe okno
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Zamknięcie powiadomienia (swipe away)
self.addEventListener('notificationclose', event => {
  console.log('[SW] Powiadomienie zamknięte:', event.notification.tag);
});

console.log('[SW] Service Worker załadowany z FCM');

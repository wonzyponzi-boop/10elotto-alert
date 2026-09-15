/* Service Worker 10eLotto Alert */
const CACHE = '10elotto-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Ricezione notifica push
self.addEventListener('push', (event) => {
  let data = { title: '10eLotto Alert', body: 'Nuova allerta', url: '/' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  const options = {
    body: data.body || 'Soglia superata',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Apri' }
    ],
    requireInteraction: true,
    tag: '10elotto-alert'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '10eLotto Alert', options)
  );
});

// Click sulla notifica
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

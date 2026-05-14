const CACHE_NAME = 'torah-time-cache-v1';

self.addEventListener('install', event => {
  self.skipWaiting(); // כופה על המערכת לפעול מיד
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim()); // משתלט על הדפדפן מיד
});

// אסטרטגיית Stale-While-Revalidate: מגיש תמיד מהקאש למהירות ולאופליין, אבל בודק עדכונים מהרשת במקביל.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(error => {
        console.log('מצב אופליין פעיל. האפליקציה ממשיכה לעבוד ללא רשת.');
      });
      
      // מגיש קודם כל את המטמון. אם האתר לא בקאש עדיין - ממתין לרשת.
      return cachedResponse || fetchPromise;
    })
  );
});

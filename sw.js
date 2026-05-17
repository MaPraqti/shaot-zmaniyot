const CACHE_NAME = "torah-time-cache-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  // התעלם מבקשות שאינן GET, והתעלם לחלוטין מבקשות לשרתים של גוגל ואנליטיקס
  if (
    event.request.method !== "GET" ||
    event.request.url.includes("googleapis.com") ||
    event.request.url.includes("accounts.google.com") ||
    event.request.url.includes("zgo.at")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // בודק שהתשובה תקינה לפני שמשכפל ושומר למטמון
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          console.log("מצב אופליין פעיל.");
        });

      return cachedResponse || fetchPromise;
    }),
  );
});

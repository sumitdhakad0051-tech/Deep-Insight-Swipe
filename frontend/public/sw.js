/* Insight Swipe – minimal service worker.
   We don't cache aggressively; this file exists so the app is installable as a PWA. */

const CACHE = "insight-swipe-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-first, cache-fallback for GET navigations. Bypass API calls.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (
          fresh &&
          fresh.status === 200 &&
          (url.origin === self.location.origin ||
            url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?)$/))
        ) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});

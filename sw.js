// coach-app service worker: keep the installed home-screen app auto-updating.
// Strategy: network-first for the app shell so a fresh index.html is fetched on
// every launch when online (bypassing the HTTP cache), with a cached fallback
// for offline. A new service worker activates immediately (skipWaiting/claim).
const CACHE = "coach-shell-v1";
const SHELL = "./index.html";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add(new Request(SHELL, { cache: "reload" })))
      .catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // never intercept the POSTs to the coach function
  const url = new URL(req.url);
  const isShell =
    req.mode === "navigate" ||
    (url.origin === location.origin && url.pathname.endsWith("/index.html")) ||
    url.pathname.endsWith("/coach-app/");

  if (isShell) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" }); // always latest, skip HTTP cache
        (await caches.open(CACHE)).put(SHELL, fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match(SHELL)) || Response.error();
      }
    })());
    return;
  }

  // Other GETs (e.g. web fonts): network, fall back to cache when offline.
  e.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (err) {
      return (await caches.match(req)) || Response.error();
    }
  })());
});

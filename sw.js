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
      const cached = await caches.match(SHELL);
      const network = fetch(req, { cache: "no-store" }).then((fresh) => {
        caches.open(CACHE).then((c) => c.put(SHELL, fresh.clone()));
        return fresh;
      });
      if (!cached) { try { return await network; } catch (err) { return Response.error(); } }
      // Have a cached shell: race the network against a short timeout so a slow
      // (not offline) connection can't hang launch; the network still refreshes the cache.
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
      const winner = await Promise.race([network.catch(() => null), timeout]);
      return winner || cached;
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

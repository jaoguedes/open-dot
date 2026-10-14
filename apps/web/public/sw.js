/* Open Dot — cache só do shell estático. Nunca /api nem dados de e-mail. */
const CACHE = "open-dot-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/assets/app.css",
  "/assets/app.js",
  "/assets/theme.js",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/fonts/Inter-Regular.woff",
  "/fonts/Inter-Medium.woff",
  "/fonts/Inter-SemiBold.woff",
  "/fonts/InstrumentSerif-Italic.woff2",
  "/fonts/JetBrainsMono-Medium.woff2",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        SHELL.map(async (url) => {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) await cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req);
    }),
  );
});

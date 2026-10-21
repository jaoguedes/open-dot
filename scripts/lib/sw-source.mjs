// SPDX-License-Identifier: AGPL-3.0-only
/** Service worker do shell. O hash muda a cada build; o arquivo deixa de ser cache eterno. */
export function serviceWorkerSource(build) {
  const id =
    String(build)
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 32) || "dev";
  return `/* Open Dot — shell ${id}. Nunca guarda /api. Navegação: network-first. Assets: stale-while-revalidate. */
const CACHE = "open-dot-shell-${id}";
const SHELL = ["/", "/index.html", "/assets/app.css", "/assets/app.js", "/assets/theme.js", "/icons/favicon-32.png?v=4", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(SHELL.map(async (url) => {
        try {
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) await cache.put(url, res);
        } catch { /* offline no install: segue sem este arquivo */ }
      }));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function isNav(req, url) {
  return req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (isNav(req, url)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          await cache.put("/index.html", fresh.clone());
        }
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match("/index.html")) || (await cache.match("/")) || new Response("offline", { status: 503 });
      }
    })());
    return;
  }
  const asset = url.pathname.startsWith("/assets/") || url.pathname.startsWith("/chunks/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/dot/");
  if (!asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const update = fetch(req).then(async (res) => {
      const type = res.headers.get("content-type") || "";
      if (res.ok && !type.includes("text/html")) await cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) {
      event.waitUntil(update);
      return hit;
    }
    const res = await update;
    if (!res || res.status === 404 || (res.headers.get("content-type") || "").includes("text/html")) {
      return new Response("não encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return res;
  })());
});
`;
}

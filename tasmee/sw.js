/* دفتر التسميع — service worker: الإشعارات + فتح التطبيق عند ضعف الاتصال */
const CACHE = "tasmee-v4";
const SHELL = ["./", "config.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

/* the app's own files: the network first (so updates arrive), the saved copy when the network is slow or absent.
   "no-cache" asks GitHub every time (a tiny 304 when nothing changed), so a new version shows up at once. */
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  const saved = () => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === "navigate" ? caches.match("./") : undefined));
  const fresh = fetch(r.url, { cache: "no-cache", credentials: "same-origin" }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r.mode === "navigate" ? "./" : r, copy)) }
    return res;
  });
  e.respondWith(Promise.race([
    fresh,
    new Promise(ok => setTimeout(ok, 4000)).then(saved).then(m => m || fresh)
  ]).catch(() => saved().then(m => m || Response.error())));
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { body: e.data ? e.data.text() : "" } }
  e.waitUntil(self.registration.showNotification(d.title || "دفتر التسميع", {
    body: d.body || "لديك تنبيه جديد",
    icon: "icon-192.png", badge: "badge-96.png", dir: "rtl", lang: "ar",
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});

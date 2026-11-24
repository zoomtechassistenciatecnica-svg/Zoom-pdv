const CACHE = "zoom-diagnostico-pwa-v1";
const CORE = ["./hardware-test.html", "./hardware-test.js", "./css-diagnostico/diagnostico.css", "./supabase-config.js", "./diagnostic.webmanifest", "./assets/zoom-diagnostic.svg", "./assets/zoom-diagnostic-192.png", "./assets/zoom-diagnostic-512.png"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  const path = new URL(request.url).pathname;
  if (!/\/(hardware-test\.html|hardware-test\.js|supabase-config\.js|diagnostic\.webmanifest|css-diagnostico\/diagnostico\.css|assets\/zoom-diagnostic[^/]*\.(svg|png))$/.test(path)) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || new Response("Conecte-se à internet para continuar o diagnóstico.", {status: 503, headers: {"Content-Type":"text/plain; charset=utf-8"}}))));
});

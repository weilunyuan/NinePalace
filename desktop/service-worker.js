const CACHE_NAME = "ninepalace-shell-v27";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/lobby.css",
  "/match.css",
  "/renderer.js",
  "/browser-bootstrap.js",
  "/browser-expose.js",
  "/browser-client.js",
  "/i18n.js",
  "/character-select.js",
  "/settings.js",
  "/chinese-notation.js",
  "/pwa-register.js",
  "/manifest.webmanifest",
  "/icon-192.svg",
  "/icon-512.svg",
  "/assets/ninepalace-red-rook-girl.png",
  "/assets/ninepalace-red-horse-girl.png",
  "/assets/ninepalace-black-rook-loli.png",
  "/assets/ninepalace-black-horse-loli.png",
  "/assets/ninepalace-hand-red-rook.png",
  "/assets/ninepalace-hand-red-horse.png",
  "/assets/ninepalace-hand-black-rook.png",
  "/assets/ninepalace-hand-black-horse.png",
  "/vendor/xiangqi-js/xiangqi.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("ninepalace-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

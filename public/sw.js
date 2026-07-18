export const CACHE_NAME = "food-body-log-shell-v1";
export const APP_SHELL = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./scripts/app.js",
  "./scripts/paths.js",
  "./scripts/storage.js",
  "./scripts/dom.js",
  "./scripts/install-status.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("food-body-log-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html")));
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOriginAppAsset = requestUrl.origin === self.location.origin;

  if (!isSameOriginAppAsset) {
    return;
  }

  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

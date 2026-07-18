const CACHE_NAME = "food-body-log-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./scripts/app.js",
  "./scripts/storage.js",
  "./sw.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
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
    ),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request),
    ),
  );
});

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

  const requestUrl = new URL(event.request.url);
  const isSameOriginAppAsset = requestUrl.origin === self.location.origin;

  if (!isSameOriginAppAsset) {
    return;
  }

  event.respondWith(fetchAndRefreshShellCache(event.request));
});

async function fetchAndRefreshShellCache(request) {
  const fallback = request.mode === "navigate" ? "./index.html" : request;

  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());

      if (request.mode === "navigate") {
        const shellFallbackUrl = new URL("./index.html", self.location.href).toString();
        await cache.put(shellFallbackUrl, response.clone());
      }
    }

    return response;
  } catch {
    return caches.match(fallback);
  }
}

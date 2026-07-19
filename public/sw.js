export const CACHE_NAME = "food-body-log-shell-v12";
export const APP_SHELL = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./scripts/app.js?v=11",
  "./scripts/paths.js",
  "./scripts/storage.js",
  "./scripts/dom.js",
  "./scripts/day-policy.js",
  "./scripts/tracking-model.js?v=3",
  "./scripts/today-tracking.js?v=4",
  "./scripts/install-status.js?v=11",
  "./scripts/plan-suggestions-ui.js?v=4",
  "./scripts/journal-model.js?v=2",
  "./scripts/journal-tracking.js?v=2",
  "./scripts/history-reports.js?v=2",
  "./scripts/data-portability.js?v=3",
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
  const isShellAsset = shellAssetUrls().has(requestUrl.toString());

  if (!isSameOriginAppAsset || (!isShellAsset && event.request.mode !== "navigate")) {
    return;
  }

  event.respondWith(fetchAndRefreshShellCache(event.request, { cacheRequest: isShellAsset }));
});

async function fetchAndRefreshShellCache(request, options = {}) {
  const cacheRequest = options.cacheRequest === true;
  const fallback = request.mode === "navigate" ? "./index.html" : request;

  try {
    const response = await fetch(request);

    if (cacheRequest && response.ok) {
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

function shellAssetUrls() {
  return new Set(APP_SHELL.map((asset) => new URL(asset, self.location.href).toString()));
}

export const CURRENT_CACHE_NAME = "food-body-log-shell-v12";

export const EXPECTED_SHELL_ASSETS = [
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

export const SETTINGS_COPY = Object.freeze({
  localOnly: "Your data stays on this device. Food, body, and journal data are not synced to an account.",
  cacheReady: "Offline app shell is ready on this device.",
  cacheChecking: "Checking offline app shell...",
  cacheNotReady: "Open this app while online once more, then check again.",
  updateNote: "Updates may require revisiting the app URL after new static files are published.",
  storageCaveat: "Deleting the Home Screen app, clearing website data, or changing browser storage can remove local app data from this device. Export a backup when you want a copy outside browser storage.",
});

export const CHECKING_STATUS_ROWS = Object.freeze([
  { id: "installMode", label: "Install mode", value: "Checking" },
  { id: "offlineCache", label: "Offline app shell", value: "Checking" },
  { id: "storage", label: "Local storage", value: "Checking" },
  { id: "localOnly", label: "Local-only privacy", value: SETTINGS_COPY.localOnly },
  { id: "storageCaveat", label: "Storage caveat", value: SETTINGS_COPY.storageCaveat },
  { id: "updates", label: "Updates", value: SETTINGS_COPY.updateNote },
]);

export function getInstallModeStatus(environment = globalThis) {
  const navigatorLike = environment.navigator || globalThis.navigator;
  const matchMedia = environment.matchMedia || globalThis.matchMedia;
  const standaloneMedia = matchMedia?.("(display-mode: standalone)")?.matches === true;
  const standaloneNavigator = navigatorLike?.standalone === true;

  return standaloneMedia || standaloneNavigator ? "Ready" : "Not ready";
}

export async function getCacheReadinessStatus(options = {}) {
  const cachesLike = options.caches || globalThis.caches;
  const navigatorLike = options.navigator || globalThis.navigator;
  const readinessTimeoutMs = options.readinessTimeoutMs ?? 3000;

  if (!cachesLike || !navigatorLike || !("serviceWorker" in navigatorLike)) {
    return "Unavailable";
  }

  try {
    const registration = options.registration
      || await Promise.race([
        navigatorLike.serviceWorker.ready,
        timeoutAfter(readinessTimeoutMs),
      ]);

    if (!registration) {
      return "Not ready";
    }

    const cache = await cachesLike.open(options.cacheName || CURRENT_CACHE_NAME);
    const scope = registration?.scope || globalThis.location?.href || "http://localhost/";
    const expectedAssets = options.expectedAssets || EXPECTED_SHELL_ASSETS;
    const assetUrls = expectedAssets.map((asset) => new URL(asset, scope).toString());
    const matches = await Promise.all(assetUrls.map((assetUrl) => cache.match(assetUrl)));

    return matches.every(Boolean) ? "Ready" : "Not ready";
  } catch {
    return "Needs reload";
  }
}

function timeoutAfter(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), milliseconds);
  });
}

export async function collectInstallStatus(options = {}) {
  const storage = options.storage || {};
  const statusRecord = {
    storage: "Ready",
    installMode: getInstallModeStatus(options.environment),
    offlineCache: await getCacheReadinessStatus(options),
    cacheName: options.cacheName || CURRENT_CACHE_NAME,
  };
  const writeResult = storage.writeSetupStatus
    ? await storage.writeSetupStatus(statusRecord)
    : { available: false, value: null };
  const readResult = storage.readSetupStatus
    ? await storage.readSetupStatus()
    : { available: false, value: null };
  const storedValue = readResult.available && readResult.value ? readResult.value : writeResult.value;
  const storageReady = writeResult.available && readResult.available && storedValue?.key === "setup-status";
  const offlineCache = storedValue?.cacheName === statusRecord.cacheName
    ? storedValue?.offlineCache || statusRecord.offlineCache
    : "Not ready";

  return {
    rows: [
      { id: "installMode", label: "Install mode", value: storedValue?.installMode || statusRecord.installMode },
      { id: "offlineCache", label: "Offline app shell", value: offlineCache },
      { id: "storage", label: "Local storage", value: storageReady ? "Ready" : "Unavailable" },
      { id: "localOnly", label: "Local-only privacy", value: SETTINGS_COPY.localOnly },
      { id: "storageCaveat", label: "Storage caveat", value: SETTINGS_COPY.storageCaveat },
      { id: "updates", label: "Updates", value: SETTINGS_COPY.updateNote },
    ],
    message: offlineCache === "Ready" ? SETTINGS_COPY.cacheReady : SETTINGS_COPY.cacheNotReady,
  };
}

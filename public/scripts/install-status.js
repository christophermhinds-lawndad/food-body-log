export const CURRENT_CACHE_NAME = "food-body-log-shell-v1";

export const EXPECTED_SHELL_ASSETS = [
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

export const SETTINGS_COPY = Object.freeze({
  localOnly: "Your data stays on this device. Food, body, and journal data are not synced to an account.",
  cacheReady: "Offline app shell is ready on this device.",
  cacheChecking: "Checking offline app shell...",
  cacheNotReady: "Open this app while online once more, then check again.",
  updateNote: "Updates may require revisiting the app URL after new static files are published.",
  storageCaveat: "Browser storage can be cleared by deleting the app or website data. Export/import arrives in a later phase.",
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

  if (!cachesLike || !navigatorLike || !("serviceWorker" in navigatorLike)) {
    return "Unavailable";
  }

  try {
    const registration = options.registration || await navigatorLike.serviceWorker.ready;
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

export async function collectInstallStatus(options = {}) {
  const storage = options.storage || {};
  const statusRecord = {
    storage: "Ready",
    installMode: getInstallModeStatus(options.environment),
    offlineCache: await getCacheReadinessStatus(options),
  };
  const writeResult = storage.writeSetupStatus
    ? await storage.writeSetupStatus(statusRecord)
    : { available: false, value: null };
  const readResult = storage.readSetupStatus
    ? await storage.readSetupStatus()
    : { available: false, value: null };
  const storedValue = readResult.available && readResult.value ? readResult.value : writeResult.value;
  const storageReady = writeResult.available && readResult.available && storedValue?.key === "setup-status";
  const offlineCache = storedValue?.offlineCache || statusRecord.offlineCache;

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

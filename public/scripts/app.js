import { readSetupStatus, writeSetupStatus } from "./storage.js";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./scripts/app.js",
  "./scripts/storage.js",
  "./sw.js",
];

const titles = {
  today: "Today",
  plan: "Plan",
  reports: "Reports",
  journal: "Journal & Breakthroughs",
  history: "History",
  settings: "Settings",
};

const statusNodes = {
  installMode: document.querySelector("#install-mode-status"),
  offlineCache: document.querySelector("#offline-cache-status"),
  localStorage: document.querySelector("#local-storage-status"),
  message: document.querySelector("#settings-message"),
};

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
});

document.querySelector("#check-install-status")?.addEventListener("click", () => {
  checkInstallStatus();
});

registerServiceWorker();
readStoredStatus();

function selectTab(tabName) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.tab === tabName));
  });

  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.hidden = panel.dataset.view !== tabName;
  });

  const title = titles[tabName] || "Today";
  document.querySelector("#view-title").textContent = title;
  document.querySelector("#app-content").focus({ preventScroll: true });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setStatus(statusNodes.offlineCache, "Unavailable");
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    setStatus(statusNodes.offlineCache, "Not ready");
  }
}

async function readStoredStatus() {
  const stored = await readSetupStatus();

  if (stored.available && stored.value) {
    setStatus(statusNodes.localStorage, stored.value.storage || "Ready");
  }
}

async function checkInstallStatus() {
  setStatus(statusNodes.installMode, "Checking");
  setStatus(statusNodes.offlineCache, "Checking");
  setStatus(statusNodes.localStorage, "Checking");
  statusNodes.message.textContent = "Checking offline app shell...";

  const storageResult = await writeSetupStatus({
    storage: "Ready",
    installMode: getInstallMode(),
    offlineCache: await getCacheStatus(),
  });

  const persisted = await readSetupStatus();
  const storageReady = storageResult.available && persisted.available && persisted.value?.key === "setup-status";
  const cacheStatus = storageResult.value?.offlineCache || "Not ready";

  setStatus(statusNodes.installMode, storageResult.value?.installMode || getInstallMode());
  setStatus(statusNodes.localStorage, storageReady ? "Ready" : "Unavailable");
  setStatus(statusNodes.offlineCache, cacheStatus);

  statusNodes.message.textContent =
    cacheStatus === "Ready"
      ? "Offline app shell is ready on this device."
      : "Open this app while online once more, then check again.";
}

function getInstallMode() {
  const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
  return isStandalone ? "Ready" : "Not ready";
}

async function getCacheStatus() {
  if (!("caches" in globalThis) || !("serviceWorker" in navigator)) {
    return "Unavailable";
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const cache = await caches.open("food-body-log-shell-v1");
    const assetUrls = SHELL_ASSETS.map((asset) => new URL(asset, registration.scope).toString());
    const results = await Promise.all(assetUrls.map((asset) => cache.match(asset)));
    return results.every(Boolean) ? "Ready" : "Not ready";
  } catch {
    return "Not ready";
  }
}

function setStatus(node, value) {
  if (!node) {
    return;
  }

  node.textContent = value;
  node.dataset.state = value.toLowerCase().replace(/\s+/g, "-");
}

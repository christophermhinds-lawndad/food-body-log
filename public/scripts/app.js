import { createAppPaths } from "./paths.js";
import { readSetupStatus, writeSetupStatus } from "./storage.js";
import { renderStatusRows, setStatusText, setText } from "./dom.js";
import { CHECKING_STATUS_ROWS, collectInstallStatus } from "./install-status.js";

const appPaths = createAppPaths();

const titles = {
  today: "Today",
  plan: "Plan",
  reports: "Reports",
  journal: "Journal & Breakthroughs",
  history: "History",
  settings: "Settings",
};

const statusValueNodes = Object.fromEntries(
  Array.from(document.querySelectorAll("[data-status-value]")).map((node) => [node.dataset.statusValue, node]),
);
const settingsMessage = document.querySelector("#settings-message");

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
    setStatusText(statusValueNodes.offlineCache, "Unavailable");
    return;
  }

  try {
    await navigator.serviceWorker.register(appPaths.serviceWorkerScriptUrl(), {
      scope: appPaths.serviceWorkerScope(),
    });
  } catch {
    setStatusText(statusValueNodes.offlineCache, "Not ready");
  }
}

async function readStoredStatus() {
  const stored = await readSetupStatus();

  if (stored.available && stored.value) {
    renderStatusRows(
      [
        { id: "installMode", value: stored.value.installMode || "Not ready" },
        { id: "offlineCache", value: stored.value.offlineCache || "Not ready" },
        { id: "storage", value: stored.value.storage || "Ready" },
      ],
      statusValueNodes,
    );
  }
}

async function checkInstallStatus() {
  renderStatusRows(CHECKING_STATUS_ROWS, statusValueNodes);
  setText(settingsMessage, "Checking offline app shell...");

  const status = await collectInstallStatus({
    storage: { readSetupStatus, writeSetupStatus },
  });

  renderStatusRows(status.rows, statusValueNodes);
  setText(settingsMessage, status.message);
}

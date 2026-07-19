import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CURRENT_CACHE_NAME, EXPECTED_SHELL_ASSETS, collectInstallStatus, getCacheReadinessStatus } from "../public/scripts/install-status.js";

const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const phaseSixUatPath = new URL("../.planning/phases/06-data-safety-and-experience-hardening/06-UAT.md", import.meta.url);

const requiredShellAssets = [
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

const forbiddenShellAssetPatterns = [
  "indexedDB",
  "journalAnswers",
  "meals/",
  "weights/",
  "days/",
  "exports",
  "imports",
  "data/",
  ".json",
  "api/",
  "account",
  "analytics",
  "package.json",
  "package-lock.json",
  "node_modules",
];

test("service worker exposes current cache name and complete app-shell asset list", () => {
  assert.match(swSource, /export const CACHE_NAME = "food-body-log-shell-v\d+"/);
  assert.match(swSource, /export const APP_SHELL = \[/);

  for (const asset of requiredShellAssets) {
    assert.match(swSource, new RegExp(escapeRegExp(`"${asset}"`)), `service worker must cache ${asset}`);
  }
});

test("service worker cache list matches install-status expected shell assets", () => {
  assert.equal(CURRENT_CACHE_NAME, "food-body-log-shell-v12");
  assert.deepEqual(EXPECTED_SHELL_ASSETS, requiredShellAssets);
});

test("service worker cache boundary excludes personal data stores and user content paths", () => {
  const appShellBlock = swSource.match(/APP_SHELL = \[(?<assets>[\s\S]*?)\];/)?.groups?.assets || "";

  for (const pattern of forbiddenShellAssetPatterns) {
    assert.doesNotMatch(appShellBlock, new RegExp(escapeRegExp(pattern), "i"), `must not cache ${pattern}`);
  }

  assert.doesNotMatch(swSource, /indexedDB|localStorage|deleteDatabase|settings\/|data\/|exports\/|imports\/|api\/|account|analytics|package\.json|node_modules/i);
});

test("cache readiness is Ready only when every expected shell asset is present", async () => {
  const scope = "https://example.test/food-body-log/";
  const readyCaches = createFakeCaches(scope, requiredShellAssets);
  const partialCaches = createFakeCaches(scope, requiredShellAssets.slice(0, -1));
  const navigatorLike = { serviceWorker: { ready: Promise.resolve({ scope }) } };

  assert.equal(await getCacheReadinessStatus({ caches: readyCaches, navigator: navigatorLike }), "Ready");
  assert.equal(await getCacheReadinessStatus({ caches: partialCaches, navigator: navigatorLike }), "Not ready");
  assert.equal(await getCacheReadinessStatus({ caches: null, navigator: navigatorLike }), "Unavailable");
});

test("cache readiness returns neutral status when service worker readiness never resolves", async () => {
  const scope = "https://example.test/food-body-log/";
  const readyCaches = createFakeCaches(scope, requiredShellAssets);
  const navigatorLike = { serviceWorker: { ready: new Promise(() => {}) } };

  assert.equal(
    await getCacheReadinessStatus({ caches: readyCaches, navigator: navigatorLike, readinessTimeoutMs: 1 }),
    "Not ready",
  );
});

test("collected install status records the cache name checked for offline readiness", async () => {
  const writes = [];
  const storage = {
    async writeSetupStatus(value) {
      writes.push(structuredClone(value));
      return { available: true, value: { key: "setup-status", ...value } };
    },
    async readSetupStatus() {
      return { available: true, value: { key: "setup-status", ...writes.at(-1) } };
    },
  };
  const scope = "https://example.test/food-body-log/";
  const caches = createFakeCaches(scope, requiredShellAssets);
  const navigatorLike = { serviceWorker: { ready: Promise.resolve({ scope }) } };

  const status = await collectInstallStatus({
    storage,
    caches,
    navigator: navigatorLike,
    environment: {},
  });

  assert.equal(writes[0].cacheName, CURRENT_CACHE_NAME);
  assert.equal(status.rows.find((row) => row.id === "offlineCache").value, "Ready");
});

test("service worker refreshes cached same-origin shell responses during online fetches", () => {
  assert.match(swSource, /event\.respondWith\(fetchAndRefreshShellCache\(event\.request,\s*\{\s*cacheRequest: isShellAsset,?\s*\}\)\)/s);
  assert.match(swSource, /cache\.put\(request,\s*response\.clone\(\)\)/);
  assert.match(swSource, /cache\.put\(shellFallbackUrl,\s*response\.clone\(\)\)/);
  assert.match(swSource, /fetch\(request\)[\s\S]*caches\.match\(fallback\)/);
});

test("service worker limits shell cache writes to app shell assets and navigations", () => {
  assert.match(swSource, /const isShellAsset = shellAssetUrls\(\)\.has\(requestUrl\.toString\(\)\)/);
  assert.match(swSource, /!isShellAsset && event\.request\.mode !== "navigate"/);
  assert.match(swSource, /fetchAndRefreshShellCache\(event\.request,\s*\{\s*cacheRequest: isShellAsset,?\s*\}\)/s);
  assert.match(swSource, /if \(cacheRequest && response\.ok\) \{/);
});

test("phase 6 UAT does not claim automated evidence for target install and offline checks", async () => {
  const uat = await readFile(phaseSixUatPath, "utf8");
  const normalized = uat.toLowerCase().replace(/\s+/g, " ");

  for (const row of [
    "physical iphone 13",
    "hosted https url",
    "home screen install",
    "installed offline relaunch",
  ]) {
    assert.match(normalized, new RegExp(`${escapeRegExp(row)}[^|\\n]*\\|\\s*human-needed`), `${row} must be human-needed`);
  }

  assert.doesNotMatch(normalized, /\b(target-device|iphone 13|hosted https|home screen|offline relaunch)\b[^.\n]*(automated pass|auto-pass|verified by tests|passed by tests)/);
});

function createFakeCaches(scope, cachedAssets) {
  const cachedUrls = new Set(cachedAssets.map((asset) => new URL(asset, scope).toString()));

  return {
    async open(name) {
      assert.equal(name, CURRENT_CACHE_NAME);

      return {
        async match(assetUrl) {
          return cachedUrls.has(assetUrl) ? { ok: true, url: assetUrl } : undefined;
        },
      };
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

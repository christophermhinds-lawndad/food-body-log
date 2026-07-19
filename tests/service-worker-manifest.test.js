import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CURRENT_CACHE_NAME, EXPECTED_SHELL_ASSETS, getCacheReadinessStatus } from "../public/scripts/install-status.js";

const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

const requiredShellAssets = [
  "./",
  "./index.html",
  "./styles/app.css",
  "./scripts/app.js?v=7",
  "./scripts/paths.js",
  "./scripts/storage.js",
  "./scripts/dom.js",
  "./scripts/day-policy.js",
  "./scripts/tracking-model.js?v=3",
  "./scripts/today-tracking.js?v=4",
  "./scripts/install-status.js?v=7",
  "./scripts/plan-suggestions-ui.js?v=4",
  "./scripts/journal-model.js?v=2",
  "./scripts/journal-tracking.js?v=2",
  "./scripts/history-reports.js?v=1",
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
  assert.equal(CURRENT_CACHE_NAME, "food-body-log-shell-v8");
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

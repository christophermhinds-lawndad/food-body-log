import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { CURRENT_CACHE_NAME, EXPECTED_SHELL_ASSETS, getCacheReadinessStatus } from "../public/scripts/install-status.js";

const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

const requiredShellAssets = [
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

const personalDataPatterns = [
  "indexedDB",
  "food",
  "body",
  "journal",
  "weight",
  "meal",
  "days",
  "exports",
  "settings/",
  "data/",
  ".json",
];

test("service worker exposes current cache name and complete app-shell asset list", () => {
  assert.match(swSource, /export const CACHE_NAME = "food-body-log-shell-v\d+"/);
  assert.match(swSource, /export const APP_SHELL = \[/);

  for (const asset of requiredShellAssets) {
    assert.match(swSource, new RegExp(escapeRegExp(`"${asset}"`)), `service worker must cache ${asset}`);
  }
});

test("service worker cache list matches install-status expected shell assets", () => {
  assert.equal(CURRENT_CACHE_NAME, "food-body-log-shell-v1");
  assert.deepEqual(EXPECTED_SHELL_ASSETS, requiredShellAssets);
});

test("service worker cache boundary excludes personal data stores and user content paths", () => {
  const appShellBlock = swSource.match(/APP_SHELL = \[(?<assets>[\s\S]*?)\];/)?.groups?.assets || "";

  for (const pattern of personalDataPatterns) {
    assert.doesNotMatch(appShellBlock, new RegExp(escapeRegExp(pattern), "i"), `must not cache ${pattern}`);
  }

  assert.doesNotMatch(swSource, /indexedDB|localStorage|deleteDatabase|settings\/|data\/|exports\//i);
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

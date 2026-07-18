import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createAppPaths } from "../public/scripts/paths.js";

const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");

test("path helper returns app-relative URLs for root deployment", () => {
  const paths = createAppPaths("https://food.example/index.html");

  assert.equal(paths.basePath, "/");
  assert.equal(paths.assetPath("manifest.webmanifest"), "/manifest.webmanifest");
  assert.equal(paths.assetPath("icons/icon-192.png"), "/icons/icon-192.png");
  assert.equal(paths.assetPath("styles/app.css"), "/styles/app.css");
  assert.equal(paths.assetPath("scripts/app.js"), "/scripts/app.js");
  assert.equal(paths.serviceWorkerScriptUrl(), "/sw.js");
  assert.equal(paths.serviceWorkerScope(), "/");
});

test("path helper returns app-relative URLs for project subpath deployment", () => {
  const paths = createAppPaths("https://food.example/food-body-log/index.html");

  assert.equal(paths.basePath, "/food-body-log/");
  assert.equal(paths.assetPath("manifest.webmanifest"), "/food-body-log/manifest.webmanifest");
  assert.equal(paths.assetPath("icons/icon-512.png"), "/food-body-log/icons/icon-512.png");
  assert.equal(paths.assetPath("icons/apple-touch-icon.png"), "/food-body-log/icons/apple-touch-icon.png");
  assert.equal(paths.assetPath("styles/app.css"), "/food-body-log/styles/app.css");
  assert.equal(paths.assetPath("scripts/app.js"), "/food-body-log/scripts/app.js");
  assert.equal(paths.serviceWorkerScriptUrl(), "/food-body-log/sw.js");
  assert.equal(paths.serviceWorkerScope(), "/food-body-log/");
});

test("service worker registration stays inside the app path and uses fixed same-origin URLs", () => {
  const paths = createAppPaths("https://food.example/project/app/index.html?next=https://evil.example/#/sw.js");

  assert.equal(paths.basePath, "/project/app/");
  assert.equal(paths.serviceWorkerScriptUrl(), "/project/app/sw.js");
  assert.equal(paths.serviceWorkerScope(), "/project/app/");
  assert.ok(paths.serviceWorkerScriptUrl().startsWith(paths.serviceWorkerScope()));

  assert.match(appSource, /import \{ createAppPaths \} from "\.\/paths\.js";/);
  assert.match(
    appSource,
    /navigator\.serviceWorker\.register\(appPaths\.serviceWorkerScriptUrl\(\), \{\s*scope: appPaths\.serviceWorkerScope\(\),\s*type: "module",?\s*\}\)/s,
  );
  assert.doesNotMatch(appSource, /serviceWorker\.register\(["'`]\.\/sw\.js/);
});

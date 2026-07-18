import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
);

test("manifest uses local relative launch URLs", () => {
  assert.equal(manifest.name, "Food Body Log");
  assert.equal(manifest.short_name, "Food Body Log");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
});

test("manifest preserves approved app colors", () => {
  assert.equal(manifest.theme_color, "#FAFAF8");
  assert.equal(manifest.background_color, "#FAFAF8");
});

test("manifest declares only local relative PNG icons", () => {
  assert.ok(Array.isArray(manifest.icons), "manifest icons must be an array");
  assert.equal(manifest.icons.length, 2);

  const iconsBySize = new Map(manifest.icons.map((icon) => [icon.sizes, icon]));
  assert.deepEqual([...iconsBySize.keys()].sort(), ["192x192", "512x512"]);

  for (const icon of manifest.icons) {
    assert.match(icon.src, /^\.\/icons\/icon-(192|512)\.png$/);
    assert.equal(icon.type, "image/png");
    assert.equal(icon.purpose, "any maskable");
    assert.doesNotMatch(icon.src, /^\/|https?:\/\//i);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("shell markup exposes all tabs with Today active by default", () => {
  const tabLabels = ["Today", "Plan", "Reports", "Journal", "History", "Settings"];

  for (const label of tabLabels) {
    assert.match(html, new RegExp(`>${label}<`), `missing ${label} tab label`);
  }

  assert.match(html, /<button[^>]+data-tab="today"[^>]+aria-selected="true"/);
  assert.match(html, /<main[^>]+id="app-content"/);
});

test("shell uses relative app assets and install metadata", () => {
  assert.match(html, /href="\.\/styles\/app\.css"/);
  assert.match(html, /src="\.\/scripts\/app\.js"/);
  assert.match(html, /type="module"/);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"/);
});

test("settings markup includes install status interaction and local-only copy", () => {
  assert.match(html, />Check install status</);
  assert.match(html, /Your data stays on this device/);
  assert.match(html, /not synced to an account/);
  assert.match(html, /Updates may require revisiting the app URL/);
  assert.match(html, /Browser storage can be cleared/);
});

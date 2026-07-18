import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");

test("settings copy includes required local-only, update, storage, and cache status text", () => {
  const requiredSnippets = [
    "Your data stays on this device. Food, body, and journal data are not synced to an account.",
    "Offline app shell is ready on this device.",
    "Checking offline app shell...",
    "Open this app while online once more, then check again.",
    "Updates may require revisiting the app URL after new static files are published.",
    "Browser storage can be cleared by deleting the app or website data. Export/import arrives in a later phase.",
  ];

  for (const snippet of requiredSnippets) {
    assert.match(`${html}\n${appSource}`, new RegExp(escapeRegExp(snippet)), `missing copy: ${snippet}`);
  }
});

test("settings markup exposes separate install, offline, storage, privacy, caveat, and update rows", () => {
  const requiredLabels = [
    "Install mode",
    "Offline app shell",
    "Local storage",
    "Local-only privacy",
    "Storage caveat",
    "Updates",
  ];

  for (const label of requiredLabels) {
    assert.match(html, new RegExp(`<dt>${escapeRegExp(label)}</dt>`), `missing settings row: ${label}`);
  }
});

test("safe DOM helper writes textContent and exposes no raw HTML insertion API", async () => {
  const domSource = await readFile(new URL("../public/scripts/dom.js", import.meta.url), "utf8");
  const dom = await import("../public/scripts/dom.js");
  const node = { textContent: "", dataset: {} };

  assert.equal(typeof dom.setText, "function");
  assert.equal(typeof dom.setStatusText, "function");

  dom.setText(node, "<img src=x onerror=alert(1)>Ready");
  assert.equal(node.textContent, "<img src=x onerror=alert(1)>Ready");

  assert.match(domSource, /\.textContent\s*=/);
  assert.doesNotMatch(domSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(domSource, /insertAdjacentHTML|outerHTML|createContextualFragment/);
  assert.equal("setHtml" in dom, false);
  assert.equal("renderHtml" in dom, false);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

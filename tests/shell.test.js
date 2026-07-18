import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");

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
  assert.match(html, /src="\.\/scripts\/app\.js\?v=4"/);
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

test("today and plan shell expose the Phase 2 tracer surfaces", () => {
  for (const label of ["Morning weight", "Today's meals", "Breakfast", "Lunch", "Dinner", "Optional Snack"]) {
    assert.match(html, new RegExp(label), `missing ${label}`);
  }

  for (const copy of [
    "Weight is just one data point. It is not a reflection of you.",
    "Save weight",
    "No weight entered today.",
    "Not logged",
    "Logged",
    "Skipped",
    "Log meal",
    "Skip meal",
    "Ate when hungry?",
    "Stopped at enough?",
    "Plan meals",
    "Leave any slot blank if you do not want to plan it.",
    "Save plan",
    "No plan entered",
  ]) {
    assert.match(html, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${copy}`);
  }

  assert.match(html, /data-view="today"/);
  assert.match(html, /data-view="plan"/);
  assert.doesNotMatch(html, /required[^>]+data-plan-slot/);
});

test("plan shell gives every meal field an associated inline suggestion container", () => {
  const slotIDs = {
    breakfast: "plan-breakfast",
    lunch: "plan-lunch",
    dinner: "plan-dinner",
    snack: "plan-snack",
  };

  for (const [slot, inputID] of Object.entries(slotIDs)) {
    const suggestionID = `${inputID}-suggestions`;
    assert.match(html, new RegExp(`<input[^>]+id="${inputID}"[^>]+data-plan-slot="${slot}"[^>]+aria-controls="${suggestionID}"`), `missing aria-controls for ${slot}`);
    assert.match(html, new RegExp(`id="${suggestionID}"[^>]+data-plan-suggestions="${slot}"[^>]+hidden`), `missing suggestion container for ${slot}`);
  }

  assert.equal((html.match(/data-plan-suggestions=/g) || []).length, 4);
});

test("plan suggestion styling is compact, touch-friendly, and wrapping-safe", () => {
  assert.match(css, /\.plan-suggestions\s*\{[\s\S]*display: grid;[\s\S]*gap: 8px;[\s\S]*\}/);
  assert.match(css, /\.plan-suggestion-option\s*\{[\s\S]*min-height: 44px;[\s\S]*padding: 8px;[\s\S]*border-radius: 8px;[\s\S]*font-size: 16px;[\s\S]*overflow-wrap: anywhere;[\s\S]*\}/);
  assert.match(css, /\.plan-suggestion-option:focus-visible/);
  assert.match(css, /\.plan-suggestion-option:hover\s*\{[\s\S]*box-shadow: inset 4px 0 0 var\(--accent\);[\s\S]*\}/);
});

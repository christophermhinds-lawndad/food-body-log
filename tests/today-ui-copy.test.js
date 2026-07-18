import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");
const phaseUat = await readOptionalFile(new URL("../.planning/phases/02-today-tracking-loop/02-UAT.md", import.meta.url));

const forbiddenVisibleCopy = [
  "calories",
  "macros",
  "food grades",
  "goal weight",
  "target weight",
  "weight-loss advice",
  "streaks",
  "perfect days",
  "failures",
  "cheating",
  "good foods",
  "bad foods",
  "on track",
  "off track",
];

test("today and plan surfaces include the required Phase 2 copy", () => {
  for (const copy of [
    "Today",
    "Morning weight",
    "Weight is just one data point. It is not a reflection of you.",
    "Save weight",
    "Weight saved for today.",
    "No weight entered today.",
    "Today's meals",
    "Plan meals",
    "Tomorrow",
    "Today",
    "Leave any slot blank if you do not want to plan it.",
    "Save plan",
    "Plan saved.",
    "Meal log saved.",
    "Meal marked skipped.",
    "Ate when hungry?",
    "Stopped at enough?",
    "Yes",
    "No",
    "No plan entered",
    "This slot can stay blank. Add a plan when it helps.",
  ]) {
    assert.match(html + appSource, new RegExp(escapeRegExp(copy)), `missing ${copy}`);
  }
});

test("plan fields are optional and blank slots do not show warning or error copy", () => {
  assert.doesNotMatch(html, /data-plan-slot="[^"]+"[^>]*required/);
  assert.doesNotMatch(html, /required[^>]*data-plan-slot="[^"]+"/);
  assert.doesNotMatch(html, /blank[^<]*(warning|error|required)/i);
  assert.doesNotMatch(html, /missing[^<]*(meal|plan|slot)/i);
});

test("meal status labels use text plus non-color-only marker elements", () => {
  for (const state of ["notLogged", "logged", "skipped"]) {
    assert.match(css, new RegExp(`\\.status-marker\\[data-state="${state}"\\]`), `missing marker style for ${state}`);
  }

  assert.match(html, /data-status-text[^>]*>Not logged</, "missing initial status text element");

  for (const label of ["Not logged", "Logged", "Skipped"]) {
    assert.match(html + appSource, new RegExp(escapeRegExp(label)), `missing status text ${label}`);
  }
});

test("meal save and error rendering is scoped to the affected card", () => {
  assert.match(appSource, /form\.closest\("\[data-meal-card\]"\)/);
  assert.match(appSource, /card\.querySelector\("\[data-meal-message\]"\)/);
  assert.doesNotMatch(appSource, /document\.querySelector\(`\[data-meal-message="\$\{slot\}"\]`\)/);
});

test("forbidden diet, scoring, goal, advice, and moralized copy is absent", () => {
  const visibleRuntimeSource = `${html}\n${appSource}`.toLowerCase();

  for (const forbidden of forbiddenVisibleCopy) {
    assert.doesNotMatch(visibleRuntimeSource, new RegExp(escapeRegExp(forbidden)), `forbidden visible copy: ${forbidden}`);
  }
});

test("meal logging surface excludes notes, reflection prompts, chips, and emotion controls", () => {
  const mealSurface = html.match(/<div id="today-meal-list"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || "";

  assert.doesNotMatch(mealSurface, /<textarea\b|data-chip|chip-list|reflection|journal prompt|emotion|context|notes/i);
  assert.doesNotMatch(appSource, /data-chip|chip-list|journal prompt|emotion picker|reflection prompt/i);
});

test("phase 2 UAT records manual timing and target-device checks without claiming pass", () => {
  if (!phaseUat) {
    return;
  }

  for (const required of [
    "Localhost meal logging timing",
    "under 60 seconds",
    "390px layout and status contrast",
    "iPhone 13 Home Screen standalone framing",
    "Hosted launch and offline relaunch",
    "Phase 1 target-device boundary carried forward",
    "human-needed",
    "physical-device",
  ]) {
    assert.match(phaseUat, new RegExp(escapeRegExp(required)), `missing UAT item: ${required}`);
  }

  assert.doesNotMatch(phaseUat, /passed:\s*[1-9]/i);
  assert.doesNotMatch(phaseUat, /result:\s*pass/i);
});

test("phase 2 UAT avoids forbidden diet, scoring, advice, and setup language", () => {
  if (!phaseUat) {
    return;
  }

  for (const forbidden of [...forbiddenVisibleCopy, "package setup", "database service", "account setup"]) {
    assert.doesNotMatch(phaseUat.toLowerCase(), new RegExp(escapeRegExp(forbidden)), `forbidden UAT copy: ${forbidden}`);
  }
});

async function readOptionalFile(url) {
  try {
    return await readFile(url, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

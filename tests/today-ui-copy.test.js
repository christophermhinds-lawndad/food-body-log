import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../public/scripts/today-tracking.js", import.meta.url), "utf8");
const phaseUat = await readOptionalFile(new URL("../.planning/phases/02-today-tracking-loop/02-UAT.md", import.meta.url));
const phaseThreeUat = await readOptionalFile(new URL("../.planning/phases/03-planning-suggestions/03-UAT.md", import.meta.url));

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
  "recommended",
  "best match",
  "healthy",
  "good choice",
  "should eat",
  "score",
  "external source",
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
    "Undo skip",
    "Meal skip undone.",
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

test("skipped meals expose a reversible undo action", () => {
  for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
    assert.match(html, new RegExp(`data-unskip-meal="${slot}" hidden`), `missing hidden undo button for ${slot}`);
  }

  assert.match(appSource, /unskipMeal/);
  assert.match(appSource, /async function unskipSelectedMeal\(button\)/);
  assert.match(appSource, /document\.querySelectorAll\("\[data-unskip-meal\]"\)/);
  assert.match(appSource, /unskipMeal\(todayDayID, slot\)/);
  assert.match(appSource, /setText\(message, "Meal skip undone\."\)/);
  assert.match(appSource, /const skipButton = form\?\.querySelector\("\[data-skip-meal\]"\)/);
  assert.match(appSource, /const unskipButton = form\?\.querySelector\("\[data-unskip-meal\]"\)/);
  assert.match(appSource, /skipButton\.hidden = meal\.logState === MEAL_STATES\.skipped/);
  assert.match(appSource, /unskipButton\.hidden = meal\.logState !== MEAL_STATES\.skipped/);
  assert.match(css, /\.button-row:has\(\[data-unskip-meal\]:not\(\[hidden\]\)\)/);
});

test("save success paths require Ready status and guard stale plan days", () => {
  assert.match(appSource, /function isReadyResult\(result\)/);
  assert.match(appSource, /result\?\.available === true && result\.status === "Ready"/);
  assert.match(appSource, /refreshCurrentDayIDs\(\);\n\s+const selectedDayID = planDayID;/);
  assert.match(appSource, /savePlan\(selectedDayID, plannedTextBySlot\)/);
  assert.match(appSource, /if \(selectedDayID !== planDayID\)/);
  assert.match(appSource, /selectedDayID === todayDayID && result\.day\.dayID === todayDayID/);
  assert.match(appSource, /if \(!isReadyResult\(result\)\)/);
});

test("today and plan storage paths refresh local day IDs before use", () => {
  assert.match(appSource, /function refreshCurrentDayIDs\(\)/);
  assert.match(appSource, /todayDayID = getTodayDayID\(\);/);
  assert.match(appSource, /planDayID = selectedPlanDayID\(\);/);
  assert.match(appSource, /async function loadTodayView\(\) \{\n\s+refreshCurrentDayIDs\(\);/);
  assert.match(appSource, /const requestedDayID = todayDayID;/);
  assert.match(appSource, /state\.available && \(requestedDayID !== todayDayID \|\| state\.day\.dayID !== getTodayDayID\(\)\)/);
  assert.match(appSource, /async function loadPlanView\(\) \{\n\s+refreshCurrentDayIDs\(\);/);
  assert.match(appSource, /async function saveTodayWeight\(\) \{\n\s+refreshCurrentDayIDs\(\);/);
  assert.match(appSource, /async function saveMealFromForm\(form\) \{\n\s+refreshCurrentDayIDs\(\);/);
  assert.match(appSource, /async function skipSelectedMeal\(button\) \{\n\s+refreshCurrentDayIDs\(\);/);
  assert.match(appSource, /async function unskipSelectedMeal\(button\) \{\n\s+refreshCurrentDayIDs\(\);/);
});

test("forbidden diet, scoring, goal, advice, and moralized copy is absent", () => {
  const visibleRuntimeSource = `${html}\n${appSource}`.toLowerCase();

  for (const forbidden of forbiddenVisibleCopy) {
    assert.doesNotMatch(visibleRuntimeSource, new RegExp(escapeRegExp(forbidden)), `forbidden visible copy: ${forbidden}`);
  }
});

test("plan suggestions render safely and stay outside the save path", () => {
  assert.match(appSource, /function renderPlanSuggestions\(input, suggestions\)/);
  assert.match(appSource, /setText\(button, suggestion\)/);
  assert.doesNotMatch(appSource, /plan-suggestion[\s\S]{0,500}\.innerHTML\s*=/);
  assert.match(appSource, /button\.type = "button"/);
  assert.match(appSource, /button\.addEventListener\("pointerdown", \(event\) => \{\n\s+event\.preventDefault\(\);\n\s+applyPlanSuggestion\(input, suggestion\);/);
  assert.match(appSource, /button\.addEventListener\("click", \(event\) => \{\n\s+event\.preventDefault\(\);\n\s+applyPlanSuggestion\(input, suggestion\);/);
  assert.match(appSource, /function applyPlanSuggestion\(input, suggestionText\)/);
  assert.doesNotMatch(appSource, /function applyPlanSuggestion[\s\S]*savePlan\(/);
  assert.doesNotMatch(appSource, /dataset\.planSlot !== "breakfast"/);
});

test("plan suggestion failure copy is non-blocking and UAT tracks visual backstops", () => {
  assert.match(appSource, /const SUGGESTION_ERROR_MESSAGE = "Suggestions could not be loaded\. You can keep typing\."/);
  assert.match(appSource, /function clearSuggestionFailureMessage\(\)/);
  assert.match(appSource, /planMessage\?\.textContent === SUGGESTION_ERROR_MESSAGE/);
  assert.match(appSource, /hideAllPlanSuggestions\(\);/);
  assert.match(appSource, /document\.addEventListener\("pointerdown"/);
  assert.match(appSource, /planForm\?\.addEventListener\("focusout"/);

  for (const required of [
    "390px Visual Checks",
    "Long Text Wrapping",
    "Keyboard And Focus",
    "Outside Click And Blur",
    "Today/Tomorrow Switching",
    "Storage Unavailable",
    "Offline Relaunch Boundary",
    "iPhone 13 Home Screen Checks",
    "human-needed",
    "physical iPhone 13 and hosted HTTPS URL evidence not available",
  ]) {
    assert.match(phaseThreeUat, new RegExp(escapeRegExp(required)), `missing Phase 03 UAT item: ${required}`);
  }
});

test("plan suggestions stay local-only without external or package artifacts", async () => {
  const packageJson = await readOptionalFile(new URL("../package.json", import.meta.url));
  const packageLock = await readOptionalFile(new URL("../package-lock.json", import.meta.url));
  const runtimeSource = `${appSource}\n${repositorySource}`;

  assert.match(repositorySource, /objectStore\(MEALS_STORE\)\.getAll\(\)/);
  assert.doesNotMatch(runtimeSource, /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|https?:\/\//);
  assert.equal(packageJson, "");
  assert.equal(packageLock, "");
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

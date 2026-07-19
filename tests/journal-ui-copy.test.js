import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");
const modelSource = await readFile(new URL("../public/scripts/journal-model.js", import.meta.url), "utf8");
const historyReportsSource = await readFile(new URL("../public/scripts/history-reports.js", import.meta.url), "utf8");
const phase04UatUrl = new URL("../.planning/phases/04-evening-reflection-and-breakthroughs/04-UAT.md", import.meta.url);

const journalRequiredCopy = [
  "Reflection",
  "Breakthroughs",
  "Loading evening reflection...",
  "Evening reflection could not be loaded. Reopen the app and try again.",
  "Reflection saved.",
  "Did I eat food outside of my plan, when I was not hungry?",
  "What food?",
  "What time of day?",
  "Context Tiles",
  "Meals marked as eaten past enough",
  "Meals marked as eaten when not hungry",
  "How was I feeling around food today?",
  "What helped me listen to hunger or enough today?",
  "What would support me tomorrow?",
  "What was happening when I ate when I was not hungry?",
  "What was happening when I ate past enough?",
  "What might I try differently next time?",
  "Nothing extra to reflect on from today's meal answers. You can still write anything that feels useful.",
  "Not all meals are logged yet. That is okay; only logged non-skipped No answers add extra prompts.",
  "Optional context",
  "Optional detail",
  "Save reflection",
  "Mark as breakthrough",
  "Remove breakthrough",
  "Marked as breakthrough",
  "No breakthroughs saved yet",
  "Mark an answer as a breakthrough when something feels useful to remember.",
  "View source day",
  "Opened source day in History.",
  "Drop from breakthroughs",
  "Breakthrough removed. The original answer stayed saved.",
  "Remove the breakthrough highlight? The original journal answer will stay saved.",
];

const forbiddenJournalCopy = [
  "failure",
  "cheat",
  "bad food",
  "good food",
  "should have",
  "slipped",
  "ruined",
  "streak",
  "score",
  "perfect",
  "calories",
  "macros",
  "diet",
  "weight-loss advice",
  "should eat",
];

test("journal surface exposes required Reflection and Breakthroughs copy", () => {
  const source = `${html}\n${appSource}\n${modelSource}\n${historyReportsSource}`;

  for (const copy of journalRequiredCopy) {
    assert.match(source, new RegExp(escapeRegExp(copy)), `missing Journal copy: ${copy}`);
  }
});

test("journal markup starts with usable reflection form and optional fields", () => {
  const journalSurface = html.match(/<section class="view-panel[^"]*" data-view="journal"[\s\S]*?<\/section>\s*<section class="view-panel[^"]*" data-view="history"/)?.[0] || "";

  assert.match(journalSurface, /<form[^>]+id="journal-form"[^>]+class="stack-form"/);
  assert.match(journalSurface, /id="journal-prompt-list"/);
  assert.match(journalSurface, /name="outside-plan" value="yes"/);
  assert.match(journalSurface, /name="outside-plan" value="no"/);
  assert.match(journalSurface, /id="breakthrough-list"/);
  assert.match(journalSurface, /id="journal-message"[^>]+aria-live="polite"/);
  assert.match(journalSurface, /id="breakthrough-message"[^>]+aria-live="polite"/);
  assert.match(journalSurface, /data-journal-prompt-template/);
  assert.match(journalSurface, /data-breakthrough-template/);
  assert.doesNotMatch(journalSurface, /<textarea[^>]*required|required[^>]*<textarea/);
});

test("journal controller imports repository and wires load save breakthrough actions", () => {
  assert.match(appSource, /import \{ JOURNAL_CHIPS/);
  assert.match(appSource, /from "\.\/journal-model\.js\?v=2"/);
  assert.match(appSource, /getJournalState, saveReflection, setAnswerBreakthrough, dropBreakthrough/);
  assert.match(appSource, /function updateJournalPromptsForOutsidePlanChoice\(\)/);
  assert.match(appSource, /OUTSIDE_PLAN_PROMPT_ID/);
  assert.match(appSource, /if \(tabName === "journal"\) \{\n\s+loadJournalView\(\);/);
  assert.match(appSource, /async function loadJournalView\(\)/);
  assert.match(appSource, /async function saveJournalReflection\(\)/);
  assert.match(appSource, /function serializeJournalAnswers\(\)/);
  assert.match(appSource, /async function toggleAnswerBreakthrough\(button\)/);
  assert.match(appSource, /async function dropSelectedBreakthrough\(button\)/);
  assert.match(appSource, /function openHistorySourceDay\(dayID\)/);
  assert.match(appSource, /openHistorySourceDay\(card\?\.dataset\.dayId \|\| journalDayID\)/);
});

test("journal dynamic rendering uses DOM nodes and scoped closest actions", () => {
  const runtimeSource = `${appSource}\n${modelSource}`;

  assert.match(appSource, /document\.createElement\("article"\)/);
  assert.match(appSource, /textArea\.value = answer\?\.text \|\| ""/);
  assert.match(appSource, /setText\(.*breakthrough\.text/);
  assert.match(appSource, /button\.closest\("\[data-journal-answer-card\]"\)/);
  assert.match(appSource, /button\.closest\("\[data-breakthrough-card\]"\)/);
  assert.match(appSource, /window\.confirm\("Remove breakthrough: Remove the breakthrough highlight\? The original journal answer will stay saved\."\)/);
  assert.match(appSource, /window\.confirm\("Drop breakthrough: Drop this breakthrough\? The original journal answer will stay saved\."\)/);
  assert.doesNotMatch(runtimeSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(runtimeSource, /\binsertAdjacentHTML\s*\(/);
  assert.doesNotMatch(runtimeSource, /\bouterHTML\s*=/);
});

test("breakthrough metadata actions save unsaved reflection fields before reloading", () => {
  assert.match(appSource, /async function saveCurrentJournalDraft\(\)/);
  assert.match(appSource, /async function toggleAnswerBreakthrough\(button\)[\s\S]*const saved = await saveCurrentJournalDraft\(\);[\s\S]*const result = await setAnswerBreakthrough/);
  assert.match(appSource, /async function dropSelectedBreakthrough\(button\)[\s\S]*const saved = await saveCurrentJournalDraft\(\);[\s\S]*const result = await dropBreakthrough/);
});

test("today meal cards still exclude reflection controls", () => {
  const mealSurface = html.match(/<div id="today-meal-list"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || "";

  assert.doesNotMatch(mealSurface, /<textarea\b|data-journal|data-chip|Optional context|Optional detail|Mark as breakthrough|reflection prompt/i);
});

test("journal visible copy avoids forbidden diet scoring and shame language", () => {
  const visibleJournalSource = `${html}\n${appSource}`.toLowerCase();

  for (const forbidden of forbiddenJournalCopy) {
    assert.doesNotMatch(visibleJournalSource, new RegExp(escapeRegExp(forbidden)), `forbidden Journal copy: ${forbidden}`);
  }
});

test("journal UI state and mobile backstop coverage is statically named", () => {
  for (const state of [
    "Loading evening reflection...",
    "Reflection could not be saved. Try again; data already saved on this device stays local.",
    "No breakthroughs saved yet",
    "breakthrough-empty",
    "breakthrough-card",
    "breakthrough-answer",
    "journal-chip-list",
    "journal-context-list",
    "journal-gate",
    "journal-textarea",
    "overflow-wrap: anywhere",
    "@media (max-width: 430px)",
  ]) {
    assert.match(`${html}\n${css}\n${appSource}`, new RegExp(escapeRegExp(state)), `missing state/backstop marker: ${state}`);
  }
});

test("Phase 04 UAT records mobile backstops without overstating unavailable device evidence", async () => {
  const uat = await readFile(phase04UatUrl, "utf8");
  const normalized = normalizeDoc(uat);

  const requiredBackstops = [
    "390px Journal layout",
    "15-chip wrapping",
    "long answer wrapping",
    "one breakthrough",
    "many breakthroughs",
    "no-chip breakthrough",
    "source-day message",
    "remove/drop confirmation",
    "source-answer survival copy",
    "prompt cards, chip groups, textareas, and save controls do not create horizontal overflow or collide with the fixed bottom tab bar",
    "many breakthrough cards stack vertically with page scrolling and no clipped action buttons",
    "long answers and long unbroken words wrap inside breakthrough cards without clipping, horizontal scrolling, or overlap with actions",
  ];

  for (const backstop of requiredBackstops) {
    assert.match(uat, new RegExp(escapeRegExp(backstop), "i"), `missing UAT backstop: ${backstop}`);
  }

  for (const unavailableEvidence of [
    "physical iPhone 13",
    "Home Screen install",
    "hosted HTTPS URL",
    "offline relaunch",
  ]) {
    assert.ok(
      normalized.includes(`${unavailableEvidence.toLowerCase()} evidence: human-needed`),
      `must mark ${unavailableEvidence} evidence human-needed`,
    );
  }

  assert.doesNotMatch(uat, /physical iPhone 13 evidence:\s*(pass|passed|complete|local-browser-pass)/i);
  assert.doesNotMatch(uat, /Home Screen install evidence:\s*(pass|passed|complete|local-browser-pass)/i);
  assert.doesNotMatch(uat, /hosted HTTPS URL evidence:\s*(pass|passed|complete|local-browser-pass)/i);
  assert.doesNotMatch(uat, /offline relaunch evidence:\s*(pass|passed|complete|local-browser-pass)/i);
});

function normalizeDoc(value) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

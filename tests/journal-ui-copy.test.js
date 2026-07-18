import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");

const journalRequiredCopy = [
  "Reflection",
  "Breakthroughs",
  "Loading evening reflection...",
  "Evening reflection could not be loaded. Reopen the app and try again.",
  "Reflection saved.",
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
  "Source-day navigation will open this day when History is available.",
  "Drop from breakthroughs",
  "Breakthrough removed. The original answer stayed saved.",
  "Remove the breakthrough highlight? The original journal answer will stay saved.",
];

test("journal surface exposes required Reflection and Breakthroughs copy", () => {
  const source = `${html}\n${appSource}`;

  for (const copy of journalRequiredCopy) {
    assert.match(source, new RegExp(escapeRegExp(copy)), `missing Journal copy: ${copy}`);
  }
});

test("journal markup starts with usable reflection form and optional fields", () => {
  const journalSurface = html.match(/<section class="view-panel[^"]*" data-view="journal"[\s\S]*?<\/section>\s*<section class="view-panel" data-view="history"/)?.[0] || "";

  assert.match(journalSurface, /<form[^>]+id="journal-form"[^>]+class="stack-form"/);
  assert.match(journalSurface, /id="journal-prompt-list"/);
  assert.match(journalSurface, /id="breakthrough-list"/);
  assert.match(journalSurface, /id="journal-message"[^>]+aria-live="polite"/);
  assert.match(journalSurface, /id="breakthrough-message"[^>]+aria-live="polite"/);
  assert.match(journalSurface, /data-journal-prompt-template/);
  assert.match(journalSurface, /data-breakthrough-template/);
  assert.doesNotMatch(journalSurface, /<textarea[^>]*required|required[^>]*<textarea/);
});

test("journal controller imports repository and wires load save breakthrough actions", () => {
  assert.match(appSource, /import \{ JOURNAL_CHIPS/);
  assert.match(appSource, /from "\.\/journal-model\.js\?v=1"/);
  assert.match(appSource, /getJournalState, saveReflection, setAnswerBreakthrough, dropBreakthrough/);
  assert.match(appSource, /if \(tabName === "journal"\) \{\n\s+loadJournalView\(\);/);
  assert.match(appSource, /async function loadJournalView\(\)/);
  assert.match(appSource, /async function saveJournalReflection\(\)/);
  assert.match(appSource, /function serializeJournalAnswers\(\)/);
  assert.match(appSource, /async function toggleAnswerBreakthrough\(button\)/);
  assert.match(appSource, /async function dropSelectedBreakthrough\(button\)/);
  assert.match(appSource, /function showSourceDayMessage\(button\)/);
});

test("journal dynamic rendering uses DOM nodes and scoped closest actions", () => {
  assert.match(appSource, /document\.createElement\("article"\)/);
  assert.match(appSource, /setText\(.*answer\.text/);
  assert.match(appSource, /setText\(.*breakthrough\.text/);
  assert.match(appSource, /button\.closest\("\[data-journal-answer-card\]"\)/);
  assert.match(appSource, /button\.closest\("\[data-breakthrough-card\]"\)/);
  assert.match(appSource, /window\.confirm\("Remove breakthrough: Remove the breakthrough highlight\? The original journal answer will stay saved\."\)/);
  assert.match(appSource, /window\.confirm\("Drop breakthrough: Drop this breakthrough\? The original journal answer will stay saved\."\)/);
  assert.doesNotMatch(appSource, /journal[\s\S]{0,2200}\.innerHTML\s*=/);
});

test("today meal cards still exclude reflection controls", () => {
  const mealSurface = html.match(/<div id="today-meal-list"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || "";

  assert.doesNotMatch(mealSurface, /<textarea\b|data-journal|data-chip|Optional context|Optional detail|Mark as breakthrough|reflection prompt/i);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

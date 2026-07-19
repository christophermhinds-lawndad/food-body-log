import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const runtimeFiles = await loadRuntimeFiles();
const runtimeSource = runtimeFiles.map(({ contents }) => contents).join("\n");
const normalizedRuntime = normalizeCopy(runtimeSource);
const html = await readRuntimeFile("public/index.html");
const appSource = await readRuntimeFile("public/scripts/app.js");
const historyReportsSource = await readRuntimeFile("public/scripts/history-reports.js");

const forbiddenVisibleCopy = [
  "calories",
  "macros",
  "food grades",
  "goal weight",
  "target weight",
  "weight-loss advice",
  "diet recommendations",
  "recommended diet",
  "food scoring",
  "meal scoring",
  "perfect day",
  "perfect days",
  "streak",
  "streaks",
  "broken streak",
  "failure",
  "fail",
  "failed",
  "success score",
  "shame",
  "cheating",
  "bad food",
  "good food",
  "on track",
  "off track",
  "should eat",
  "healthy choice",
  "weight loss",
  "eating more",
  "weight gain",
  "changes are needed",
];

const requiredCalmCopy = [
  "No",
  "Skipped",
  "Not logged",
  "No plan entered",
  "This slot can stay blank. Add a plan when it helps.",
  "No weight entered today.",
  "No weight entered",
  "No weight data for this period.",
  "No logged meals for this period.",
  "Not enough logged data yet. Logged non-skipped meals will count here.",
  "Backup could not be read. Choose a Food Body Log JSON backup exported from this app.",
  "This backup format is not supported by this version of Food Body Log.",
  "This backup is missing required local data sections, so nothing was imported.",
  "Nothing was imported, and the local data already on this device was not changed.",
  "Read-only",
  "This day is outside the 72-hour edit window, so it is shown as a saved record.",
];

const requiredReportCopy = [
  "Weight notice: Saved entries are higher across some periods.",
  "Weight notice: Saved entries are lower across some periods.",
  "Weight notice: Saved entries are holding near the recent range.",
  "These numbers are for observation only; no action is required here.",
  "Numeric summaries use only saved local entries. Sparse periods show when there is not enough data.",
  "Based on {count} weight entry/entries in this period.",
  "{yesCount} Yes out of {denominator} logged non-skipped meals.",
];

test("whole-app runtime copy excludes diet scoring pressure and shame framing", () => {
  for (const forbidden of forbiddenVisibleCopy) {
    assert.doesNotMatch(
      normalizedRuntime,
      phrasePattern(forbidden),
      `forbidden runtime copy: ${forbidden}`,
    );
  }
});

test("calm status and backup caveat copy is present for missing skipped invalid and read-only states", () => {
  for (const copy of requiredCalmCopy) {
    assert.match(runtimeSource, new RegExp(escapeRegExp(copy)), `missing calm copy: ${copy}`);
  }

  assert.match(
    runtimeSource,
    /Deleting the Home Screen app, clearing website data, or changing browser storage can remove local app data from this device\./,
  );
  assert.match(runtimeSource, /Your data stays on this device\./);
  assert.doesNotMatch(normalizedRuntime, /\b(upload|cloud sync|server restore|remote storage|analytics|account backup)\b/);
});

test("report copy keeps numeric summaries without advice or outcome pressure", () => {
  for (const copy of requiredReportCopy) {
    assert.match(historyReportsSource + html, new RegExp(escapeRegExp(copy)), `missing Reports copy: ${copy}`);
  }

  for (const unsafeReportCopy of [
    "Reflect: Data shows meaningful weight gain across some periods.",
    "Progressing: Data shows sustainable weight loss.",
    "Consider Eating More: Current weight loss may trigger strong homeostatic response.",
    "If you want to maintain this as baseline, no changes are needed.",
  ]) {
    assert.doesNotMatch(historyReportsSource + html, new RegExp(escapeRegExp(unsafeReportCopy)));
  }
});

test("runtime user-authored and imported text avoids raw html insertion sinks", () => {
  const htmlSinkPattern = /\.innerHTML\s*=|\binsertAdjacentHTML\s*\(|\.outerHTML\s*=|createContextualFragment|DOMParser|setHTMLUnsafe/;

  assert.doesNotMatch(appSource, htmlSinkPattern);
  assert.doesNotMatch(historyReportsSource, htmlSinkPattern);
  assert.match(appSource, /\bsetText\(/);
  assert.match(appSource, /\.value\s*=/);
  assert.match(appSource, /parseBackupText\(text\)/);
  assert.match(appSource, /setText\(backupSelectedFile,/);
});

async function loadRuntimeFiles() {
  const scriptDir = new URL("../public/scripts/", import.meta.url);
  const scriptNames = (await readdir(scriptDir)).filter((name) => name.endsWith(".js")).sort();
  const files = [
    "public/index.html",
    "public/styles/app.css",
    ...scriptNames.map((name) => `public/scripts/${name}`),
  ];

  return Promise.all(files.map(async (filePath) => ({
    filePath,
    contents: await readRuntimeFile(filePath),
  })));
}

async function readRuntimeFile(filePath) {
  return readFile(new URL(`../${filePath}`, import.meta.url), "utf8");
}

function normalizeCopy(value) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function phrasePattern(value) {
  return new RegExp(`\\b${escapeRegExp(value.toLowerCase()).replace(/\\ /g, "\\s+")}\\b`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

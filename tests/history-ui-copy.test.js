import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const historyReportsSource = await readFile(new URL("../public/scripts/history-reports.js", import.meta.url), "utf8");
const historyReportsTests = await readFile(new URL("./history-reports.test.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");

const requiredExports = [
  "getHistoryState",
  "getHistoryDay",
  "saveHistoryDay",
  "getReportsState",
  "summarizeWeightAverages",
  "summarizeMealMetric",
  "isHistoryListableDay",
  "formatWeightAverage",
  "HISTORY_COPY",
  "REPORTS_COPY",
];

const requiredHistoryCopy = [
  "History",
  "Loading history...",
  "No history yet",
  "Daily entries will appear here after you save meals, weight, or reflection.",
  "History could not be loaded. Reopen the app and try again. Data already saved on this device stays local.",
  "Editable",
  "Read-only",
  "This day is outside the 72-hour edit window, so it is shown as a saved record.",
  "This day is still inside the 72-hour edit window.",
  "Save day",
  "Day saved.",
  "Day could not be saved. Try again.",
  "No plan entered",
  "No weight entered",
  "No reflection saved",
  "No breakthroughs marked for this day",
  "Opened source day in History.",
];

const requiredReportsCopy = [
  "Reports",
  "Numeric summaries use only saved local entries. Sparse periods show when there is not enough data.",
  "Loading reports...",
  "Reports could not be loaded. Reopen the app and try again. Data already saved on this device stays local.",
  "Weight averages",
  "Trailing 7 days",
  "Trailing 30 days",
  "Trailing 90 days",
  "Based on {count} weight entry/entries in this period.",
  "No weight data for this period.",
  "Meal metrics",
  "Ate when hungry",
  "Stopped at enough",
  "{yesCount} Yes out of {denominator} logged non-skipped meals.",
  "No logged meals for this period.",
  "Not enough logged data yet. Logged non-skipped meals will count here.",
];

const forbiddenSourcePatterns = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bsendBeacon\b/,
  /\bcaches\b/,
  /\bCacheStorage\b/,
  /\bhttps?:\/\//,
  /\bapi\/|backend|analytics|node_modules|package\.json|child_process|exec\(/i,
  /\bcanvas\b|\bsvg\b|\bchart\b|\bsparkline\b|\btrendline\b|\bheatmap\b/i,
  /\btrend(?:ing)?\b|\bimproving\b|\bworsening\b|\bon track\b|\boff track\b/i,
  /\bgoal\b|\btarget\b|\bsuccess\b|\bfailure\b|\bstreak\b|\bperfect\b|\bcheat\b/i,
  /\bbad food\b|\bgood food\b|\bcalories\b|\bmacros\b|\bdiet\b|\bweight-loss advice\b|\bmedical advice\b/i,
];

test("history reports repository exports the data seam and copy constants", async () => {
  const repository = await import(`../public/scripts/history-reports.js?copy=${Date.now()}`);

  for (const exportName of requiredExports) {
    assert.ok(exportName in repository, `missing export ${exportName}`);
  }

  for (const copy of requiredHistoryCopy) {
    assert.ok(Object.values(repository.HISTORY_COPY).includes(copy), `missing History copy: ${copy}`);
  }

  for (const copy of requiredReportsCopy) {
    assert.ok(Object.values(repository.REPORTS_COPY).includes(copy), `missing Reports copy: ${copy}`);
  }
});

test("history reports source stays local-only and excludes Phase 5 overclaim constructs", () => {
  for (const pattern of forbiddenSourcePatterns) {
    assert.doesNotMatch(historyReportsSource, pattern);
  }
});

test("static guard tracks non-mutating browse and prior-day weight confirmation assumptions", () => {
  assert.match(historyReportsTests, /without mutating storage/);
  assert.match(historyReportsTests, /saved-content days/);
  assert.match(historyReportsTests, /read-only rejection must happen before opening transactions/);
  assert.match(historyReportsTests, /confirmLargeChange/);
  assert.match(historyReportsTests, /NeedsConfirmation/);
  assert.match(historyReportsTests, /possible-weight-typo/);
});

test("copy guard scopes forbidden checks to the History Reports repository", () => {
  assert.match(historyReportsSource, /from "\.\/storage\.js"/);
  assert.match(historyReportsSource, /from "\.\/day-policy\.js"/);
  assert.match(historyReportsSource, /from "\.\/tracking-model\.js\?v=3"/);
  assert.match(historyReportsSource, /from "\.\/journal-model\.js\?v=2"/);
  assert.doesNotMatch(historyReportsSource, /\.innerHTML\s*=|insertAdjacentHTML\s*\(|outerHTML\s*=/);
});

test("history shell exposes browse detail edit containers and templates", () => {
  for (const expected of [
    'id="history-status"',
    'id="history-list"',
    'id="history-detail"',
    'id="history-detail-title"',
    'id="history-save-message"',
    "data-history-day-template",
    "data-history-meal-template",
    "data-history-answer-template",
    "Save day",
    "Read-only",
    "Editable",
  ]) {
    assert.match(html, new RegExp(escapeRegExp(expected)), `missing History shell artifact ${expected}`);
  }

  assert.doesNotMatch(historyPanelHtml(), /disabled[^>]+(?:Save day|history)|(?:Save day|history)[^>]+disabled/i);
  assert.doesNotMatch(historyPanelHtml(), />\s*(?:Delete|Reset|Export|Import)\b/i);
});

test("history controller loads repository state, guards stale selected days, and saves through saveHistoryDay only", () => {
  assert.match(appSource, /from "\.\/history-reports\.js\?v=\d+"/);

  for (const symbol of [
    "HISTORY_COPY",
    "getHistoryState",
    "getHistoryDay",
    "saveHistoryDay",
    "loadHistoryView",
    "loadSelectedHistoryDay",
    "renderHistoryState",
    "renderHistoryDayDetail",
    "saveSelectedHistoryDay",
    "serializeHistoryDraft",
    "openHistorySourceDay",
  ]) {
    assert.match(appSource, new RegExp(`\\b${symbol}\\b`), `missing controller symbol ${symbol}`);
  }

  assert.match(appSource, /if\s*\(\s*tabName === "history"\s*\)[\s\S]*loadHistoryView\(\)/);
  assert.match(appSource, /historyLoadRequestID/);
  assert.match(appSource, /historyDayLoadRequestID/);
  assert.match(appSource, /requestID !== historyDayLoadRequestID/);
  assert.match(appSource, /setText\([^)]*HISTORY_COPY\.sourceDayOpened/);
  assert.doesNotMatch(historyControllerSlice(), /\b(savePlan|saveMealLog|saveWeight|saveReflection|ensureDay|ensureMealsForDay)\s*\(/);
});

test("history dynamic rendering uses text-safe sinks and form values instead of html injection", () => {
  assert.doesNotMatch(historyControllerSlice(), /\.innerHTML\s*=|insertAdjacentHTML\s*\(|outerHTML\s*=/);
  assert.match(historyControllerSlice(), /document\.createElement\(/);
  assert.match(historyControllerSlice(), /\.content\.firstElementChild\.cloneNode\(true\)/);
  assert.match(historyControllerSlice(), /setText\(/);
  assert.match(historyControllerSlice(), /\.value\s*=/);
});

test("history styles provide required mobile-safe selectors and wrapping backstops", () => {
  for (const selector of [
    ".history-list",
    ".history-day-card",
    ".history-day-card.is-selected",
    ".day-detail",
    ".history-detail-section",
    ".editable-badge",
    ".read-only-badge",
    ".history-value-row",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)), `missing ${selector} styles`);
  }

  assert.match(css, /\.history-day-card,[\s\S]*\.day-detail,[\s\S]*\.history-detail-section[\s\S]*border-radius: 8px;[\s\S]*background: var\(--surface\);/);
  assert.match(css, /\.history-day-button[\s\S]*min-height: 44px;[\s\S]*text-align: left;/);
  assert.match(css, /\.history-day-card\.is-selected[\s\S]*border-color: var\(--accent\);[\s\S]*box-shadow: inset 4px 0 0 var\(--accent\);/);
  assert.match(css, /\.editable-badge,[\s\S]*\.read-only-badge[\s\S]*min-height: 32px;[\s\S]*border-radius: 8px;[\s\S]*font-size: 13px;/);
  assert.match(css, /\.history-day-summary,[\s\S]*\.history-detail-section p,[\s\S]*\.history-value-row,[\s\S]*\.history-value-row p,[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /390px iPhone history overflow backstop/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.history-list,[\s\S]*\.day-detail,[\s\S]*\.history-detail-section,[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("history styles extend focus-visible coverage and avoid destructive controls", () => {
  const focusBlock = css.match(/\.primary-action:focus-visible[\s\S]*?\{[\s\S]*?outline: 3px solid var\(--accent\);[\s\S]*?\}/)?.[0] || "";

  for (const selector of [
    "[data-history-day]:focus-visible",
    "[data-history-save]:focus-visible",
    "[data-history-answer-chip]:focus-visible",
  ]) {
    assert.match(focusBlock, new RegExp(escapeRegExp(selector)), `missing focus selector ${selector}`);
  }

  assert.doesNotMatch(historyPanelHtml(), />\s*(?:Delete|Reset|Export|Import)\b/i);
  assert.doesNotMatch(css, /\.history-[^{]*(?:destructive|delete|reset|export|import)/i);
  assert.doesNotMatch(historyDayTemplateHtml(), /history-detail-section/);
});

function historyPanelHtml() {
  const start = html.indexOf('data-view="history"');
  const end = html.indexOf('data-view="settings"', start);
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

function historyControllerSlice() {
  const start = appSource.indexOf("async function loadHistoryView");
  const end = appSource.indexOf("async function saveTodayWeight");
  return start >= 0 && end > start ? appSource.slice(start, end) : "";
}

function historyDayTemplateHtml() {
  return html.match(/<template data-history-day-template>[\s\S]*?<\/template>/)?.[0] || "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

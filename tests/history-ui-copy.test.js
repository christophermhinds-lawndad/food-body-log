import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const historyReportsSource = await readFile(new URL("../public/scripts/history-reports.js", import.meta.url), "utf8");
const historyReportsTests = await readFile(new URL("./history-reports.test.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/scripts/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles/app.css", import.meta.url), "utf8");
const phaseFiveUat = await readFile(new URL("../.planning/phases/05-history-and-numeric-reports/05-UAT.md", import.meta.url), "utf8");

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

test("reports shell exposes fixed numeric groups and tile template", () => {
  for (const expected of [
    "reports-view",
    'id="reports-status"',
    'id="weight-reports"',
    'id="meal-reports"',
    "data-report-tile-template",
    "Numeric summaries use only saved local entries. Sparse periods show when there is not enough data.",
    "Weight averages",
    "Meal metrics",
    "Trailing 7 days",
    "Trailing 30 days",
    "Trailing 90 days",
    "Ate when hungry",
    "Stopped at enough",
  ]) {
    assert.match(html, new RegExp(escapeRegExp(expected)), `missing Reports shell artifact ${expected}`);
  }

  assert.equal((reportsPanelHtml().match(/data-report-tile(?:\s|=)/g) || []).length, 5);
  assert.doesNotMatch(reportsPanelHtml(), /<canvas\b|<svg\b|<table\b/i);
});

test("reports controller loads local DTOs and renders fixed sparse-safe tiles", () => {
  for (const symbol of [
    "REPORTS_COPY",
    "getReportsState",
    "loadReportsView",
    "renderReportsState",
    "renderWeightReportTile",
    "renderMealReportTile",
    "reportValueText",
    "reportDenominatorText",
  ]) {
    assert.match(appSource, new RegExp(`\\b${symbol}\\b`), `missing controller symbol ${symbol}`);
  }

  assert.match(appSource, /if\s*\(\s*tabName === "reports"\s*\)[\s\S]*loadReportsView\(\)/);
  assert.match(appSource, /reportsLoadRequestID/);
  assert.match(appSource, /requestID !== reportsLoadRequestID/);
  assert.match(reportsControllerSlice(), /state\.weightAverages/);
  assert.match(reportsControllerSlice(), /state\.mealMetrics/);
  assert.match(reportsControllerSlice(), /REPORTS_COPY\.weightNoData/);
  assert.match(reportsControllerSlice(), /REPORTS_COPY\.mealNoData/);
  assert.match(reportsControllerSlice(), /REPORTS_COPY\.mealInsufficient/);
  assert.match(reportsControllerSlice(), /setText\(/);
  assert.doesNotMatch(reportsControllerSlice(), /\.innerHTML\s*=|insertAdjacentHTML\s*\(|outerHTML\s*=/);
  assert.doesNotMatch(reportsControllerSlice(), /\b(savePlan|saveMealLog|saveWeight|saveReflection|saveHistoryDay|fetch|XMLHttpRequest)\s*\(/);
});

test("reports styles provide numeric tile selectors and 390px wrapping backstops", () => {
  for (const selector of [
    ".reports-view",
    ".reports-section",
    ".reports-grid",
    ".report-card",
    ".report-label",
    ".report-value",
    ".report-denominator",
    ".report-state",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)), `missing ${selector} styles`);
  }

  assert.match(css, /\.report-card[\s\S]*border-radius: 8px;[\s\S]*background: var\(--surface\);/);
  assert.match(css, /\.report-value[\s\S]*font-size: 16px;[\s\S]*font-weight: 600;[\s\S]*line-height: 1\.5;/);
  assert.doesNotMatch(css, /\.report-value[\s\S]*font-size: (?:20px|28px);/);
  assert.match(css, /\.report-card h3,[\s\S]*\.report-label,[\s\S]*\.report-value,[\s\S]*\.report-denominator,[\s\S]*\.report-state[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /reports overflow backstop/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.reports-view,[\s\S]*\.reports-section,[\s\S]*\.reports-grid,[\s\S]*\.report-card[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("reports surface stays numeric-only with no visualizations framing or network calls", () => {
  const forbiddenReportsCopy = /\b(?:trend|trending|improving|worsening|on track|off track|goal|target|success|failure|streak|perfect|cheat|bad food|good food|calories|macros|diet|weight-loss advice|medical advice)\b/i;
  const forbiddenReportSource = /\b(?:fetch|XMLHttpRequest|sendBeacon|canvas|svg|chart|sparkline|trendline|heatmap|delta|goal|target|red|green)\b/i;

  assert.doesNotMatch(reportsPanelHtml(), /<canvas\b|<svg\b|<table\b/i);
  assert.doesNotMatch(reportsPanelHtml(), forbiddenReportsCopy);
  assert.doesNotMatch(reportsControllerSlice(), forbiddenReportSource);
  assert.doesNotMatch(css, /\.report-[^{]*(?:red|green|delta|trend|goal|comparison)/i);
  assert.doesNotMatch(historyReportsSource, /\b(?:fetch|XMLHttpRequest|sendBeacon|https?:\/\/|analytics|backend|api\/)\b/i);
});

test("Phase 05 UAT names History and Reports manual backstops", () => {
  const normalized = normalizeDoc(phaseFiveUat);

  for (const snippet of [
    "history empty state",
    "saved partial days",
    "editable day save",
    "prior-day weight large-change confirmation",
    "read-only day presentation",
    "breakthrough source-day navigation",
    "history long text wrapping",
    "many-day vertical scrolling",
    "reports no-data state",
    "reports one-usable-meal insufficient state",
    "reports numeric-ready state with denominators",
    "no chart, trend, goal, or advice presentation",
    "cache-ready settings status after refresh",
  ]) {
    assert.ok(normalized.includes(snippet), `missing Phase 05 UAT backstop: ${snippet}`);
  }
});

test("Phase 05 UAT keeps unavailable target-device evidence human-needed", () => {
  const normalized = normalizeDoc(phaseFiveUat);
  const evidenceRows = phaseFiveUat
    .toLowerCase()
    .split("\n")
    .filter((line) => /^\| (physical iphone 13|home screen|hosted https|installed offline relaunch)/.test(line));

  for (const snippet of [
    "physical iphone 13 safari visual fit | human-needed",
    "home screen install and standalone relaunch | human-needed",
    "hosted https static-host url | human-needed",
    "installed offline relaunch | human-needed",
    "no physical iphone 13 evidence was captured",
    "no home screen install evidence was captured",
    "no hosted https static-host url evidence was captured",
    "no installed offline relaunch evidence was captured",
  ]) {
    assert.ok(normalized.includes(snippet), `missing human-needed evidence wording: ${snippet}`);
  }

  assert.equal(evidenceRows.length, 4);
  for (const row of evidenceRows) {
    assert.match(row, /\| human-needed \|/);
    assert.doesNotMatch(row, /\| (?:passed|verified|complete) \|/);
  }
});

function historyPanelHtml() {
  const start = html.indexOf('data-view="history"');
  const end = html.indexOf('data-view="settings"', start);
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

function reportsPanelHtml() {
  const start = html.indexOf('data-view="reports"');
  const end = html.indexOf('data-view="journal"', start);
  return start >= 0 && end > start ? html.slice(start, end) : "";
}

function historyControllerSlice() {
  const start = appSource.indexOf("async function loadHistoryView");
  const end = appSource.indexOf("async function saveTodayWeight");
  return start >= 0 && end > start ? appSource.slice(start, end) : "";
}

function reportsControllerSlice() {
  const start = appSource.indexOf("async function loadReportsView");
  const end = appSource.indexOf("async function loadJournalView");
  return start >= 0 && end > start ? appSource.slice(start, end) : "";
}

function historyDayTemplateHtml() {
  return html.match(/<template data-history-day-template>[\s\S]*?<\/template>/)?.[0] || "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDoc(value) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

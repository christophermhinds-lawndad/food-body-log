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
  assert.match(html, /src="\.\/scripts\/app\.js\?v=11"/);
  assert.match(html, /type="module"/);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"/);
});

test("settings markup includes install status interaction and local-only copy", () => {
  assert.match(html, />Check install status</);
  assert.match(html, /Your data stays on this device/);
  assert.match(html, /not synced to an account/);
  assert.match(html, /Updates may require revisiting the app URL/);
  assert.match(html, /Deleting the Home Screen app, clearing website data, or changing browser storage can remove local app data/);
  assert.match(html, />Data backup</);
  assert.match(html, />Export backup</);
  assert.match(html, />Import backup</);
  assert.match(html, />Choose backup file</);
  assert.match(html, /accept="\.json,application\/json"/);
  assert.match(html, /aria-live="polite"/);
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

test("journal shell exposes reflection and breakthrough containers", () => {
  assert.match(html, /data-view="journal"/);
  assert.match(html, /id="journal-form"/);
  assert.match(html, /id="journal-prompt-list"/);
  assert.match(html, /id="journal-message" class="status-message" aria-live="polite"/);
  assert.match(html, /id="breakthrough-list"/);
  assert.match(html, /id="breakthrough-message" class="status-message" aria-live="polite"/);
  assert.match(html, /data-journal-prompt-template/);
  assert.match(html, /data-breakthrough-template/);
});

test("history shell exposes browse detail and edit containers", () => {
  assert.match(html, /data-view="history"/);
  assert.match(html, /id="history-status" class="status-message" aria-live="polite"/);
  assert.match(html, /id="history-list" class="history-list" aria-live="polite"/);
  assert.match(html, /id="history-pagination" class="history-pagination" aria-live="polite"/);
  assert.match(html, /id="history-detail" class="day-detail" hidden/);
  assert.match(html, /id="history-detail-title" tabindex="-1"/);
  assert.match(html, /id="history-save-message" class="status-message" aria-live="polite"/);
  assert.match(html, /data-history-day-template/);
  assert.match(html, /data-history-meal-template/);
  assert.match(html, /data-history-answer-template/);
});

test("reports shell exposes fixed numeric summary containers", () => {
  assert.match(html, /data-view="reports"/);
  assert.match(html, /class="view-panel reports-view"/);
  assert.match(html, /id="reports-status" class="status-message" aria-live="polite"/);
  assert.match(html, /id="weight-reports" class="reports-grid"/);
  assert.match(html, /id="meal-reports" class="reports-grid"/);
  assert.match(html, /data-report-tile-template/);
  assert.match(html, /Weight averages/);
  assert.match(html, /Meal metrics/);
  assert.match(html, /Numeric summaries use only saved local entries/);
  assert.equal((html.match(/data-report-tile(?:\s|=)/g) || []).length, 5);
});

test("journal styling uses compact mobile-safe cards chips and actions", () => {
  for (const selector of [
    ".journal-section",
    ".journal-prompt-card",
    ".journal-chip-list",
    ".journal-chip",
    ".journal-chip[aria-pressed=\"true\"]",
    ".breakthrough-card",
    ".breakthrough-answer",
    ".destructive-action",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)), `missing ${selector} styles`);
  }

  assert.match(css, /\.journal-prompt-card[\s\S]*border-radius: 8px;[\s\S]*background: var\(--surface\);/);
  assert.match(css, /\.journal-textarea[\s\S]*min-height: 96px;[\s\S]*resize: vertical;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /\.journal-chip[\s\S]*min-height: 44px;[\s\S]*border-radius: 8px;/);
  assert.match(css, /\.journal-chip\[aria-pressed="true"\][\s\S]*border-color: var\(--accent\);[\s\S]*box-shadow: inset 4px 0 0 var\(--accent\);/);
  assert.match(css, /\.breakthrough-answer[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /\.destructive-action[\s\S]*border-color: var\(--destructive\);[\s\S]*color: var\(--destructive\);/);
  assert.match(css, /--destructive: #8F3F36;/);
});

test("journal controls share the existing focus-visible treatment", () => {
  const focusBlock = css.match(/\.primary-action:focus-visible[\s\S]*?\{[\s\S]*?outline: 3px solid var\(--accent\);[\s\S]*?\}/)?.[0] || "";

  for (const selector of [
    ".journal-chip:focus-visible",
    "[data-toggle-breakthrough]:focus-visible",
    "[data-source-day]:focus-visible",
    "[data-drop-breakthrough]:focus-visible",
    "[data-history-day]:focus-visible",
    "[data-history-save]:focus-visible",
    "[data-history-answer-chip]:focus-visible",
  ]) {
    assert.match(focusBlock, new RegExp(escapeRegExp(selector)), `missing focus selector ${selector}`);
  }
});

test("reports styling uses compact numeric cards without display-scale values", () => {
  for (const selector of [
    ".reports-view",
    ".reports-section",
    ".reports-grid",
    ".report-card",
    ".report-value",
    ".report-denominator",
    ".report-state",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)), `missing ${selector} styles`);
  }

  assert.match(css, /\.report-card[\s\S]*border-radius: 8px;[\s\S]*background: var\(--surface\);/);
  assert.match(css, /\.report-value[\s\S]*font-size: 16px;[\s\S]*font-weight: 600;/);
  assert.match(css, /reports overflow backstop/);
  assert.doesNotMatch(css, /\.report-[^{]*(?:red|green|delta|trend|goal|comparison)/i);
});

test("plan suggestion styling is compact, touch-friendly, and wrapping-safe", () => {
  assert.match(css, /\.plan-suggestions\s*\{[\s\S]*display: grid;[\s\S]*gap: 8px;[\s\S]*\}/);
  assert.match(css, /\.plan-suggestion-option\s*\{[\s\S]*min-height: 44px;[\s\S]*padding: 8px;[\s\S]*border-radius: 8px;[\s\S]*font-size: 16px;[\s\S]*overflow-wrap: anywhere;[\s\S]*\}/);
  assert.match(css, /\.plan-suggestion-option:focus-visible/);
  assert.match(css, /\.plan-suggestion-option:hover\s*\{[\s\S]*box-shadow: inset 4px 0 0 var\(--accent\);[\s\S]*\}/);
});

test("settings backup styling is mobile safe and wrapping aware", () => {
  for (const selector of [
    ".backup-section",
    ".backup-warning",
    ".backup-controls",
    ".backup-file-control",
    ".backup-status",
    ".backup-selected-file",
  ]) {
    assert.match(css, new RegExp(escapeRegExp(selector)), `missing ${selector} styles`);
  }

  assert.match(css, /\.backup-section[\s\S]*display: grid;[\s\S]*gap: 24px;[\s\S]*min-width: 0;/);
  assert.match(css, /\.backup-warning[\s\S]*border-radius: 8px;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /\.backup-controls[\s\S]*grid-template-columns: minmax\(0, 1fr\);[\s\S]*gap: 16px;/);
  assert.match(css, /\.backup-file-control[\s\S]*min-width: 0;[\s\S]*border-radius: 8px;/);
  assert.match(css, /\.backup-status[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /settings backup overflow backstop/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.backup-section,[\s\S]*\.backup-warning,[\s\S]*\.backup-controls,[\s\S]*\.backup-file-control,[\s\S]*\.backup-status,[\s\S]*\.backup-selected-file[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("primary flows keep iPhone 13 wrapping and bottom-tab clearance backstops", () => {
  const mobileBlock = css.match(/@media \(max-width: 430px\)[\s\S]*$/)?.[0] || "";

  for (const selector of [
    ".app-shell",
    ".meal-card-header",
    ".button-row",
    ".segmented-control",
    ".journal-prompt-card",
    ".breakthrough-card",
    ".history-list",
    ".day-detail",
    ".reports-grid",
    ".report-card",
    ".backup-section",
    ".backup-file-control",
    ".tab-bar",
    ".tab-button",
  ]) {
    assert.match(mobileBlock, new RegExp(escapeRegExp(selector)), `missing mobile backstop for ${selector}`);
  }

  assert.match(css, /padding: calc\(24px \+ env\(safe-area-inset-top\)\) 16px calc\(96px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(mobileBlock, /overflow-wrap: anywhere;/);
  assert.match(mobileBlock, /min-width: 0;/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

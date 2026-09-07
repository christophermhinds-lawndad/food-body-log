import { createAppPaths } from "./paths.js";
import { readSetupStatus, writeSetupStatus } from "./storage.js";
import { renderStatusRows, setStatusText, setText } from "./dom.js";
import { CHECKING_STATUS_ROWS, CURRENT_CACHE_NAME, collectInstallStatus } from "./install-status.js?v=15";
import { getTodayDayID, getTomorrowDayID } from "./day-policy.js";
import { MEAL_ANSWERS, MEAL_LEVELS, MEAL_STATES, isMealLevelAnswered, mealLevelLabel, normalizeMealLevel } from "./tracking-model.js?v=5";
import { getPlanState, getPlanSuggestions, getTodayTrackingState, saveMealLog, savePlan, saveWeight, skipMeal, unskipMeal } from "./today-tracking.js?v=6";
import { createPlanSuggestionController } from "./plan-suggestions-ui.js?v=4";
import { JOURNAL_CHIPS, BREAKTHROUGH_STATES, OUTSIDE_PLAN_PROMPT_ID, promptsForMeals } from "./journal-model.js?v=4";
import { getJournalState, saveReflection, setAnswerBreakthrough, dropBreakthrough, getBreakthroughs } from "./journal-tracking.js?v=4";
import { HISTORY_COPY, REPORTS_COPY, getHistoryDay, getHistoryState, getReportsState, saveHistoryDay } from "./history-reports.js?v=6";
import { createDownloadSpec, exportLocalData, importLocalDataFromBackup, inspectBackupImport, parseBackupText } from "./data-portability.js?v=5";

const appPaths = createAppPaths();

const titles = {
  today: "Today",
  plan: "Plan meals",
  reports: "Reports",
  journal: "Journal",
  history: "History",
  settings: "Settings",
};

const statusValueNodes = Object.fromEntries(
  Array.from(document.querySelectorAll("[data-status-value]")).map((node) => [node.dataset.statusValue, node]),
);
const settingsMessage = document.querySelector("#settings-message");
const weightForm = document.querySelector("#weight-form");
const weightInput = document.querySelector("#weight-value");
const waistInput = document.querySelector("#waist-value");
const weightMessage = document.querySelector("#weight-message");
const todayDate = document.querySelector("#today-date");
const todaySupportText = document.querySelector("#today-support-text");
const todaySupportSource = document.querySelector("#today-support-source");
const planForm = document.querySelector("#plan-form");
const planMessage = document.querySelector("#plan-message");
const journalForm = document.querySelector("#journal-form");
const journalPromptList = document.querySelector("#journal-prompt-list");
const journalDay = document.querySelector("#journal-day");
const journalHelper = document.querySelector("#journal-helper");
const journalMessage = document.querySelector("#journal-message");
const outsidePlanControls = Array.from(document.querySelectorAll("[name='outside-plan']"));
const breakthroughList = document.querySelector("#breakthrough-list");
const breakthroughMessage = document.querySelector("#breakthrough-message");
const journalPromptTemplate = document.querySelector("[data-journal-prompt-template]");
const breakthroughTemplate = document.querySelector("[data-breakthrough-template]");
const reportsStatus = document.querySelector("#reports-status");
const weightSummaryNotice = document.querySelector("#weight-summary-notice");
const weightSummaryLines = document.querySelector("#weight-summary-lines");
const weightReports = document.querySelector("#weight-reports");
const waistReportStatus = document.querySelector("#waist-report-status");
const waistChart = document.querySelector("#waist-chart");
const waistReportSummary = document.querySelector("#waist-report-summary");
const mealReports = document.querySelector("#meal-reports");
const reportTileTemplate = document.querySelector("[data-report-tile-template]");
const historyStatus = document.querySelector("#history-status");
const historyList = document.querySelector("#history-list");
const historyPagination = document.querySelector("#history-pagination");
const historyDetail = document.querySelector("#history-detail");
const historyDetailTitle = document.querySelector("#history-detail-title");
const historySaveMessage = document.querySelector("#history-save-message");
const historyDetailDate = document.querySelector("[data-history-detail-date]");
const historyEditBadge = document.querySelector("[data-history-edit-badge]");
const historyEditCopy = document.querySelector("[data-history-edit-copy]");
const historyWeightSection = document.querySelector("[data-history-weight-section]");
const historyMealList = document.querySelector("[data-history-meal-list]");
const historyAnswerList = document.querySelector("[data-history-answer-list]");
const historyBreakthroughSection = document.querySelector("[data-history-breakthrough-section]");
const historySaveButton = document.querySelector("[data-history-save]");
const historyDayTemplate = document.querySelector("[data-history-day-template]");
const historyMealTemplate = document.querySelector("[data-history-meal-template]");
const historyAnswerTemplate = document.querySelector("[data-history-answer-template]");
const exportBackupButton = document.querySelector("#export-backup");
const exportBackupStatus = document.querySelector("#export-backup-status");
const backupFileInput = document.querySelector("#backup-file-input");
const backupSelectedFile = document.querySelector("#backup-selected-file");
const replaceBackupButton = document.querySelector("#replace-local-data");
const importBackupStatus = document.querySelector("#import-backup-status");
const backupOverlapWarning = document.querySelector("#backup-overlap-warning");
const backupOverlapCount = document.querySelector("#backup-overlap-count");
const confirmOverlapImport = document.querySelector("#confirm-overlap-import");
const SUGGESTION_ERROR_MESSAGE = "Suggestions could not be loaded. You can keep typing.";
const JOURNAL_LOAD_MESSAGE = "Loading evening reflection...";
const JOURNAL_UNAVAILABLE_MESSAGE = "Evening reflection could not be loaded. Reopen the app and try again.";
const JOURNAL_SAVE_ERROR_MESSAGE = "Reflection could not be saved. Try again; data already saved on this device stays local.";
const NO_EXTRA_PROMPTS_MESSAGE = "Nothing extra to reflect on from today's meal levels. You can still write anything that feels useful.";
const MISSING_MEAL_DATA_MESSAGE = "Not all meals are logged yet. That is okay; only logged low-hunger or high-satiety meals add extra prompts.";
const DROP_SUCCESS_MESSAGE = "Breakthrough removed. The original answer stayed saved.";
const MAX_BACKUP_FILE_BYTES = 2_000_000;
const HISTORY_PAGE_SIZE = 5;
const HISTORY_MAX_VISIBLE_DAYS = 15;
const BACKUP_UI_COPY = Object.freeze({
  exportPreparing: "Preparing backup...",
  exportSuccess: "Backup exported. Keep the file somewhere you can find it later.",
  exportError: "Backup could not be exported. Reopen the app and try again. Data already saved on this device stays local.",
  noFile: "No backup selected",
  fileSelectedPrefix: "Backup selected:",
  checking: "Checking backup...",
  ready: "Backup looks ready to import. Non-overlapping dates will be added to local data.",
  readyWithOverlap: "Backup has dates that overlap local data. Check the overwrite box before importing.",
  chooseFirst: "Choose a backup first",
  replaceAction: "Import backup",
  imported: "Backup imported. Reopen each tab to see updated local data.",
  invalid: "Backup could not be read. Choose a Food Body Log JSON backup exported from this app.",
  unsupported: "This backup format is not supported by this version of Food Body Log.",
  missingStore: "This backup is missing required local data sections, so nothing was imported.",
  oversized: "This file is larger than this version can import. Choose a smaller Food Body Log backup.",
  overlapBlocked: "Overlapping dates require confirmation before anything is imported.",
  noWrite: "Nothing was imported, and the local data already on this device was not changed.",
});
let todayDayID = getTodayDayID();
let planDayID = getTomorrowDayID();
let journalDayID = todayDayID;
let historySelectedDayID = "";
let journalLoadRequestID = 0;
let reportsLoadRequestID = 0;
let historyLoadRequestID = 0;
let historyDayLoadRequestID = 0;
let historyPageIndex = 0;
let backupSelectionRequestID = 0;
let readyBackupPayload = null;
let readyBackupOverlapDayCount = 0;
let currentJournalState = null;
let currentHistoryState = null;
let currentHistoryDayState = null;
let pendingWeightConfirmation = null;
let pendingHistoryWeightConfirmation = null;
let pendingHistorySourceDayID = "";
const planSuggestions = createPlanSuggestionController({
  document,
  getPlanSuggestions,
  getPlanDayID: () => planDayID,
  planMessage,
  setText,
  suggestionErrorMessage: SUGGESTION_ERROR_MESSAGE,
});

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
});

document.querySelector("#check-install-status")?.addEventListener("click", () => {
  checkInstallStatus();
});

exportBackupButton?.addEventListener("click", () => {
  exportBackup();
});

backupFileInput?.addEventListener("change", () => {
  validateSelectedBackup();
});

replaceBackupButton?.addEventListener("click", () => {
  replaceFromSelectedBackup();
});

confirmOverlapImport?.addEventListener("change", () => {
  updateReplaceBackupAction();
});

weightForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTodayWeight();
});

document.addEventListener("input", (event) => {
  const input = event.target?.closest?.("[data-meal-level]");

  if (input) {
    markMealLevelAnswered(input);
  }
});

planForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSelectedPlan();
});

journalForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveJournalReflection();
});

outsidePlanControls.forEach((control) => {
  control.addEventListener("change", () => {
    updateJournalPromptsForOutsidePlanChoice();
  });
});

document.querySelectorAll("[name='plan-day']").forEach((control) => {
  control.addEventListener("change", () => {
    planDayID = selectedPlanDayID();
    planSuggestions.hideAll();
    loadPlanView();
  });
});

document.querySelectorAll("[data-plan-slot]").forEach((input) => {
  planSuggestions.attachInput(input);
});

planForm?.addEventListener("focusout", (event) => {
  const input = event.target?.matches?.("[data-plan-slot]") ? event.target : null;
  const nextTarget = event.relatedTarget;
  const list = planSuggestions.listFor(input);

  if (!input || nextTarget === input || list?.contains(nextTarget)) {
    return;
  }

  queueMicrotask(() => {
    if (document.activeElement !== input && !list?.contains(document.activeElement)) {
      planSuggestions.hide(input);
    }
  });
});

document.addEventListener("pointerdown", (event) => {
  const target = event.target;
  const mealLevelInput = target?.closest?.("[data-meal-level]");

  if (mealLevelInput) {
    markMealLevelAnswered(mealLevelInput);
  }

  if (!target?.closest?.("[data-plan-slot]") && !target?.closest?.("[data-plan-suggestions]")) {
    planSuggestions.hideAll();
  }
});

document.querySelectorAll("[data-meal-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveMealFromForm(form);
  });
});

document.querySelectorAll("[data-skip-meal]").forEach((button) => {
  button.addEventListener("click", () => {
    skipSelectedMeal(button);
  });
});

document.querySelectorAll("[data-unskip-meal]").forEach((button) => {
  button.addEventListener("click", () => {
    unskipSelectedMeal(button);
  });
});

journalPromptList?.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-journal-chip], [data-toggle-breakthrough]");

  if (!button) {
    return;
  }

  if (button.matches("[data-journal-chip]")) {
    toggleJournalChip(button);
  }

  if (button.matches("[data-toggle-breakthrough]")) {
    toggleAnswerBreakthrough(button);
  }
});

breakthroughList?.addEventListener("click", (event) => {
  const sourceButton = event.target?.closest?.("[data-source-day]");
  const dropButton = event.target?.closest?.("[data-drop-breakthrough]");

  if (sourceButton) {
    const card = sourceButton.closest("[data-breakthrough-card]");
    openHistorySourceDay(card?.dataset.dayId || journalDayID);
  }

  if (dropButton) {
    dropSelectedBreakthrough(dropButton);
  }
});

historyList?.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-history-day]");

  if (button?.dataset.dayId) {
    toggleSelectedHistoryDay(button.dataset.dayId);
  }
});

historyPagination?.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-history-page]");

  if (button) {
    changeHistoryPage(button.dataset.historyPage);
  }
});

historyDetail?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveSelectedHistoryDay();
});

historyDetail?.addEventListener("click", (event) => {
  const chipButton = event.target?.closest?.("[data-history-answer-chip]");

  if (chipButton) {
    toggleHistoryAnswerChip(chipButton);
  }
});

registerServiceWorker();
readStoredStatus();
resetBackupImportState();
loadTodayView();
loadPlanView();

function selectTab(tabName) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.tab === tabName));
  });

  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.hidden = panel.dataset.view !== tabName;
  });

  const title = titles[tabName] || "Today";
  setText(document.querySelector("#view-title"), title);
  document.querySelector("#app-content").focus({ preventScroll: true });

  if (tabName === "today") {
    loadTodayView();
  }

  if (tabName === "plan") {
    loadPlanView();
  }

  if (tabName === "reports") {
    loadReportsView();
  }

  if (tabName === "journal") {
    loadJournalView();
  }

  if (tabName === "history") {
    loadHistoryView();
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    setStatusText(statusValueNodes.offlineCache, "Unavailable");
    return;
  }

  try {
    await navigator.serviceWorker.register(appPaths.serviceWorkerScriptUrl(), {
      scope: appPaths.serviceWorkerScope(),
      type: "module",
    });
  } catch {
    setStatusText(statusValueNodes.offlineCache, "Not ready");
  }
}

async function readStoredStatus() {
  const stored = await readSetupStatus();

  if (stored.available && stored.value) {
    const offlineCache = stored.value.cacheName === CURRENT_CACHE_NAME
      ? stored.value.offlineCache || "Not ready"
      : "Not ready";

    renderStatusRows(
      [
        { id: "installMode", value: stored.value.installMode || "Not ready" },
        { id: "offlineCache", value: offlineCache },
        { id: "storage", value: stored.value.storage || "Ready" },
      ],
      statusValueNodes,
    );
  }
}

async function checkInstallStatus() {
  renderStatusRows(CHECKING_STATUS_ROWS, statusValueNodes);
  setText(settingsMessage, "Checking offline app shell...");

  const status = await collectInstallStatus({
    storage: { readSetupStatus, writeSetupStatus },
  });

  renderStatusRows(status.rows, statusValueNodes);
  setText(settingsMessage, status.message);
}

async function exportBackup() {
  setText(exportBackupStatus, BACKUP_UI_COPY.exportPreparing);
  if (exportBackupButton) {
    exportBackupButton.disabled = true;
  }

  try {
    const exported = await exportLocalData();
    const downloadSpec = exported.status === "Ready" ? createDownloadSpec(exported.payload, exported.fileName) : exported;

    if (downloadSpec.status !== "Ready") {
      setText(exportBackupStatus, BACKUP_UI_COPY.exportError);
      return;
    }

    triggerBackupDownload(downloadSpec);
    setText(exportBackupStatus, BACKUP_UI_COPY.exportSuccess);
  } catch {
    setText(exportBackupStatus, BACKUP_UI_COPY.exportError);
  } finally {
    if (exportBackupButton) {
      exportBackupButton.disabled = false;
    }
  }
}

async function validateSelectedBackup() {
  backupSelectionRequestID += 1;
  const requestID = backupSelectionRequestID;
  const file = backupFileInput?.files?.[0] || null;
  readyBackupPayload = null;
  readyBackupOverlapDayCount = 0;
  updateBackupOverlapWarning();
  updateReplaceBackupAction();

  if (!file) {
    setText(backupSelectedFile, BACKUP_UI_COPY.noFile);
    setText(importBackupStatus, "");
    return;
  }

  setText(backupSelectedFile, `${BACKUP_UI_COPY.fileSelectedPrefix} ${file.name || "backup.json"}`);

  if (Number.isFinite(file.size) && file.size > MAX_BACKUP_FILE_BYTES) {
    setText(importBackupStatus, backupImportStatusText({ error: { code: "file-too-large" } }));
    return;
  }

  setText(importBackupStatus, BACKUP_UI_COPY.checking);

  try {
    const text = await file.text();

    if (requestID !== backupSelectionRequestID) {
      return;
    }

    const parsed = parseBackupText(text);

    if (requestID !== backupSelectionRequestID) {
      return;
    }

    if (parsed.status !== "Ready") {
      setText(importBackupStatus, backupImportStatusText(parsed));
      updateReplaceBackupAction();
      return;
    }

    const inspection = await inspectBackupImport(parsed.payload);

    if (requestID !== backupSelectionRequestID) {
      return;
    }

    if (inspection.status !== "Ready") {
      setText(importBackupStatus, backupImportStatusText(inspection));
      updateReplaceBackupAction();
      return;
    }

    readyBackupPayload = inspection.payload;
    readyBackupOverlapDayCount = inspection.overlapDayCount || 0;
    updateBackupOverlapWarning();
    setText(importBackupStatus, readyBackupOverlapDayCount > 0 ? BACKUP_UI_COPY.readyWithOverlap : BACKUP_UI_COPY.ready);
    updateReplaceBackupAction();
  } catch {
    if (requestID !== backupSelectionRequestID) {
      return;
    }

    setText(importBackupStatus, `${BACKUP_UI_COPY.invalid} ${BACKUP_UI_COPY.noWrite}`);
    updateReplaceBackupAction();
  }
}

async function replaceFromSelectedBackup() {
  if (!readyBackupPayload) {
    setText(importBackupStatus, BACKUP_UI_COPY.chooseFirst);
    updateReplaceBackupAction();
    return;
  }

  const allowOverwrite = Boolean(confirmOverlapImport?.checked);

  if (readyBackupOverlapDayCount > 0 && !allowOverwrite) {
    setText(importBackupStatus, `${BACKUP_UI_COPY.overlapBlocked} ${BACKUP_UI_COPY.noWrite}`);
    updateReplaceBackupAction();
    return;
  }

  setText(importBackupStatus, "Importing backup...");
  replaceBackupButton.disabled = true;

  const result = await importLocalDataFromBackup(readyBackupPayload, { allowOverwrite });

  if (result.status !== "Ready") {
    setText(importBackupStatus, backupImportStatusText(result));
    updateReplaceBackupAction();
    return;
  }

  readyBackupPayload = null;
  readyBackupOverlapDayCount = 0;
  if (backupFileInput) {
    backupFileInput.value = "";
  }
  if (confirmOverlapImport) {
    confirmOverlapImport.checked = false;
  }
  updateBackupOverlapWarning();
  setText(backupSelectedFile, BACKUP_UI_COPY.noFile);
  setText(importBackupStatus, BACKUP_UI_COPY.imported);
  updateReplaceBackupAction();
}

function triggerBackupDownload(downloadSpec) {
  const blob = new Blob([downloadSpec.text], { type: downloadSpec.mimeType || "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadSpec.fileName || "food-body-log-backup.json";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function resetBackupImportState() {
  readyBackupPayload = null;
  readyBackupOverlapDayCount = 0;
  if (confirmOverlapImport) {
    confirmOverlapImport.checked = false;
  }
  updateBackupOverlapWarning();
  setText(backupSelectedFile, BACKUP_UI_COPY.noFile);
  updateReplaceBackupAction();
}

function updateReplaceBackupAction() {
  if (!replaceBackupButton) {
    return;
  }

  const needsOverlapConfirmation = readyBackupOverlapDayCount > 0 && !confirmOverlapImport?.checked;
  replaceBackupButton.disabled = !readyBackupPayload || needsOverlapConfirmation;
  setText(replaceBackupButton, readyBackupPayload ? BACKUP_UI_COPY.replaceAction : BACKUP_UI_COPY.chooseFirst);
}

function updateBackupOverlapWarning() {
  const hasOverlap = readyBackupOverlapDayCount > 0;

  if (backupOverlapWarning) {
    backupOverlapWarning.hidden = !hasOverlap;
  }

  if (backupOverlapCount) {
    setText(backupOverlapCount, hasOverlap
      ? `${readyBackupOverlapDayCount} overlapping day${readyBackupOverlapDayCount === 1 ? "" : "s"} found.`
      : "");
  }

  if (!hasOverlap && confirmOverlapImport) {
    confirmOverlapImport.checked = false;
  }
}

function backupImportStatusText(result) {
  const code = result?.error?.code || "";
  const copy = {
    "unsupported-backup": BACKUP_UI_COPY.unsupported,
    "missing-store": BACKUP_UI_COPY.missingStore,
    "file-too-large": BACKUP_UI_COPY.oversized,
    "overlapping-days": BACKUP_UI_COPY.overlapBlocked,
  }[code] || BACKUP_UI_COPY.invalid;

  return `${copy} ${BACKUP_UI_COPY.noWrite}`;
}

async function loadTodayView() {
  refreshCurrentDayIDs();
  const requestedDayID = todayDayID;
  setText(weightMessage, "Loading today's entries...");
  const state = await getTodayTrackingState();

  if (state.available && (requestedDayID !== todayDayID || state.day.dayID !== getTodayDayID())) {
    return;
  }

  renderTodayState(state);
}

async function loadPlanView() {
  refreshCurrentDayIDs();
  const requestedDayID = planDayID;
  planSuggestions.hideAll();
  setPlanFormDisabled(true);
  setText(planMessage, "Loading plan...");
  const state = await getPlanState(requestedDayID);

  if (requestedDayID !== planDayID) {
    return;
  }

  if (!state.available) {
    setPlanFormDisabled(false);
    setText(planMessage, "Plan could not be loaded. Try again.");
    return;
  }

  for (const meal of state.meals) {
    const input = document.querySelector(`[data-plan-slot="${meal.slot}"]`);
    if (input) {
      input.value = meal.plannedText || "";
    }
  }

  setPlanFormDisabled(false);
  setText(planMessage, "");
}

async function saveSelectedPlan() {
  refreshCurrentDayIDs();
  const selectedDayID = planDayID;
  planSuggestions.hideAll();
  setPlanFormDisabled(true);
  const plannedTextBySlot = Object.fromEntries(
    Array.from(document.querySelectorAll("[data-plan-slot]")).map((input) => [input.dataset.planSlot, input.value]),
  );
  const result = await savePlan(selectedDayID, plannedTextBySlot);

  if (selectedDayID !== planDayID) {
    return;
  }

  setPlanFormDisabled(false);

  if (!isReadyResult(result)) {
    setText(planMessage, "Plan could not be saved. Try again.");
    return;
  }

  setText(planMessage, "Plan saved.");

  if (selectedDayID === todayDayID && result.day.dayID === todayDayID) {
    renderTodayState(result);
  }
}

async function loadReportsView() {
  const requestID = reportsLoadRequestID + 1;
  reportsLoadRequestID = requestID;
  setText(reportsStatus, REPORTS_COPY.loading);
  const state = await getReportsState();

  if (requestID !== reportsLoadRequestID) {
    return;
  }

  renderReportsState(state);
}

function renderReportsState(state) {
  if (!state.available) {
    setText(reportsStatus, REPORTS_COPY.error);
    renderWeightSummary(null);
    renderWeightReportTiles([]);
    renderWaistTrend(null);
    renderMealReportTiles([]);
    return;
  }

  setText(reportsStatus, "");
  renderWeightSummary(state.weightSummary);
  renderWeightReportTiles(state.weightAverages || []);
  renderWaistTrend(state.waistTrend);
  renderMealReportTiles(state.mealMetrics || []);
}

function renderWeightSummary(summary) {
  const notice = summary?.notice || {
    kind: "NoData",
    text: REPORTS_COPY.weightSummaryNoData,
  };
  const lines = Array.isArray(summary?.lines) && summary.lines.length > 0
    ? summary.lines
    : [REPORTS_COPY.weightSummaryNoData];

  if (weightSummaryNotice) {
    weightSummaryNotice.className = `weight-summary-notice ${weightNoticeClass(notice.kind)}`;
    setText(weightSummaryNotice, notice.text);
  }

  replaceChildren(weightSummaryLines);

  for (const line of lines) {
    const item = document.createElement("p");
    item.className = "weight-summary-line";
    setText(item, line);
    weightSummaryLines?.append(item);
  }
}

function renderWeightReportTiles(weightAverages) {
  for (const summaryID of ["current7", "previous7", "trailing30", "trailing90"]) {
    const tile = weightAverages.find((candidate) => candidate.id === summaryID) || {
      id: summaryID,
      periodLabel: fallbackWeightPeriodLabel(summaryID),
      state: "NoData",
      count: 0,
      average: null,
      formattedAverage: "",
      display: summaryID === "current7" || summaryID === "previous7",
    };
    renderWeightReportTile(tile);
  }
}

function renderMealReportTiles(mealMetrics) {
  for (const metricName of ["ateWhenHungry", "stoppedAtEnough"]) {
    const tile = mealMetrics.find((candidate) => candidate.metricName === metricName) || {
      kind: "mealLevel",
      metricName,
      label: metricName === "stoppedAtEnough" ? REPORTS_COPY.enoughLabel : REPORTS_COPY.hungryLabel,
      periodLabel: REPORTS_COPY.mealSevenDays,
      state: "NoData",
      denominator: 0,
      average: null,
      formattedAverage: "",
    };
    renderMealReportTile(tile);
  }
}

function renderWeightReportTile(tile) {
  const card = weightReports?.querySelector(`[data-report-kind="weight"][data-weight-summary-id="${tile.id}"]`);
  const shouldDisplay = tile.display !== false;

  if (card) {
    card.hidden = !shouldDisplay;
  }

  if (!shouldDisplay) {
    return;
  }

  renderReportTile(card, {
    title: tile.periodLabel,
    label: "Weight average",
    value: reportValueText(tile),
    denominator: reportDenominatorText(tile),
    state: "",
  });
}

function renderMealReportTile(tile) {
  const card = mealReports?.querySelector(`[data-report-kind="meal"][data-metric-name="${tile.metricName}"]`);
  renderReportTile(card, {
    title: tile.label,
    label: tile.periodLabel,
    value: reportValueText(tile),
    denominator: reportDenominatorText(tile),
    state: "",
  });
}

function renderWaistTrend(trend) {
  replaceChildren(waistChart);

  if (!trend || trend.status !== "Ready" || !trend.entries?.length) {
    setText(waistReportStatus, REPORTS_COPY.waistNoData);
    setText(waistReportSummary, "");
    return;
  }

  setText(waistReportStatus, REPORTS_COPY.waistLabel);
  setText(waistReportSummary, trend.summaryText);
  waistChart?.append(createWaistChart(trend));
}

function createWaistChart(trend) {
  const namespace = ["http:", "", "www.w3.org", "2000", "svg"].join("/");
  const svg = document.createElementNS(namespace, "svg");
  const width = 320;
  const height = 180;
  const margins = { top: 18, right: 12, bottom: 42, left: 42 };
  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;
  const axisMin = Number(trend.axisMin);
  const axisMax = Number(trend.axisMax);
  const axisRange = axisMax > axisMin ? axisMax - axisMin : 1;
  const entries = trend.entries || [];
  const points = entries.map((entry, index) => {
    const x = entries.length === 1
      ? margins.left + plotWidth / 2
      : margins.left + (plotWidth * index) / (entries.length - 1);
    const y = margins.top + ((axisMax - entry.value) / axisRange) * plotHeight;

    return { x, y, entry };
  });

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Waist measurements in inches by date");

  appendSvgLine(svg, namespace, margins.left, margins.top, margins.left, margins.top + plotHeight, "waist-chart-axis");
  appendSvgLine(svg, namespace, margins.left, margins.top + plotHeight, margins.left + plotWidth, margins.top + plotHeight, "waist-chart-axis");
  appendSvgText(svg, namespace, margins.left - 8, margins.top + 4, `${formatReportNumber(axisMax)} in`, "waist-chart-axis-label", "end");
  appendSvgText(svg, namespace, margins.left - 8, margins.top + plotHeight, `${formatReportNumber(axisMin)} in`, "waist-chart-axis-label", "end");

  if (points.length > 1) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("class", "waist-chart-line");
    path.setAttribute("d", points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "));
    svg.append(path);
  }

  for (const point of points) {
    const circle = document.createElementNS(namespace, "circle");
    circle.setAttribute("class", "waist-chart-point");
    circle.setAttribute("cx", String(point.x));
    circle.setAttribute("cy", String(point.y));
    circle.setAttribute("r", "4");
    svg.append(circle);
    appendSvgText(svg, namespace, point.x, point.y - 8, formatReportNumber(point.entry.value), "waist-chart-value", "middle");
    appendSvgText(svg, namespace, point.x, margins.top + plotHeight + 18, shortDateLabel(point.entry.dayID), "waist-chart-date", "middle");
  }

  return svg;
}

function appendSvgLine(svg, namespace, x1, y1, x2, y2, className) {
  const line = document.createElementNS(namespace, "line");
  line.setAttribute("class", className);
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  svg.append(line);
}

function appendSvgText(svg, namespace, x, y, copy, className, anchor) {
  const text = document.createElementNS(namespace, "text");
  text.setAttribute("class", className);
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("text-anchor", anchor);
  setText(text, copy);
  svg.append(text);
}

function renderReportTile(card, tile) {
  const reportNode = card || reportTileTemplate?.content?.firstElementChild?.cloneNode(true);

  if (!reportNode) {
    return;
  }

  setText(reportNode.querySelector("[data-report-title]"), tile.title);
  setText(reportNode.querySelector("[data-report-label]"), tile.label);
  setText(reportNode.querySelector("[data-report-value]"), tile.value);
  setText(reportNode.querySelector("[data-report-denominator]"), tile.denominator);
  setText(reportNode.querySelector("[data-report-state]"), tile.state);
}

function reportValueText(tile) {
  if (tile.kind === "mealLevel") {
    if (tile.state === "Ready") {
      return tile.qualitativeText || `${tile.formattedAverage || String(tile.average)} / 4`;
    }

    return REPORTS_COPY.mealNoData;
  }

  if (Object.hasOwn(tile, "average")) {
    if (tile.state === "Ready") {
      return tile.formattedAverage || String(tile.average);
    }

    return tile.state === "NotEnoughData" ? REPORTS_COPY.weightNotEnoughData : REPORTS_COPY.weightNoData;
  }

  if (tile.state === "Insufficient") {
    return REPORTS_COPY.mealInsufficient;
  }

  return REPORTS_COPY.mealNoData;
}

function reportDenominatorText(tile) {
  if (tile.kind === "mealLevel") {
    return tile.averageSummary || REPORTS_COPY.mealDenominator
      .replace("{average}", "no data")
      .replace("{denominator}", String(Number(tile.denominator || 0)))
      .replace("meal/meals", Number(tile.denominator || 0) === 1 ? "meal" : "meals");
  }

  if (Object.hasOwn(tile, "average")) {
    const count = Number(tile.count || 0);
    const noun = count === 1 ? "entry" : "entries";
    return REPORTS_COPY.weightDenominator.replace("{count}", String(count)).replace("entry/entries", noun);
  }

  const denominator = Number(tile.denominator || 0);

  return denominator === 1 ? "1 logged non-skipped meal in this period." : `${denominator} logged non-skipped meals in this period.`;
}

function fallbackWeightPeriodLabel(summaryID) {
  const labels = {
    current7: REPORTS_COPY.weightSevenDays,
    previous7: REPORTS_COPY.weightPreviousSevenDays,
    trailing30: REPORTS_COPY.weightThirtyDays,
    trailing90: REPORTS_COPY.weightNinetyDays,
  };

  return labels[summaryID] || REPORTS_COPY.weightSevenDays;
}

function formatReportNumber(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "";
  }

  return Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1);
}

function shortDateLabel(dayID) {
  const [, month = "", day = ""] = String(dayID || "").split("-");
  return `${month}/${day}`;
}

function weightNoticeClass(kind) {
  if (kind === "Reflect") {
    return "is-reflect";
  }

  if (kind === "Progressing") {
    return "is-progressing";
  }

  if (kind === "ConsiderEatingMore") {
    return "is-consider-more";
  }

  return "is-stable";
}

async function loadJournalView() {
  refreshCurrentDayIDs();
  journalDayID = todayDayID;
  const requestedDayID = journalDayID;
  const requestID = journalLoadRequestID + 1;
  journalLoadRequestID = requestID;
  setJournalFormDisabled(true);
  setText(journalDay, requestedDayID);
  setText(journalMessage, JOURNAL_LOAD_MESSAGE);
  const state = await getJournalState(requestedDayID);

  if (requestID !== journalLoadRequestID || requestedDayID !== journalDayID) {
    return;
  }

  if (!state.available) {
    setJournalFormDisabled(false);
    setText(journalMessage, JOURNAL_UNAVAILABLE_MESSAGE);
    return;
  }

  renderJournalState(state);
  setJournalFormDisabled(false);
  setText(journalMessage, "");
}

async function saveJournalReflection() {
  refreshCurrentDayIDs();
  const selectedDayID = journalDayID || todayDayID;
  setJournalFormDisabled(true);
  const result = await saveCurrentJournalDraft();

  if (selectedDayID !== journalDayID) {
    return;
  }

  setJournalFormDisabled(false);

  if (!isReadyResult(result)) {
    setText(journalMessage, JOURNAL_SAVE_ERROR_MESSAGE);
    return;
  }

  renderJournalState(result);
  setText(journalMessage, "Reflection saved.");
}

async function saveCurrentJournalDraft() {
  const selectedDayID = journalDayID || todayDayID;
  return saveReflection(selectedDayID, serializeJournalAnswers());
}

function serializeJournalAnswers() {
  return {
    [OUTSIDE_PLAN_PROMPT_ID]: {
      text: selectedOutsidePlanValue(),
      selectedChipIDs: [],
    },
    ...Object.fromEntries(Array.from(document.querySelectorAll("[data-journal-answer-card]"))
    .map((card) => {
      const selectedChipIDs = Array.from(card.querySelectorAll("[data-journal-chip][aria-pressed='true']"))
        .map((button) => button.dataset.journalChip);

      return [card.dataset.promptId, {
        text: card.querySelector("[data-journal-answer-text]")?.value || "",
        selectedChipIDs,
      }];
    })),
  };
}

async function toggleAnswerBreakthrough(button) {
  const card = button.closest("[data-journal-answer-card]");
  const answerID = card?.dataset.answerId;
  const isMarked = card?.dataset.breakthroughState === BREAKTHROUGH_STATES.marked;

  if (!answerID) {
    setText(journalMessage, "Save reflection before marking a breakthrough.");
    return;
  }

  if (isMarked && !window.confirm("Remove breakthrough: Remove the breakthrough highlight? The original journal answer will stay saved.")) {
    return;
  }

  setJournalFormDisabled(true);
  const saved = await saveCurrentJournalDraft();
  if (!saved) {
    setJournalFormDisabled(false);
    setText(journalMessage, JOURNAL_SAVE_ERROR_MESSAGE);
    return;
  }

  if (!isReadyResult(saved)) {
    setJournalFormDisabled(false);
    setText(journalMessage, JOURNAL_SAVE_ERROR_MESSAGE);
    return;
  }

  const result = await setAnswerBreakthrough(answerID, !isMarked);
  setJournalFormDisabled(false);

  if (!isReadyResult(result)) {
    setText(journalMessage, "Breakthrough could not be updated. Try again.");
    return;
  }

  await loadJournalView();
  setText(journalMessage, isMarked ? "Breakthrough highlight removed. The original answer stayed saved." : "Marked as breakthrough.");
}

async function dropSelectedBreakthrough(button) {
  const card = button.closest("[data-breakthrough-card]");
  const answerID = card?.dataset.answerId;

  if (!answerID || !window.confirm("Drop breakthrough: Drop this breakthrough? The original journal answer will stay saved.")) {
    return;
  }

  const result = await dropBreakthrough(answerID);

  if (!isReadyResult(result)) {
    setText(breakthroughMessage, "Breakthrough could not be removed. Try again.");
    return;
  }

  renderBreakthroughs(result.breakthroughs || []);

  if (historySelectedDayID) {
    const selectedDayID = historySelectedDayID;
    await loadSelectedHistoryDay(selectedDayID, { scrollCard: false });
  }

  setText(breakthroughMessage, DROP_SUCCESS_MESSAGE);
}

async function loadHistoryView() {
  const requestID = historyLoadRequestID + 1;
  historyLoadRequestID = requestID;
  setText(historyStatus, HISTORY_COPY.loading);
  setText(historySaveMessage, "");
  setText(breakthroughMessage, "");
  const [state, breakthroughsState] = await Promise.all([
    getHistoryState(),
    getBreakthroughs(),
  ]);

  if (requestID !== historyLoadRequestID) {
    return;
  }

  const sourceDayID = pendingHistorySourceDayID;
  pendingHistorySourceDayID = "";
  renderBreakthroughs(breakthroughsState.available ? breakthroughsState.breakthroughs : []);
  renderHistoryState(state, { preferredDayID: sourceDayID });

  if (!state.available) {
    return;
  }

  if (sourceDayID && isHistoryDayViewable(sourceDayID)) {
    await loadSelectedHistoryDay(sourceDayID, {
      sourceDay: true,
      scrollCard: true,
    });
    return;
  }

  if (sourceDayID) {
    setText(historyStatus, historyLimitedStatusText(state.days.length));
  }

  if (state.days.length === 0) {
    return;
  }
}

async function loadSelectedHistoryDay(dayID, options = {}) {
  const requestedDayID = String(dayID || "");

  if (!requestedDayID) {
    return;
  }

  const requestID = historyDayLoadRequestID + 1;
  historyDayLoadRequestID = requestID;
  historySelectedDayID = requestedDayID;
  ensureHistoryPageForDay(requestedDayID);
  markSelectedHistoryDay(requestedDayID);
  setText(historyDetailTitle, requestedDayID);
  setText(historySaveMessage, "");
  setText(historyStatus, HISTORY_COPY.loading);
  const state = await getHistoryDay(requestedDayID);

  if (requestID !== historyDayLoadRequestID || requestedDayID !== historySelectedDayID) {
    return;
  }

  if (!state.available) {
    setText(historyStatus, HISTORY_COPY.error);
    return;
  }

  renderHistoryDayDetail(state);
  setText(historyStatus, options.sourceDay ? HISTORY_COPY.sourceDayOpened : "");

  if (options.scrollCard) {
    scrollHistoryCardIntoView(requestedDayID);
  }

  if (options.focusDetail) {
    focusHistoryDetail();
  }
}

function renderHistoryState(state, options = {}) {
  currentHistoryState = state;
  replaceChildren(historyList);
  renderHistoryPagination();
  currentHistoryDayState = null;
  historySelectedDayID = "";
  pendingHistoryWeightConfirmation = null;
  historyDetail.hidden = true;
  setText(historySaveMessage, "");

  if (!state.available) {
    historyDetail.hidden = true;
    renderHistoryPagination();
    setText(historyStatus, HISTORY_COPY.error);
    return;
  }

  if (!state.days.length) {
    historyDetail.hidden = true;
    renderHistoryPagination();
    renderHistoryEmptyState();
    return;
  }

  if (options.preferredDayID) {
    ensureHistoryPageForDay(options.preferredDayID, { skipRender: true });
  }

  const pageDays = historyPageDays();
  setText(historyStatus, historyStatusText(state.days.length));
  renderHistoryPagination();

  for (const day of pageDays) {
    historyList?.append(renderHistoryDayCard(day));
  }
}

function renderHistoryDayDetail(dayState) {
  currentHistoryDayState = dayState;
  const dayID = dayState.day?.dayID || historySelectedDayID;
  const isEditable = dayState.editStatus === "Editable";
  const selectedCard = historyCardForDay(dayID);

  if (selectedCard && historyDetail?.parentNode !== selectedCard) {
    selectedCard.append(historyDetail);
  }

  historyDetail.hidden = false;
  historyDetail.dataset.editStatus = dayState.editStatus || "";
  setText(historyDetailDate, dayID);
  setText(historyDetailTitle, dayID);
  historyEditBadge.hidden = false;
  historyEditBadge.className = isEditable ? "editable-badge" : "read-only-badge";
  setText(historyEditBadge, isEditable ? HISTORY_COPY.editableBadge : HISTORY_COPY.readOnlyBadge);
  setText(historyEditCopy, isEditable ? HISTORY_COPY.editableExplanation : HISTORY_COPY.readOnlyExplanation);
  renderHistoryWeight(dayState.weight, isEditable);
  renderHistoryMeals(dayState.meals, isEditable);
  renderHistoryAnswers(dayState.answers, isEditable);
  renderHistoryBreakthroughs(dayState.breakthroughs);
  historySaveButton.hidden = !isEditable;
  setText(historySaveButton, HISTORY_COPY.saveAction);
  markSelectedHistoryDay(dayID);
}

async function saveSelectedHistoryDay() {
  const selectedDayID = historySelectedDayID;

  if (!selectedDayID || currentHistoryDayState?.editStatus !== "Editable") {
    setText(historySaveMessage, HISTORY_COPY.saveError);
    return;
  }

  const draft = serializeHistoryDraft();
  const requestedWeight = draft.weight?.value ?? "";
  const result = await saveHistoryDay(selectedDayID, draft, {
    confirmLargeChange: pendingHistoryWeightConfirmation?.dayID === selectedDayID
      && pendingHistoryWeightConfirmation?.value === requestedWeight,
  });

  if (selectedDayID !== historySelectedDayID) {
    return;
  }

  if (!isReadyResult(result)) {
    if (result?.status === "NeedsConfirmation") {
      pendingHistoryWeightConfirmation = { dayID: selectedDayID, value: requestedWeight };
      setText(historySaveMessage, "This weight is more than 5 pounds different from the prior day. Check for a typo, then tap Save day again to confirm.");
      return;
    }

    pendingHistoryWeightConfirmation = null;
    setText(historySaveMessage, HISTORY_COPY.saveError);
    return;
  }

  pendingHistoryWeightConfirmation = null;
  renderHistoryDayDetail(result);
  setText(historySaveMessage, HISTORY_COPY.saveSuccess);
}

function serializeHistoryDraft() {
  const weightValue = historyDetail?.querySelector("[data-history-weight-input]")?.value?.trim() || "";
  const waistValue = historyDetail?.querySelector("[data-history-waist-input]")?.value?.trim() || "";
  const draft = {
    meals: Object.fromEntries(Array.from(historyDetail?.querySelectorAll("[data-history-meal-card]") || [])
      .map((card) => {
        const slot = card.dataset.slot;
        return [slot, {
          plannedText: card.querySelector("[data-history-meal-plan]")?.value || "",
          logState: card.querySelector("[data-history-meal-state]")?.value || MEAL_STATES.notLogged,
          ateWhenHungry: selectedMetricValue(card, `history-${slot}-hungry`) || MEAL_ANSWERS.unanswered,
          stoppedAtEnough: selectedMetricValue(card, `history-${slot}-enough`) || MEAL_ANSWERS.unanswered,
        }];
      })),
    answers: Object.fromEntries(Array.from(historyDetail?.querySelectorAll("[data-history-answer-card]") || [])
      .map((card) => [card.dataset.promptId, {
        text: card.querySelector("[data-history-answer-text]")?.value || "",
        selectedChipIDs: Array.from(card.querySelectorAll("[data-history-answer-chip][aria-pressed='true']"))
          .map((button) => button.dataset.historyAnswerChip),
        detail: card.querySelector("[data-history-answer-detail]")?.value || "",
      }])),
  };

  if (weightValue !== "" || waistValue !== "" || currentHistoryDayState?.weight?.value != null || currentHistoryDayState?.weight?.waist != null) {
    draft.weight = {
      value: weightValue,
      waist: waistValue,
    };
  }

  return draft;
}

function openHistorySourceDay(dayID) {
  const requestedDayID = String(dayID || "");

  if (!requestedDayID) {
    setText(breakthroughMessage, HISTORY_COPY.error);
    return;
  }

  pendingHistorySourceDayID = requestedDayID;
  historySelectedDayID = requestedDayID;
  selectTab("history");
}

function renderHistoryEmptyState() {
  const empty = document.createElement("article");
  const heading = document.createElement("h3");
  const copy = document.createElement("p");
  empty.className = "history-day-card history-empty";
  setText(heading, HISTORY_COPY.emptyHeading);
  setText(copy, HISTORY_COPY.emptyBody);
  empty.append(heading, copy);
  historyList?.append(empty);
  setText(historyStatus, "");
}

function changeHistoryPage(action) {
  const pageCount = historyPageCount();
  const nextPageIndex = action === "previous"
    ? historyPageIndex - 1
    : historyPageIndex + 1;
  const clampedPageIndex = Math.min(Math.max(nextPageIndex, 0), Math.max(pageCount - 1, 0));

  if (clampedPageIndex === historyPageIndex || !currentHistoryState?.available) {
    return;
  }

  historyPageIndex = clampedPageIndex;
  historySelectedDayID = "";
  pendingHistoryWeightConfirmation = null;
  renderHistoryState(currentHistoryState);
  collapseSelectedHistoryDay("", { scrollCard: false });
}

function historyViewableDays() {
  return (currentHistoryState?.days || []).slice(0, HISTORY_MAX_VISIBLE_DAYS);
}

function historyPageDays() {
  const startIndex = historyPageIndex * HISTORY_PAGE_SIZE;
  return historyViewableDays().slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
}

function historyPageCount() {
  return Math.max(1, Math.ceil(historyViewableDays().length / HISTORY_PAGE_SIZE));
}

function ensureHistoryPageForDay(dayID, options = {}) {
  const dayIndex = historyViewableDays().findIndex((day) => day.dayID === dayID);

  if (dayIndex < 0) {
    return false;
  }

  const nextPageIndex = Math.floor(dayIndex / HISTORY_PAGE_SIZE);

  if (nextPageIndex !== historyPageIndex) {
    historyPageIndex = nextPageIndex;

    if (!options.skipRender && currentHistoryState?.available) {
      renderHistoryState(currentHistoryState);
    }
  }

  return true;
}

function isHistoryDayViewable(dayID) {
  return historyViewableDays().some((day) => day.dayID === dayID);
}

function historyStatusText(totalDays) {
  if (totalDays > HISTORY_MAX_VISIBLE_DAYS) {
    return historyLimitedStatusText(totalDays);
  }

  const countCopy = totalDays === 1 ? "1 day with saved entries." : `${totalDays} days with saved entries.`;
  return historyPageCount() > 1 ? `${countCopy} Page ${historyPageIndex + 1} of ${historyPageCount()}.` : countCopy;
}

function historyLimitedStatusText(totalDays) {
  return `${HISTORY_MAX_VISIBLE_DAYS} of ${totalDays} days with saved entries are viewable here. Only the most recent ${HISTORY_MAX_VISIBLE_DAYS} days are shown in History.`;
}

function renderHistoryPagination() {
  replaceChildren(historyPagination);

  if (!currentHistoryState?.available || !currentHistoryState.days?.length) {
    return;
  }

  const pageCount = historyPageCount();
  const totalDays = currentHistoryState.days.length;

  if (pageCount <= 1 && totalDays <= HISTORY_MAX_VISIBLE_DAYS) {
    return;
  }

  const notice = document.createElement("p");
  notice.className = "note";
  setText(notice, totalDays > HISTORY_MAX_VISIBLE_DAYS
    ? `Only the most recent ${HISTORY_MAX_VISIBLE_DAYS} days are viewable in History. Export a backup to keep the full record.`
    : `Page ${historyPageIndex + 1} of ${pageCount}.`);
  historyPagination?.append(notice);

  if (pageCount <= 1) {
    return;
  }

  const controls = document.createElement("div");
  const previous = document.createElement("button");
  const next = document.createElement("button");
  controls.className = "history-pagination-controls";
  previous.type = "button";
  previous.className = "secondary-action compact-action";
  previous.dataset.historyPage = "previous";
  previous.disabled = historyPageIndex === 0;
  setText(previous, "Previous");
  next.type = "button";
  next.className = "secondary-action compact-action";
  next.dataset.historyPage = "next";
  next.disabled = historyPageIndex >= pageCount - 1;
  setText(next, "Next");
  controls.append(previous, next);
  historyPagination?.append(controls);
}

function renderHistoryDayCard(day) {
  const fragment = historyDayTemplate?.content.firstElementChild.cloneNode(true);
  const card = fragment || document.createElement("article");
  const button = card.querySelector("[data-history-day]") || document.createElement("button");
  const dateNode = card.querySelector("[data-history-day-date]");
  const summaryNode = card.querySelector("[data-history-day-summary]");

  card.dataset.dayId = day.dayID;
  button.dataset.dayId = day.dayID;
  setText(dateNode, day.dayID);
  setText(summaryNode, historyDaySummary(day));
  card.classList.toggle("is-selected", day.dayID === historySelectedDayID);
  button.setAttribute("aria-current", day.dayID === historySelectedDayID ? "true" : "false");
  button.setAttribute("aria-expanded", day.dayID === historySelectedDayID ? "true" : "false");

  return card;
}

function historyDaySummary(day) {
  const content = day?.content || {};
  const parts = [];

  if (content.hasMeals) {
    parts.push("meals");
  }

  if (content.hasWeight) {
    parts.push("weight");
  }

  if (content.hasReflection) {
    parts.push("reflection");
  }

  if (content.hasBreakthroughs) {
    parts.push("breakthroughs");
  }

  return parts.length ? `Saved ${parts.join(", ")}.` : "Saved entry.";
}

function markSelectedHistoryDay(dayID) {
  historyList?.querySelectorAll(".history-day-card").forEach((card) => {
    const selected = card.dataset.dayId === dayID;
    card.classList.toggle("is-selected", selected);
    const button = card.querySelector("[data-history-day]");
    button?.setAttribute("aria-current", selected ? "true" : "false");
    button?.setAttribute("aria-expanded", selected ? "true" : "false");
  });
}

function historyCardForDay(dayID) {
  return Array.from(historyList?.querySelectorAll(".history-day-card") || [])
    .find((card) => card.dataset.dayId === dayID) || null;
}

function toggleSelectedHistoryDay(dayID) {
  const requestedDayID = String(dayID || "");

  if (!requestedDayID) {
    return;
  }

  if (historySelectedDayID === requestedDayID && historyDetail && !historyDetail.hidden) {
    collapseSelectedHistoryDay(requestedDayID, { scrollCard: true });
    return;
  }

  loadSelectedHistoryDay(requestedDayID, { scrollCard: true });
}

function collapseSelectedHistoryDay(dayID = historySelectedDayID, options = {}) {
  const requestedDayID = String(dayID || "");
  historyDayLoadRequestID += 1;
  historySelectedDayID = "";
  currentHistoryDayState = null;
  pendingHistoryWeightConfirmation = null;

  if (historyDetail) {
    historyDetail.hidden = true;
  }

  markSelectedHistoryDay("");
  setText(historySaveMessage, "");

  if (requestedDayID && options.scrollCard) {
    scrollHistoryCardIntoView(requestedDayID);
  }
}

function scrollHistoryCardIntoView(dayID) {
  historyCardForDay(dayID)?.scrollIntoView({
    block: "start",
    inline: "nearest",
    behavior: "auto",
  });
}

function renderHistoryWeight(weight, isEditable) {
  replaceChildren(historyWeightSection);
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  section.className = "history-detail-section";
  setText(heading, "Weight and waist");
  section.append(heading);

  if (isEditable) {
    section.append(
      createMeasurementField("history-weight-value", "Weight", "historyWeightInput", weight?.value),
      createMeasurementField("history-waist-value", "Waist measurement", "historyWaistInput", weight?.waist),
    );
  } else {
    section.append(createValueRow("Weight", weight?.value == null ? HISTORY_COPY.noWeight : String(weight.value)));
    section.append(createValueRow("Waist measurement", weight?.waist == null ? "No waist entered" : String(weight.waist)));
  }

  historyWeightSection?.append(section);
}

function createMeasurementField(id, labelCopy, dataKey, value) {
  const group = document.createElement("div");
  const label = document.createElement("label");
  const input = document.createElement("input");
  group.className = "history-field-stack";
  label.className = "field-label";
  label.setAttribute("for", id);
  setText(label, labelCopy);
  input.id = id;
  input.className = "text-field";
  input.type = "number";
  input.inputMode = "decimal";
  input.step = "0.1";
  input.min = "0";
  input.dataset[dataKey] = "true";
  input.value = value == null ? "" : String(value);
  group.append(label, input);
  return group;
}

function renderHistoryMeals(meals, isEditable) {
  replaceChildren(historyMealList);

  for (const meal of meals || []) {
    historyMealList?.append(renderHistoryMealCard(meal, isEditable));
  }
}

function renderHistoryMealCard(meal, isEditable) {
  const fragment = historyMealTemplate?.content.firstElementChild.cloneNode(true);
  const card = fragment || document.createElement("article");
  const title = card.querySelector("[data-history-meal-title]");
  const body = card.querySelector("[data-history-meal-body]");
  const slot = meal.slot;

  card.dataset.slot = slot;
  setText(title, meal.slotLabel || mealLabel(slot));
  replaceChildren(body);

  if (isEditable) {
    body?.append(
      createTextareaField(`history-${slot}-plan`, "Plan", "historyMealPlan", meal.plannedText || ""),
      createMealStateControl(meal),
      createMetricControl(`history-${slot}-hungry`, "Hunger Level", meal.ateWhenHungry),
      createMetricControl(`history-${slot}-enough`, "Satiety Level", meal.stoppedAtEnough),
    );
  } else {
    body?.append(
      createValueRow("Plan", meal.plannedText || HISTORY_COPY.noPlan),
      createValueRow("Status", mealStatusLabel(meal.logState)),
      createValueRow("Hunger Level", metricLabel(meal.ateWhenHungry)),
      createValueRow("Satiety Level", metricLabel(meal.stoppedAtEnough)),
    );
  }

  return card;
}

function createMealStateControl(meal) {
  const label = document.createElement("label");
  const select = document.createElement("select");
  label.className = "field-label";
  label.setAttribute("for", `history-${meal.slot}-state`);
  setText(label, "Log status");
  select.id = `history-${meal.slot}-state`;
  select.className = "text-field";
  select.dataset.historyMealState = "true";

  for (const [value, copy] of [
    [MEAL_STATES.notLogged, "Not logged"],
    [MEAL_STATES.logged, "Logged"],
    [MEAL_STATES.skipped, "Skipped"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    setText(option, copy);
    select.append(option);
  }

  select.value = meal.logState || MEAL_STATES.notLogged;

  const group = document.createElement("div");
  group.className = "history-field-stack";
  group.append(label, select);
  return group;
}

function createMetricControl(name, legendCopy, value) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const output = document.createElement("output");
  const scaleLabels = document.createElement("p");
  fieldset.className = "metric-group meal-scale-group";
  setText(legend, legendCopy);

  label.className = "scale-field";
  input.type = "range";
  input.name = name;
  input.min = "0";
  input.max = "4";
  input.step = "1";
  input.dataset.mealLevel = "true";
  output.dataset.mealLevelOutput = "true";
  scaleLabels.className = "scale-labels";
  setText(scaleLabels, mealScaleCopy());

  label.append(input, output);
  fieldset.append(legend, label, scaleLabels);
  setMetricInputValue(input, value);

  return fieldset;
}

function renderHistoryAnswers(answers, isEditable) {
  replaceChildren(historyAnswerList);

  if (!answers?.length) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    section.className = "history-detail-section";
    setText(heading, "Reflection");
    section.append(heading, createValueRow("Reflection", HISTORY_COPY.noReflection));
    historyAnswerList?.append(section);
    return;
  }

  for (const answer of answers) {
    historyAnswerList?.append(renderHistoryAnswerCard(answer, isEditable));
  }
}

function renderHistoryAnswerCard(answer, isEditable) {
  const fragment = historyAnswerTemplate?.content.firstElementChild.cloneNode(true);
  const card = fragment || document.createElement("article");
  const label = card.querySelector("[data-history-answer-label]");
  const body = card.querySelector("[data-history-answer-body]");
  const textID = `history-${answer.promptID}-answer`;

  card.dataset.promptId = answer.promptID;
  setText(label, answer.promptText || answer.promptID);
  replaceChildren(body);

  if (isEditable) {
    const textField = createTextareaField(textID, answer.promptText || "Reflection answer", "historyAnswerText", answer.text || "");
    body?.append(textField);

    if (answer.supportsChips) {
      body?.append(createHistoryChipGroup(answer.selectedChips || [], true));
    }

  } else {
    body?.append(createValueRow("Answer", answer.text || HISTORY_COPY.noReflection));

    if (answer.selectedChips?.length) {
      body?.append(createValueRow("Context", answer.selectedChips.map((chip) => chip.label).join(", ")));
    }
  }

  return card;
}

function createHistoryChipGroup(selectedChips, editable) {
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const list = document.createElement("div");
  const selectedIDs = new Set(selectedChips.map((chip) => chip.id));
  group.className = "journal-chip-group";
  list.className = "journal-chip-list history-chip-list";
  setText(legend, "Optional context");
  group.append(legend, list);

  if (!editable) {
    setText(list, selectedChips.map((chip) => chip.label).join(", "));
    return group;
  }

  for (const chip of JOURNAL_CHIPS) {
    const button = document.createElement("button");
    const selected = selectedIDs.has(chip.id);
    button.type = "button";
    button.className = "secondary-action journal-chip";
    button.dataset.historyAnswerChip = chip.id;
    button.setAttribute("aria-pressed", String(selected));
    setText(button, selected ? `✓ ${chip.label}` : chip.label);
    list.append(button);
  }

  return group;
}

function renderHistoryBreakthroughs(breakthroughs) {
  replaceChildren(historyBreakthroughSection);
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  section.className = "history-detail-section";
  setText(heading, "Breakthroughs");
  section.append(heading);

  if (!breakthroughs?.length) {
    section.append(createValueRow("Breakthrough status", HISTORY_COPY.noBreakthroughs));
    historyBreakthroughSection?.append(section);
    return;
  }

  for (const breakthrough of breakthroughs) {
    const row = createValueRow(breakthrough.promptText || "Breakthrough", breakthrough.text || HISTORY_COPY.noReflection);
    section.append(row);
  }

  historyBreakthroughSection?.append(section);
}

function createTextareaField(id, labelCopy, dataKey, value) {
  const group = document.createElement("div");
  const label = document.createElement("label");
  const textarea = document.createElement("textarea");
  group.className = "history-field-stack";
  label.className = "field-label";
  label.setAttribute("for", id);
  setText(label, labelCopy);
  textarea.id = id;
  textarea.className = "text-field journal-textarea";
  textarea.rows = 3;
  textarea.dataset[dataKey] = "true";
  textarea.value = value || "";
  group.append(label, textarea);

  return group;
}

function createValueRow(labelCopy, valueCopy) {
  const row = document.createElement("div");
  const label = document.createElement("p");
  const value = document.createElement("p");
  row.className = "history-value-row";
  label.className = "field-label";
  setText(label, labelCopy);
  setText(value, valueCopy || "");
  row.append(label, value);

  return row;
}

function toggleHistoryAnswerChip(button) {
  const selected = button.getAttribute("aria-pressed") === "true";
  const chip = JOURNAL_CHIPS.find((candidate) => candidate.id === button.dataset.historyAnswerChip);
  button.setAttribute("aria-pressed", String(!selected));
  setText(button, !selected ? `✓ ${chip?.label || ""}` : chip?.label || "");
}

function focusHistoryDetail() {
  const firstControl = historyDetail?.querySelector("input, select, textarea, button:not([hidden])");

  if (firstControl) {
    firstControl.focus({ preventScroll: true });
    return;
  }

  historyDetailTitle?.focus({ preventScroll: true });
}

function metricLabel(value) {
  return mealLevelLabel(value);
}

function mealLabel(slot) {
  return {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Optional Snack",
  }[slot] || "Meal";
}

async function saveTodayWeight() {
  refreshCurrentDayIDs();
  const value = weightInput?.value || "";
  const waist = waistInput?.value || "";
  const result = await saveWeight(todayDayID, value, {
    waist,
    confirmLargeChange: pendingWeightConfirmation?.dayID === todayDayID && pendingWeightConfirmation?.value === value,
  });

  if (!isReadyResult(result)) {
    if (result.status === "NeedsConfirmation") {
      pendingWeightConfirmation = { dayID: todayDayID, value };
      setText(weightMessage, "This is more than 5 pounds different from yesterday. Check for a typo, then tap Save weight again to confirm.");
      return;
    }

    pendingWeightConfirmation = null;
    setText(weightMessage, result.status === "Invalid" ? "Enter a positive weight or waist value before saving." : "Measurements could not be saved. Try again.");
    return;
  }

  pendingWeightConfirmation = null;
  renderTodayState(result);
  setText(weightMessage, "Measurements saved for today.");
}

async function saveMealFromForm(form) {
  refreshCurrentDayIDs();
  const card = form.closest("[data-meal-card]");
  const message = mealMessageForCard(card);
  const slot = card?.dataset.slot || form.dataset.slot;
  const ateWhenHungry = selectedMetricValue(form, `${slot}-hungry`);
  const stoppedAtEnough = selectedMetricValue(form, `${slot}-enough`);

  if (!isMealLevelAnswered(ateWhenHungry) || !isMealLevelAnswered(stoppedAtEnough)) {
    setText(message, "Choose a Hunger Level and Satiety Level before saving.");
    return;
  }

  const result = await saveMealLog(todayDayID, slot, {
    ateWhenHungry,
    stoppedAtEnough,
  });

  if (!isReadyResult(result)) {
    setText(message, "Meal log could not be saved. Try again.");
    return;
  }

  renderAffectedMeal(result, slot);
  markTodayFocalState(result);
  setText(message, "Meal log saved.");
}

async function skipSelectedMeal(button) {
  refreshCurrentDayIDs();
  const card = button.closest("[data-meal-card]");
  const message = mealMessageForCard(card);
  const slot = card?.dataset.slot || button.dataset.skipMeal;
  const result = await skipMeal(todayDayID, slot);

  if (!isReadyResult(result)) {
    setText(message, "Meal log could not be saved. Try again.");
    return;
  }

  renderAffectedMeal(result, slot);
  markTodayFocalState(result);
  setText(message, "Meal marked skipped.");
}

async function unskipSelectedMeal(button) {
  refreshCurrentDayIDs();
  const card = button.closest("[data-meal-card]");
  const message = mealMessageForCard(card);
  const slot = card?.dataset.slot || button.dataset.unskipMeal;
  const result = await unskipMeal(todayDayID, slot);

  if (!isReadyResult(result)) {
    setText(message, "Meal log could not be saved. Try again.");
    return;
  }

  renderAffectedMeal(result, slot);
  markTodayFocalState(result);
  setText(message, "Meal skip undone.");
}

function renderTodayState(state) {
  if (!state.available) {
    setText(weightMessage, "Today's entries could not be loaded. Reopen the app and try again. Data already saved on this device stays local.");
    return;
  }

  todayDayID = state.day.dayID;
  setText(todayDate, state.day.dayID);

  if (weightInput) {
    weightInput.value = state.weight?.value == null ? "" : String(state.weight.value);
  }

  if (waistInput) {
    waistInput.value = state.weight?.waist == null ? "" : String(state.weight.waist);
  }

  renderTodaySupport(state.supportNote);
  setText(weightMessage, measurementsSavedMessage(state.weight));

  for (const meal of state.meals) {
    renderMeal(meal);
  }

  markTodayFocalState(state);
}

function renderTodaySupport(supportNote) {
  if (!supportNote?.text) {
    setText(todaySupportText, "No support note saved yet.");
    setText(todaySupportSource, "");
    if (todaySupportSource) {
      todaySupportSource.hidden = true;
    }
    return;
  }

  setText(todaySupportText, supportNote.text);
  setText(todaySupportSource, `From ${supportNote.dayID} journal`);
  if (todaySupportSource) {
    todaySupportSource.hidden = false;
  }
}

function measurementsSavedMessage(weight) {
  const hasWeight = weight?.value != null;
  const hasWaist = weight?.waist != null;

  if (hasWeight && hasWaist) {
    return "Weight and waist saved for today.";
  }

  if (hasWeight) {
    return "Weight saved for today.";
  }

  if (hasWaist) {
    return "Waist saved for today.";
  }

  return "No measurements entered today.";
}

function renderJournalState(state) {
  currentJournalState = state;
  journalDayID = state.day?.dayID || journalDayID;
  setText(journalDay, journalDayID);
  setOutsidePlanChoice(state.outsidePlanAnswer?.text || "");
  renderJournalPrompts(state.prompts, state.answers);
  renderJournalHelper(state);
}

function updateJournalPromptsForOutsidePlanChoice() {
  if (!currentJournalState?.meals) {
    return;
  }

  const draftByPrompt = serializeJournalAnswers();
  const prompts = promptsForMeals(currentJournalState.meals, { outsidePlan: selectedOutsidePlanValue() === "yes" });
  const answersByPrompt = new Map((currentJournalState.answers || []).map((answer) => [answer.promptID, answer]));
  const draftAnswers = prompts.map((prompt) => ({
    ...(answersByPrompt.get(prompt.id) || {}),
    id: answersByPrompt.get(prompt.id)?.id || "",
    promptID: prompt.id,
    text: draftByPrompt[prompt.id]?.text || answersByPrompt.get(prompt.id)?.text || "",
    selectedChips: mergeSelectedChipSnapshots(draftByPrompt[prompt.id]?.selectedChipIDs, answersByPrompt.get(prompt.id)?.selectedChips || []),
    detail: draftByPrompt[prompt.id]?.detail || answersByPrompt.get(prompt.id)?.detail || "",
    breakthroughState: answersByPrompt.get(prompt.id)?.breakthroughState || BREAKTHROUGH_STATES.none,
  }));

  currentJournalState = {
    ...currentJournalState,
    prompts,
    answers: draftAnswers,
    outsidePlanAnswer: {
      ...(currentJournalState.outsidePlanAnswer || {}),
      promptID: OUTSIDE_PLAN_PROMPT_ID,
      text: selectedOutsidePlanValue(),
    },
  };
  renderJournalPrompts(prompts, draftAnswers);
  renderJournalHelper(currentJournalState);
}

function renderJournalPrompts(prompts, answers) {
  replaceChildren(journalPromptList);
  const answersByPrompt = new Map((answers || []).map((answer) => [answer.promptID, answer]));

  for (const prompt of prompts || []) {
    journalPromptList?.append(renderJournalPromptCard(prompt, answersByPrompt.get(prompt.id)));
  }
}

function renderJournalPromptCard(prompt, answer = null) {
  const fragment = journalPromptTemplate?.content?.firstElementChild?.cloneNode(true);
  const card = fragment || document.createElement("article");
  const textID = `journal-${prompt.id}-answer`;
  const textArea = card.querySelector("[data-journal-answer-text]");
  const label = card.querySelector("[data-journal-prompt-label]");
  const contextList = card.querySelector("[data-journal-context-list]");
  const contextHeading = card.querySelector("[data-journal-context-heading]");
  const contextItems = card.querySelector("[data-journal-context-items]");
  const chipGroup = card.querySelector("[data-journal-chip-group]");
  const chipList = card.querySelector("[data-journal-chip-list]");
  const stateNode = card.querySelector("[data-breakthrough-state]");
  const button = card.querySelector("[data-toggle-breakthrough]");
  const breakthroughState = answer?.breakthroughState || BREAKTHROUGH_STATES.none;

  card.dataset.promptId = prompt.id;
  card.dataset.answerId = answer?.id || "";
  card.dataset.breakthroughState = breakthroughState;
  setText(label, journalPromptLabel(prompt));
  renderPromptContext(contextList, contextHeading, contextItems, prompt);

  if (label) {
    label.setAttribute("for", textID);
  }

  if (textArea) {
    textArea.id = textID;
    textArea.value = answer?.text || "";
  }

  if (prompt.supportsChips) {
    chipGroup.hidden = false;
    renderJournalChips(chipList, answer?.selectedChips || []);
  }

  if (breakthroughState === BREAKTHROUGH_STATES.marked) {
    stateNode.hidden = false;
    setText(stateNode, "Marked as breakthrough");
    setText(button, "Remove breakthrough");
  } else {
    stateNode.hidden = true;
    setText(button, "Mark as breakthrough");
  }

  return card;
}

function journalPromptLabel(prompt) {
  return prompt.id === "baseline-tomorrow"
    ? `${prompt.text} (Note: This will display on the journal tab tomorrow.)`
    : prompt.text;
}

function renderPromptContext(contextList, contextHeading, contextItems, prompt) {
  if (!contextList || !prompt.contextItems?.length) {
    return;
  }

  contextList.hidden = false;
  setText(contextHeading, prompt.contextHeading || "");
  replaceChildren(contextItems);

  for (const item of prompt.contextItems) {
    const node = document.createElement("li");
    setText(node, item);
    contextItems.append(node);
  }
}

function selectedOutsidePlanValue() {
  return outsidePlanControls.find((control) => control.checked)?.value || "";
}

function setOutsidePlanChoice(value) {
  for (const control of outsidePlanControls) {
    control.checked = control.value === value;
  }
}

function mergeSelectedChipSnapshots(selectedChipIDs = [], existingChips = []) {
  if (!selectedChipIDs?.length) {
    return existingChips;
  }

  const chipByID = new Map(JOURNAL_CHIPS.map((chip) => [chip.id, chip]));

  return selectedChipIDs
    .map((chipID) => chipByID.get(chipID))
    .filter(Boolean)
    .map((chip) => ({ id: chip.id, label: chip.label }));
}

function renderJournalChips(container, selectedChips) {
  replaceChildren(container);
  const selectedIDs = new Set(selectedChips.map((chip) => chip.id));

  for (const chip of JOURNAL_CHIPS) {
    const button = document.createElement("button");
    const selected = selectedIDs.has(chip.id);
    button.type = "button";
    button.className = "secondary-action journal-chip";
    button.dataset.journalChip = chip.id;
    button.setAttribute("aria-pressed", String(selected));
    setText(button, selected ? `✓ ${chip.label}` : chip.label);
    container?.append(button);
  }
}

function renderJournalHelper(state) {
  const hasDeeperPrompt = (state.prompts || []).some((prompt) => prompt.id.startsWith("deeper-"));
  const hasMissingMeal = (state.meals || []).some((meal) => meal.logState === MEAL_STATES.notLogged);
  setText(journalHelper, hasMissingMeal ? MISSING_MEAL_DATA_MESSAGE : (hasDeeperPrompt ? "" : NO_EXTRA_PROMPTS_MESSAGE));
}

function renderBreakthroughs(breakthroughs) {
  replaceChildren(breakthroughList);

  if (!breakthroughs || breakthroughs.length === 0) {
    const empty = document.createElement("article");
    const heading = document.createElement("h3");
    const copy = document.createElement("p");
    empty.className = "breakthrough-card breakthrough-empty";
    setText(heading, "No breakthroughs saved yet");
    setText(copy, "Mark an answer as a breakthrough when something feels useful to remember.");
    empty.append(heading, copy);
    breakthroughList?.append(empty);
    return;
  }

  for (const breakthrough of breakthroughs) {
    breakthroughList?.append(renderBreakthroughCard(breakthrough));
  }
}

function renderBreakthroughCard(breakthrough) {
  const fragment = breakthroughTemplate?.content?.firstElementChild?.cloneNode(true);
  const card = fragment || document.createElement("article");
  const dayNode = card.querySelector("[data-breakthrough-day]");
  const promptNode = card.querySelector("[data-breakthrough-prompt]");
  const answerNode = card.querySelector("[data-breakthrough-answer]");
  const chipNode = card.querySelector("[data-breakthrough-chips]");

  card.dataset.answerId = breakthrough.id;
  card.dataset.dayId = breakthrough.dayID;
  setText(dayNode, breakthrough.dayID);
  setText(promptNode, breakthrough.promptText);
  setText(answerNode, breakthrough.text);

  if (breakthrough.selectedChips?.length) {
    chipNode.hidden = false;
    setText(chipNode, breakthrough.selectedChips.map((chip) => chip.label).join(", "));
  }

  return card;
}

function renderMeal(meal) {
  const plannedTextNode = document.querySelector(`[data-planned-text="${meal.slot}"]`);
  const planEmptyCopy = document.querySelector(`[data-plan-empty-copy="${meal.slot}"]`);
  const statusNode = document.querySelector(`[data-meal-status="${meal.slot}"]`);
  const form = document.querySelector(`[data-meal-form][data-slot="${meal.slot}"]`);
  const submitButton = form?.querySelector("[type='submit']");
  const skipButton = form?.querySelector("[data-skip-meal]");
  const unskipButton = form?.querySelector("[data-unskip-meal]");
  const metricGroups = form?.querySelectorAll(".metric-group") || [];

  setText(plannedTextNode, meal.plannedText || "No plan entered");
  if (planEmptyCopy) {
    planEmptyCopy.hidden = Boolean(meal.plannedText);
  }

  renderMealStatus(statusNode, meal.logState);
  setMetricValue(form, `${meal.slot}-hungry`, meal.ateWhenHungry);
  setMetricValue(form, `${meal.slot}-enough`, meal.stoppedAtEnough);

  if (submitButton) {
    setText(submitButton, meal.logState === MEAL_STATES.logged ? "Update log" : "Log meal");
    submitButton.hidden = meal.logState === MEAL_STATES.skipped;
  }

  if (skipButton) {
    skipButton.hidden = meal.logState === MEAL_STATES.skipped;
  }

  if (unskipButton) {
    unskipButton.hidden = meal.logState !== MEAL_STATES.skipped;
  }

  metricGroups.forEach((group) => {
    group.hidden = meal.logState === MEAL_STATES.skipped;
  });
}

function selectedPlanDayID() {
  const selected = document.querySelector("[name='plan-day']:checked")?.value;
  return selected === "today" ? getTodayDayID() : getTomorrowDayID();
}

function refreshCurrentDayIDs() {
  todayDayID = getTodayDayID();
  planDayID = selectedPlanDayID();
}

function selectedMetricValue(form, name) {
  const range = form?.querySelector(`input[type="range"][name="${name}"][data-meal-level]`);

  if (range) {
    const value = normalizeMealLevel(range.value);
    return range.dataset.metricAnswered === "true" && isMealLevelAnswered(value) ? value : null;
  }

  const value = form?.querySelector(`[name="${name}"]:checked`)?.value;
  const normalized = normalizeMealLevel(value);
  return isMealLevelAnswered(normalized) ? normalized : null;
}

function setMetricValue(form, name, value) {
  const range = form?.querySelector(`input[type="range"][name="${name}"][data-meal-level]`);

  if (range) {
    setMetricInputValue(range, value);
    return;
  }

  form?.querySelectorAll(`[name="${name}"]`).forEach((input) => {
    input.checked = normalizeMealLevel(input.value) === normalizeMealLevel(value);
  });
}

function setMetricInputValue(input, value) {
  const normalized = normalizeMealLevel(value);
  const answered = isMealLevelAnswered(normalized);
  input.value = answered ? String(normalized) : "2";
  input.dataset.metricAnswered = String(answered);
  updateMealLevelOutput(input);
}

function updateMealLevelOutput(input) {
  const output = input.closest(".metric-group")?.querySelector("[data-meal-level-output]");
  const value = input.dataset.metricAnswered === "true" ? normalizeMealLevel(input.value) : MEAL_ANSWERS.unanswered;
  setText(output, value === MEAL_ANSWERS.unanswered ? "Not selected" : mealLevelLabel(value));
}

function markMealLevelAnswered(input) {
  input.dataset.metricAnswered = "true";
  updateMealLevelOutput(input);
}

function mealScaleCopy() {
  return MEAL_LEVELS.map((level) => `${level.value} ${level.descriptor}`).join(" | ");
}

function setPlanFormDisabled(disabled) {
  planForm?.querySelectorAll("input, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function setJournalFormDisabled(disabled) {
  journalForm?.querySelectorAll("input, textarea, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function isReadyResult(result) {
  return result?.available === true && result.status === "Ready";
}

function renderAffectedMeal(state, slot) {
  const meal = state.meals.find((candidate) => candidate.slot === slot);
  if (meal) {
    renderMeal(meal);
  }
}

function mealMessageForCard(card) {
  if (!card) {
    return null;
  }

  return card.querySelector("[data-meal-message]");
}

function toggleJournalChip(button) {
  const selected = button.getAttribute("aria-pressed") === "true";
  const chip = JOURNAL_CHIPS.find((candidate) => candidate.id === button.dataset.journalChip);
  button.setAttribute("aria-pressed", String(!selected));
  setText(button, !selected ? `✓ ${chip?.label || ""}` : chip?.label || "");
}

function replaceChildren(node, ...children) {
  if (!node) {
    return;
  }

  node.replaceChildren(...children);
}

function markTodayFocalState(state) {
  const hasMeasurements = state.weight?.value != null || state.weight?.waist != null;
  document.querySelector(".tracking-panel")?.classList.toggle("is-focal", !hasMeasurements);

  let focalMealSlot = null;
  if (hasMeasurements) {
    focalMealSlot = state.meals.find((meal) => meal.logState === MEAL_STATES.notLogged)?.slot || null;
  }

  document.querySelectorAll("[data-meal-card]").forEach((card) => {
    card.classList.toggle("is-focal", card.dataset.slot === focalMealSlot);
  });
}

function renderMealStatus(statusNode, logState) {
  const label = mealStatusLabel(logState);
  const marker = statusNode?.querySelector(".status-marker");
  const textNode = statusNode?.querySelector("[data-status-text]");

  if (statusNode) {
    statusNode.dataset.state = logState;
  }

  if (marker) {
    marker.dataset.state = logState;
    setText(marker, mealStatusMarker(logState));
  }

  setText(textNode, label);
}

function mealStatusLabel(logState) {
  if (logState === MEAL_STATES.logged) {
    return "Logged";
  }

  if (logState === MEAL_STATES.skipped) {
    return "Skipped";
  }

  return "Not logged";
}

function mealStatusMarker(logState) {
  if (logState === MEAL_STATES.logged) {
    return "✓";
  }

  if (logState === MEAL_STATES.skipped) {
    return "-";
  }

  return "○";
}

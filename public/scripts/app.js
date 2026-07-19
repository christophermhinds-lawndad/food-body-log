import { createAppPaths } from "./paths.js";
import { readSetupStatus, writeSetupStatus } from "./storage.js";
import { renderStatusRows, setStatusText, setText } from "./dom.js";
import { CHECKING_STATUS_ROWS, collectInstallStatus } from "./install-status.js?v=7";
import { getTodayDayID, getTomorrowDayID } from "./day-policy.js";
import { MEAL_ANSWERS, MEAL_STATES } from "./tracking-model.js?v=3";
import { getPlanState, getPlanSuggestions, getTodayTrackingState, saveMealLog, savePlan, saveWeight, skipMeal, unskipMeal } from "./today-tracking.js?v=4";
import { createPlanSuggestionController } from "./plan-suggestions-ui.js?v=4";
import { JOURNAL_CHIPS, BREAKTHROUGH_STATES, OUTSIDE_PLAN_PROMPT_ID, promptsForMeals } from "./journal-model.js?v=2";
import { getJournalState, saveReflection, setAnswerBreakthrough, dropBreakthrough } from "./journal-tracking.js?v=2";
import { HISTORY_COPY, REPORTS_COPY, getHistoryDay, getHistoryState, getReportsState, saveHistoryDay } from "./history-reports.js?v=1";
import { createDownloadSpec, exportLocalData, parseBackupText, replaceLocalDataFromBackup } from "./data-portability.js?v=1";

const appPaths = createAppPaths();

const titles = {
  today: "Today",
  plan: "Plan meals",
  reports: "Reports",
  journal: "Journal & Breakthroughs",
  history: "History",
  settings: "Settings",
};

const statusValueNodes = Object.fromEntries(
  Array.from(document.querySelectorAll("[data-status-value]")).map((node) => [node.dataset.statusValue, node]),
);
const settingsMessage = document.querySelector("#settings-message");
const weightForm = document.querySelector("#weight-form");
const weightInput = document.querySelector("#weight-value");
const weightMessage = document.querySelector("#weight-message");
const todayDate = document.querySelector("#today-date");
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
const mealReports = document.querySelector("#meal-reports");
const reportTileTemplate = document.querySelector("[data-report-tile-template]");
const historyStatus = document.querySelector("#history-status");
const historyList = document.querySelector("#history-list");
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
const SUGGESTION_ERROR_MESSAGE = "Suggestions could not be loaded. You can keep typing.";
const JOURNAL_LOAD_MESSAGE = "Loading evening reflection...";
const JOURNAL_UNAVAILABLE_MESSAGE = "Evening reflection could not be loaded. Reopen the app and try again.";
const JOURNAL_SAVE_ERROR_MESSAGE = "Reflection could not be saved. Try again; data already saved on this device stays local.";
const NO_EXTRA_PROMPTS_MESSAGE = "Nothing extra to reflect on from today's meal answers. You can still write anything that feels useful.";
const MISSING_MEAL_DATA_MESSAGE = "Not all meals are logged yet. That is okay; only logged non-skipped No answers add extra prompts.";
const DROP_SUCCESS_MESSAGE = "Breakthrough removed. The original answer stayed saved.";
const MAX_BACKUP_FILE_BYTES = 2_000_000;
const BACKUP_UI_COPY = Object.freeze({
  exportPreparing: "Preparing backup...",
  exportSuccess: "Backup exported. Keep the file somewhere you can find it later.",
  exportError: "Backup could not be exported. Reopen the app and try again. Data already saved on this device stays local.",
  noFile: "No backup selected",
  fileSelectedPrefix: "Backup selected:",
  checking: "Checking backup...",
  ready: "Backup looks ready to import. Review the confirmation before replacing local data.",
  chooseFirst: "Choose a backup first",
  confirmTitle: "Replace local data?",
  confirmBody: "This will replace the local data currently saved on this device with the selected backup. Export a backup first if you want a copy of what is here now.",
  replaceAction: "Replace local data",
  imported: "Backup imported. Reopen each tab to see restored local data.",
  invalid: "Backup could not be read. Choose a Food Body Log JSON backup exported from this app.",
  unsupported: "This backup format is not supported by this version of Food Body Log.",
  missingStore: "This backup is missing required local data sections, so nothing was imported.",
  oversized: "This file is larger than this version can import. Choose a smaller Food Body Log backup.",
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
let backupSelectionRequestID = 0;
let readyBackupPayload = null;
let currentJournalState = null;
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

weightForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveTodayWeight();
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
    loadSelectedHistoryDay(button.dataset.dayId, { focusDetail: true });
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
    renderStatusRows(
      [
        { id: "installMode", value: stored.value.installMode || "Not ready" },
        { id: "offlineCache", value: stored.value.offlineCache || "Not ready" },
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

    readyBackupPayload = parsed.payload;
    setText(importBackupStatus, BACKUP_UI_COPY.ready);
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

  if (!window.confirm(`${BACKUP_UI_COPY.confirmTitle}\n\n${BACKUP_UI_COPY.confirmBody}`)) {
    setText(importBackupStatus, BACKUP_UI_COPY.ready);
    return;
  }

  setText(importBackupStatus, "Replacing local data...");
  replaceBackupButton.disabled = true;

  const result = await replaceLocalDataFromBackup(readyBackupPayload);

  if (result.status !== "Ready") {
    setText(importBackupStatus, backupImportStatusText(result));
    updateReplaceBackupAction();
    return;
  }

  readyBackupPayload = null;
  if (backupFileInput) {
    backupFileInput.value = "";
  }
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
  setText(backupSelectedFile, BACKUP_UI_COPY.noFile);
  updateReplaceBackupAction();
}

function updateReplaceBackupAction() {
  if (!replaceBackupButton) {
    return;
  }

  replaceBackupButton.disabled = !readyBackupPayload;
  setText(replaceBackupButton, readyBackupPayload ? BACKUP_UI_COPY.replaceAction : BACKUP_UI_COPY.chooseFirst);
}

function backupImportStatusText(result) {
  const code = result?.error?.code || "";
  const copy = {
    "unsupported-backup": BACKUP_UI_COPY.unsupported,
    "missing-store": BACKUP_UI_COPY.missingStore,
    "file-too-large": BACKUP_UI_COPY.oversized,
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
    renderMealReportTiles([]);
    return;
  }

  setText(reportsStatus, "");
  renderWeightSummary(state.weightSummary);
  renderWeightReportTiles(state.weightAverages || []);
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
  for (const windowDays of [7, 30, 90]) {
    const tile = weightAverages.find((candidate) => candidate.windowDays === windowDays) || {
      windowDays,
      periodLabel: `Trailing ${windowDays} days`,
      state: "NoData",
      count: 0,
      average: null,
      formattedAverage: "",
    };
    renderWeightReportTile(tile);
  }
}

function renderMealReportTiles(mealMetrics) {
  for (const metricName of ["ateWhenHungry", "stoppedAtEnough"]) {
    const tile = mealMetrics.find((candidate) => candidate.metricName === metricName) || {
      metricName,
      label: metricName === "stoppedAtEnough" ? REPORTS_COPY.enoughLabel : REPORTS_COPY.hungryLabel,
      periodLabel: REPORTS_COPY.weightSevenDays,
      state: "NoData",
      yesCount: 0,
      denominator: 0,
      percentage: null,
    };
    renderMealReportTile(tile);
  }
}

function renderWeightReportTile(tile) {
  const card = weightReports?.querySelector(`[data-report-kind="weight"][data-window-days="${tile.windowDays}"]`);
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
  if (Object.hasOwn(tile, "average")) {
    if (tile.state === "Ready") {
      return tile.formattedAverage || String(tile.average);
    }

    return tile.state === "NotEnoughData" ? REPORTS_COPY.weightNotEnoughData : REPORTS_COPY.weightNoData;
  }

  if (tile.state === "Ready") {
    return `${tile.percentage}%`;
  }

  if (tile.state === "Insufficient") {
    return REPORTS_COPY.mealInsufficient;
  }

  return REPORTS_COPY.mealNoData;
}

function reportDenominatorText(tile) {
  if (Object.hasOwn(tile, "average")) {
    const count = Number(tile.count || 0);
    const noun = count === 1 ? "entry" : "entries";
    return REPORTS_COPY.weightDenominator.replace("{count}", String(count)).replace("entry/entries", noun);
  }

  const denominator = Number(tile.denominator || 0);

  if (tile.state === "Ready") {
    return REPORTS_COPY.mealDenominator
      .replace("{yesCount}", String(tile.yesCount || 0))
      .replace("{denominator}", String(denominator));
  }

  return denominator === 1 ? "1 logged non-skipped meal in this period." : `${denominator} logged non-skipped meals in this period.`;
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
  setText(breakthroughMessage, "");
  const state = await getJournalState(requestedDayID);

  if (requestID !== journalLoadRequestID || requestedDayID !== journalDayID) {
    return;
  }

  if (!state.available) {
    setJournalFormDisabled(false);
    setText(journalMessage, JOURNAL_UNAVAILABLE_MESSAGE);
    renderBreakthroughs([]);
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
      detail: "",
    },
    ...Object.fromEntries(Array.from(document.querySelectorAll("[data-journal-answer-card]"))
    .map((card) => {
      const selectedChipIDs = Array.from(card.querySelectorAll("[data-journal-chip][aria-pressed='true']"))
        .map((button) => button.dataset.journalChip);

      return [card.dataset.promptId, {
        text: card.querySelector("[data-journal-answer-text]")?.value || "",
        selectedChipIDs,
        detail: card.querySelector("[data-journal-detail-text]")?.value || "",
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

  setJournalFormDisabled(true);
  const saved = await saveCurrentJournalDraft();
  if (!saved) {
    setJournalFormDisabled(false);
    setText(breakthroughMessage, JOURNAL_SAVE_ERROR_MESSAGE);
    return;
  }

  if (!isReadyResult(saved)) {
    setJournalFormDisabled(false);
    setText(breakthroughMessage, JOURNAL_SAVE_ERROR_MESSAGE);
    return;
  }

  const result = await dropBreakthrough(answerID);
  setJournalFormDisabled(false);

  if (!isReadyResult(result)) {
    setText(breakthroughMessage, "Breakthrough could not be removed. Try again.");
    return;
  }

  await loadJournalView();
  setText(breakthroughMessage, DROP_SUCCESS_MESSAGE);
}

async function loadHistoryView() {
  const requestID = historyLoadRequestID + 1;
  historyLoadRequestID = requestID;
  setText(historyStatus, HISTORY_COPY.loading);
  setText(historySaveMessage, "");
  const state = await getHistoryState();

  if (requestID !== historyLoadRequestID) {
    return;
  }

  renderHistoryState(state);
  const sourceDayID = pendingHistorySourceDayID;
  pendingHistorySourceDayID = "";

  if (!state.available) {
    return;
  }

  if (sourceDayID) {
    await loadSelectedHistoryDay(sourceDayID, {
      sourceDay: true,
      focusDetail: true,
    });
    return;
  }

  if (state.days.length === 0) {
    return;
  }

  const selectedDayID = sourceDayID
    || (state.days.some((day) => day.dayID === historySelectedDayID) ? historySelectedDayID : state.days[0].dayID);
  await loadSelectedHistoryDay(selectedDayID, {
    sourceDay: false,
    focusDetail: false,
  });
}

async function loadSelectedHistoryDay(dayID, options = {}) {
  const requestedDayID = String(dayID || "");

  if (!requestedDayID) {
    return;
  }

  const requestID = historyDayLoadRequestID + 1;
  historyDayLoadRequestID = requestID;
  historySelectedDayID = requestedDayID;
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

  if (options.focusDetail) {
    focusHistoryDetail();
  }
}

function renderHistoryState(state) {
  replaceChildren(historyList);
  currentHistoryDayState = null;
  setText(historySaveMessage, "");

  if (!state.available) {
    historyDetail.hidden = true;
    setText(historyStatus, HISTORY_COPY.error);
    return;
  }

  if (!state.days.length) {
    historyDetail.hidden = true;
    renderHistoryEmptyState();
    return;
  }

  setText(historyStatus, state.days.length === 1 ? "1 day with saved entries." : `${state.days.length} days with saved entries.`);

  for (const day of state.days) {
    historyList?.append(renderHistoryDayCard(day));
  }
}

function renderHistoryDayDetail(dayState) {
  currentHistoryDayState = dayState;
  const dayID = dayState.day?.dayID || historySelectedDayID;
  const isEditable = dayState.editStatus === "Editable";
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
  return {
    weight: {
      value: historyDetail?.querySelector("[data-history-weight-input]")?.value || "",
    },
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
    card.querySelector("[data-history-day]")?.setAttribute("aria-current", selected ? "true" : "false");
  });
}

function renderHistoryWeight(weight, isEditable) {
  replaceChildren(historyWeightSection);
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  section.className = "history-detail-section";
  setText(heading, "Weight");
  section.append(heading);

  if (isEditable) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    label.className = "field-label";
    label.setAttribute("for", "history-weight-value");
    setText(label, "Weight");
    input.id = "history-weight-value";
    input.className = "text-field";
    input.type = "number";
    input.inputMode = "decimal";
    input.step = "0.1";
    input.min = "0";
    input.dataset.historyWeightInput = "true";
    input.value = weight?.value == null ? "" : String(weight.value);
    section.append(label, input);
  } else {
    section.append(createValueRow("Weight", weight?.value == null ? HISTORY_COPY.noWeight : String(weight.value)));
  }

  historyWeightSection?.append(section);
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
      createMetricControl(`history-${slot}-hungry`, "Ate when hungry?", meal.ateWhenHungry),
      createMetricControl(`history-${slot}-enough`, "Stopped at enough?", meal.stoppedAtEnough),
    );
  } else {
    body?.append(
      createValueRow("Plan", meal.plannedText || HISTORY_COPY.noPlan),
      createValueRow("Status", mealStatusLabel(meal.logState)),
      createValueRow("Ate when hungry?", metricLabel(meal.ateWhenHungry)),
      createValueRow("Stopped at enough?", metricLabel(meal.stoppedAtEnough)),
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
  fieldset.className = "metric-group";
  setText(legend, legendCopy);
  fieldset.append(legend);

  for (const [answerValue, copy] of [
    [MEAL_ANSWERS.yes, "Yes"],
    [MEAL_ANSWERS.no, "No"],
  ]) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = answerValue;
    input.checked = value === answerValue;
    label.append(input, document.createTextNode(` ${copy}`));
    fieldset.append(label);
  }

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

    if (answer.supportsDetail) {
      body?.append(createTextareaField(`${textID}-detail`, "Optional detail", "historyAnswerDetail", answer.detail || ""));
    }
  } else {
    body?.append(createValueRow("Answer", answer.text || HISTORY_COPY.noReflection));

    if (answer.selectedChips?.length) {
      body?.append(createValueRow("Context", answer.selectedChips.map((chip) => chip.label).join(", ")));
    }

    if (answer.detail) {
      body?.append(createValueRow("Detail", answer.detail));
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
  if (value === MEAL_ANSWERS.yes) {
    return "Yes";
  }

  if (value === MEAL_ANSWERS.no) {
    return "No";
  }

  return "Not logged";
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
  const result = await saveWeight(todayDayID, value, {
    confirmLargeChange: pendingWeightConfirmation?.dayID === todayDayID && pendingWeightConfirmation?.value === value,
  });

  if (!isReadyResult(result)) {
    if (result.status === "NeedsConfirmation") {
      pendingWeightConfirmation = { dayID: todayDayID, value };
      setText(weightMessage, "This is more than 5 pounds different from yesterday. Check for a typo, then tap Save weight again to confirm.");
      return;
    }

    pendingWeightConfirmation = null;
    setText(weightMessage, result.status === "Invalid" ? "Enter a positive weight value before saving." : "Weight could not be saved. Try again.");
    return;
  }

  pendingWeightConfirmation = null;
  renderTodayState(result);
  setText(weightMessage, "Weight saved for today.");
}

async function saveMealFromForm(form) {
  refreshCurrentDayIDs();
  const card = form.closest("[data-meal-card]");
  const message = mealMessageForCard(card);
  const slot = card?.dataset.slot || form.dataset.slot;
  const ateWhenHungry = selectedMetricValue(form, `${slot}-hungry`);
  const stoppedAtEnough = selectedMetricValue(form, `${slot}-enough`);

  if (!ateWhenHungry || !stoppedAtEnough) {
    setText(message, "Choose Yes or No for both answers before saving.");
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

  setText(weightMessage, state.weight?.value == null ? "No weight entered today." : "Weight saved for today.");

  for (const meal of state.meals) {
    renderMeal(meal);
  }

  markTodayFocalState(state);
}

function renderJournalState(state) {
  currentJournalState = state;
  journalDayID = state.day?.dayID || journalDayID;
  setText(journalDay, journalDayID);
  setOutsidePlanChoice(state.outsidePlanAnswer?.text || "");
  renderJournalPrompts(state.prompts, state.answers);
  renderJournalHelper(state);
  renderBreakthroughs(state.breakthroughs);
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
  const detailID = `journal-${prompt.id}-detail`;
  const textArea = card.querySelector("[data-journal-answer-text]");
  const label = card.querySelector("[data-journal-prompt-label]");
  const contextList = card.querySelector("[data-journal-context-list]");
  const contextHeading = card.querySelector("[data-journal-context-heading]");
  const contextItems = card.querySelector("[data-journal-context-items]");
  const chipGroup = card.querySelector("[data-journal-chip-group]");
  const chipList = card.querySelector("[data-journal-chip-list]");
  const detailLabel = card.querySelector("[data-journal-detail-label]");
  const detailText = card.querySelector("[data-journal-detail-text]");
  const stateNode = card.querySelector("[data-breakthrough-state]");
  const button = card.querySelector("[data-toggle-breakthrough]");
  const breakthroughState = answer?.breakthroughState || BREAKTHROUGH_STATES.none;

  card.dataset.promptId = prompt.id;
  card.dataset.answerId = answer?.id || "";
  card.dataset.breakthroughState = breakthroughState;
  setText(label, prompt.text);
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

  if (prompt.supportsDetail) {
    detailLabel.hidden = false;
    detailText.hidden = false;
    detailLabel.setAttribute("for", detailID);
    detailText.id = detailID;
    detailText.value = answer?.detail || "";
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
  const value = form?.querySelector(`[name="${name}"]:checked`)?.value;
  return value === MEAL_ANSWERS.yes || value === MEAL_ANSWERS.no ? value : null;
}

function setMetricValue(form, name, value) {
  form?.querySelectorAll(`[name="${name}"]`).forEach((input) => {
    input.checked = input.value === value;
  });
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
  document.querySelector(".tracking-panel")?.classList.toggle("is-focal", state.weight?.value == null);

  let focalMealSlot = null;
  if (state.weight?.value != null) {
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

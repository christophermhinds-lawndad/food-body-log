import { createAppPaths } from "./paths.js";
import { readSetupStatus, writeSetupStatus } from "./storage.js";
import { renderStatusRows, setStatusText, setText } from "./dom.js";
import { CHECKING_STATUS_ROWS, collectInstallStatus } from "./install-status.js?v=5";
import { getTodayDayID, getTomorrowDayID } from "./day-policy.js";
import { MEAL_ANSWERS, MEAL_STATES } from "./tracking-model.js?v=3";
import { getPlanState, getPlanSuggestions, getTodayTrackingState, saveMealLog, savePlan, saveWeight, skipMeal, unskipMeal } from "./today-tracking.js?v=4";
import { createPlanSuggestionController } from "./plan-suggestions-ui.js?v=4";
import { JOURNAL_CHIPS, BREAKTHROUGH_STATES, OUTSIDE_PLAN_PROMPT_ID, promptsForMeals } from "./journal-model.js?v=2";
import { getJournalState, saveReflection, setAnswerBreakthrough, dropBreakthrough } from "./journal-tracking.js?v=2";

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
const SUGGESTION_ERROR_MESSAGE = "Suggestions could not be loaded. You can keep typing.";
const JOURNAL_LOAD_MESSAGE = "Loading evening reflection...";
const JOURNAL_UNAVAILABLE_MESSAGE = "Evening reflection could not be loaded. Reopen the app and try again.";
const JOURNAL_SAVE_ERROR_MESSAGE = "Reflection could not be saved. Try again; data already saved on this device stays local.";
const NO_EXTRA_PROMPTS_MESSAGE = "Nothing extra to reflect on from today's meal answers. You can still write anything that feels useful.";
const MISSING_MEAL_DATA_MESSAGE = "Not all meals are logged yet. That is okay; only logged non-skipped No answers add extra prompts.";
const SOURCE_DAY_MESSAGE = "Source-day navigation will open this day when History is available.";
const DROP_SUCCESS_MESSAGE = "Breakthrough removed. The original answer stayed saved.";
let todayDayID = getTodayDayID();
let planDayID = getTomorrowDayID();
let journalDayID = todayDayID;
let journalLoadRequestID = 0;
let currentJournalState = null;
let pendingWeightConfirmation = null;
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
    showSourceDayMessage(sourceButton);
  }

  if (dropButton) {
    dropSelectedBreakthrough(dropButton);
  }
});

registerServiceWorker();
readStoredStatus();
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

  if (tabName === "journal") {
    loadJournalView();
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

function showSourceDayMessage(button) {
  const card = button.closest("[data-breakthrough-card]");
  const dayID = card?.dataset.dayId || journalDayID;
  setText(breakthroughMessage, `${SOURCE_DAY_MESSAGE} Source day: ${dayID}.`);
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

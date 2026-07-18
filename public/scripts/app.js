import { createAppPaths } from "./paths.js";
import { readSetupStatus, writeSetupStatus } from "./storage.js";
import { renderStatusRows, setStatusText, setText } from "./dom.js";
import { CHECKING_STATUS_ROWS, collectInstallStatus } from "./install-status.js?v=3";
import { getTodayDayID, getTomorrowDayID } from "./day-policy.js";
import { MEAL_ANSWERS, MEAL_STATES } from "./tracking-model.js?v=3";
import { getPlanState, getPlanSuggestions, getTodayTrackingState, saveMealLog, savePlan, saveWeight, skipMeal, unskipMeal } from "./today-tracking.js?v=3";

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
let todayDayID = getTodayDayID();
let planDayID = getTomorrowDayID();
let planSuggestionRequestID = 0;

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

document.querySelectorAll("[name='plan-day']").forEach((control) => {
  control.addEventListener("change", () => {
    planDayID = selectedPlanDayID();
    hideAllPlanSuggestions();
    loadPlanView();
  });
});

document.querySelectorAll("[data-plan-slot]").forEach((input) => {
  input.addEventListener("input", () => updatePlanSuggestions(input));
  input.addEventListener("focus", () => updatePlanSuggestions(input));
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
  hideAllPlanSuggestions();
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
  hideAllPlanSuggestions();
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

async function updatePlanSuggestions(input) {
  const slot = input?.dataset.planSlot;
  const query = input?.value || "";
  const requestedDayID = planDayID;
  const requestID = ++planSuggestionRequestID;

  if (!slot || !query.trim()) {
    hidePlanSuggestions(input);
    return;
  }

  const result = await getPlanSuggestions(query);

  if (requestID !== planSuggestionRequestID || requestedDayID !== planDayID || document.activeElement !== input) {
    return;
  }

  if (!isReadyResult(result)) {
    hidePlanSuggestions(input);
    return;
  }

  renderPlanSuggestions(input, result.suggestions);
}

function renderPlanSuggestions(input, suggestions) {
  const list = planSuggestionList(input);

  if (!list || !Array.isArray(suggestions) || suggestions.length === 0) {
    hidePlanSuggestions(input);
    return;
  }

  hideAllPlanSuggestions(input);
  list.replaceChildren();
  for (const suggestion of suggestions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plan-suggestion-option";
    setText(button, suggestion);
    button.addEventListener("click", () => applyPlanSuggestion(input, suggestion));
    list.append(button);
  }

  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function hidePlanSuggestions(inputOrSlot) {
  const list = planSuggestionList(inputOrSlot);
  const input = typeof inputOrSlot === "string"
    ? document.querySelector(`[data-plan-slot="${inputOrSlot}"]`)
    : inputOrSlot;

  if (list) {
    list.replaceChildren();
    list.hidden = true;
  }

  input?.setAttribute("aria-expanded", "false");
}

function hideAllPlanSuggestions(exceptInput = null) {
  document.querySelectorAll("[data-plan-suggestions]").forEach((list) => {
    if (exceptInput?.dataset.planSlot === list.dataset.planSuggestions) {
      return;
    }

    hidePlanSuggestions(list.dataset.planSuggestions);
  });
}

function applyPlanSuggestion(input, suggestionText) {
  if (!input?.isConnected) {
    return;
  }

  input.value = suggestionText;
  hidePlanSuggestions(input);
  input.focus({ preventScroll: true });
}

function planSuggestionList(inputOrSlot) {
  const slot = typeof inputOrSlot === "string" ? inputOrSlot : inputOrSlot?.dataset.planSlot;
  return slot ? document.querySelector(`[data-plan-suggestions="${slot}"]`) : null;
}

async function saveTodayWeight() {
  refreshCurrentDayIDs();
  const result = await saveWeight(todayDayID, weightInput?.value || "");

  if (!isReadyResult(result)) {
    setText(weightMessage, result.status === "Invalid" ? "Enter a positive weight value before saving." : "Weight could not be saved. Try again.");
    return;
  }

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

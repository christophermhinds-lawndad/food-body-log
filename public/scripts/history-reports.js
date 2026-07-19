import { getLocalDayID, isEditableDay } from "./day-policy.js";
import {
  MEAL_ANSWERS,
  MEAL_SLOTS,
  MEAL_STATES,
  applyLoggedMeal,
  applySkippedMeal,
  applyUnskippedMeal,
  createDefaultMeal,
  getSlot,
  mealID,
  normalizePlannedText,
  normalizeWeightValue,
} from "./tracking-model.js?v=3";
import { BREAKTHROUGH_STATES, JOURNAL_PROMPTS, createJournalAnswerRecord } from "./journal-model.js?v=2";
import { openAppDb } from "./storage.js";

const DAYS_STORE = "days";
const MEALS_STORE = "meals";
const WEIGHTS_STORE = "weights";
const JOURNAL_ANSWERS_STORE = "journalAnswers";
const WEIGHT_WINDOWS = Object.freeze([7, 30, 90]);
const REPORT_MEAL_WINDOW_DAYS = 7;
const LARGE_WEIGHT_CHANGE_THRESHOLD = 5;
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  days: [],
  day: null,
  meals: [],
  weight: null,
  answers: [],
  breakthroughs: [],
  weightAverages: [],
  mealMetrics: [],
});

export async function getHistoryState(options = {}) {
  return withDb(async (db) => {
    const [days, meals, weights, answers] = await Promise.all([
      getAllRecords(db, DAYS_STORE),
      getAllRecords(db, MEALS_STORE),
      getAllRecords(db, WEIGHTS_STORE),
      getAllRecords(db, JOURNAL_ANSWERS_STORE),
    ]);
    const todayID = getLocalDayID(options.now || new Date());
    const dayIDs = new Set([
      ...days.map((day) => day.dayID),
      ...meals.map((meal) => meal.dayID),
      ...weights.map((weight) => weight.dayID),
      ...answers.map((answer) => answer.dayID),
    ]);
    const summaries = Array.from(dayIDs)
      .filter((dayID) => dayID && dayID < todayID)
      .map((dayID) => summarizeHistoryDay(dayID, {
        day: days.find((record) => record.dayID === dayID) || null,
        meals: meals.filter((meal) => meal.dayID === dayID),
        weight: weights.find((weight) => weight.dayID === dayID) || null,
        answers: answers.filter((answer) => answer.dayID === dayID),
      }, options))
      .filter(isHistoryListableDay)
      .sort((left, right) => right.dayID.localeCompare(left.dayID));

    return {
      status: "Ready",
      days: summaries,
    };
  });
}

export async function getHistoryDay(dayID, options = {}) {
  return withDb(async (db) => {
    const [day, meals, weight, answers] = await Promise.all([
      getRecord(db, DAYS_STORE, dayID),
      getMealsByDay(db, dayID),
      getRecord(db, WEIGHTS_STORE, dayID),
      getAnswersByDay(db, dayID),
    ]);
    const sortedAnswers = sortAnswers(answers);
    const editStatus = editStatusFor(dayID, options);

    return {
      status: "Ready",
      editStatus,
      day: day || { dayID },
      meals: displayMeals(dayID, meals, options),
      weight: weight || null,
      answers: sortedAnswers,
      breakthroughs: sortedAnswers.filter((answer) => answer.breakthroughState === BREAKTHROUGH_STATES.marked),
    };
  });
}

export async function saveHistoryDay(dayID, draft = {}, options = {}) {
  if (!isEditableDay(dayID, options)) {
    return {
      available: true,
      status: "ReadOnly",
      day: { dayID },
      meals: [],
      weight: null,
      answers: [],
      breakthroughs: [],
      error: {
        code: "day-read-only",
        dayID,
      },
    };
  }

  return withDb(async (db) => {
    const existingWeight = await getRecord(db, WEIGHTS_STORE, dayID);
    const requestedWeight = hasOwn(draft, "weight") ? normalizeWeightValue(draft.weight?.value) : null;

    if (hasOwn(draft, "weight") && requestedWeight == null) {
      return historyError(db, dayID, "Invalid", {
        code: "invalid-weight",
        dayID,
      }, options);
    }

    if (hasOwn(draft, "weight")) {
      const priorWeight = await getPriorWeight(db, dayID);
      const difference = priorWeight?.value == null ? 0 : Math.abs(requestedWeight - priorWeight.value);

      if (difference > LARGE_WEIGHT_CHANGE_THRESHOLD && options.confirmLargeChange !== true) {
        const currentDay = await getHistoryDayFromDb(db, dayID, options);

        return {
          ...currentDay,
          status: "NeedsConfirmation",
          warning: {
            code: "possible-weight-typo",
            dayID,
            priorDayID: priorWeight.dayID,
            priorValue: priorWeight.value,
            value: requestedWeight,
            difference,
          },
        };
      }
    }

    const updates = await buildHistoryUpdates(db, dayID, draft, options, existingWeight, requestedWeight);

    try {
      await putUpdates(db, updates);
    } catch {
      return historyError(db, dayID, "Error", {
        code: "history-save-failed",
        dayID,
      }, options);
    }

    return getHistoryDayFromDb(db, dayID, options);
  });
}

export async function getReportsState(options = {}) {
  return withDb(async (db) => {
    const [weights, meals] = await Promise.all([
      getAllRecords(db, WEIGHTS_STORE),
      getAllRecords(db, MEALS_STORE),
    ]);

    return {
      status: "Ready",
      weightAverages: summarizeWeightAverages(weights, options),
      mealMetrics: [
        summarizeMealMetric(meals, "ateWhenHungry", options),
        summarizeMealMetric(meals, "stoppedAtEnough", options),
      ],
    };
  });
}

export function summarizeWeightAverages(weights, options = {}) {
  return WEIGHT_WINDOWS.map((windowDays) => {
    const windowWeights = filterRecordsInTrailingWindow(weights, windowDays, options)
      .map((weight) => normalizeWeightValue(weight?.value))
      .filter((value) => value != null);
    const average = windowWeights.length > 0
      ? roundOneDecimal(windowWeights.reduce((sum, value) => sum + value, 0) / windowWeights.length)
      : null;

    return {
      windowDays,
      periodLabel: `Trailing ${windowDays} days`,
      state: windowWeights.length > 0 ? "Ready" : "NoData",
      count: windowWeights.length,
      average,
      formattedAverage: formatWeightAverage(average),
    };
  });
}

export function summarizeMealMetric(meals, metricName, options = {}) {
  const usableMeals = filterRecordsInTrailingWindow(meals, options.windowDays || REPORT_MEAL_WINDOW_DAYS, options)
    .filter((meal) => meal?.logState === MEAL_STATES.logged)
    .filter((meal) => meal?.[metricName] === MEAL_ANSWERS.yes || meal?.[metricName] === MEAL_ANSWERS.no);
  const yesCount = usableMeals.filter((meal) => meal[metricName] === MEAL_ANSWERS.yes).length;
  const denominator = usableMeals.length;
  const state = denominator === 0 ? "NoData" : (denominator === 1 ? "Insufficient" : "Ready");

  return {
    metricName,
    label: metricName === "stoppedAtEnough" ? "Stopped at enough" : "Ate when hungry",
    windowDays: options.windowDays || REPORT_MEAL_WINDOW_DAYS,
    periodLabel: `Trailing ${options.windowDays || REPORT_MEAL_WINDOW_DAYS} days`,
    state,
    yesCount,
    denominator,
    percentage: state === "Ready" ? Math.round((yesCount / denominator) * 100) : null,
  };
}

export function isHistoryListableDay(summary) {
  return Boolean(summary?.content?.hasMeals
    || summary?.content?.hasWeight
    || summary?.content?.hasReflection
    || summary?.content?.hasBreakthroughs);
}

export function formatWeightAverage(value) {
  if (value == null) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

async function withDb(callback, unavailableExtras = {}) {
  try {
    const db = await openAppDb();

    if (!db) {
      return { ...UNAVAILABLE, ...unavailableExtras };
    }

    try {
      return {
        available: true,
        ...(await callback(db)),
      };
    } finally {
      db.close?.();
    }
  } catch {
    return { ...UNAVAILABLE, ...unavailableExtras };
  }
}

async function getHistoryDayFromDb(db, dayID, options = {}) {
  const [day, meals, weight, answers] = await Promise.all([
    getRecord(db, DAYS_STORE, dayID),
    getMealsByDay(db, dayID),
    getRecord(db, WEIGHTS_STORE, dayID),
    getAnswersByDay(db, dayID),
  ]);
  const sortedAnswers = sortAnswers(answers);

  return {
    status: "Ready",
    editStatus: editStatusFor(dayID, options),
    day: day || { dayID },
    meals: displayMeals(dayID, meals, options),
    weight: weight || null,
    answers: sortedAnswers,
    breakthroughs: sortedAnswers.filter((answer) => answer.breakthroughState === BREAKTHROUGH_STATES.marked),
  };
}

async function historyError(db, dayID, status, error, options = {}) {
  const state = await getHistoryDayFromDb(db, dayID, options);

  return {
    ...state,
    status,
    error,
  };
}

async function buildHistoryUpdates(db, dayID, draft, options, existingWeight, requestedWeight) {
  const updates = [];

  if (hasOwn(draft, "meals")) {
    const existingMeals = await getMealsByDay(db, dayID);
    const bySlot = new Map(existingMeals.map((meal) => [meal.slot, meal]));

    for (const [slotID, mealDraft] of Object.entries(draft.meals || {})) {
      const slot = getSlot(slotID);
      const existing = bySlot.get(slot.id) || createDefaultMeal(dayID, slot, options);
      updates.push({
        storeName: MEALS_STORE,
        record: applyMealDraft(existing, mealDraft, options),
      });
    }
  }

  if (hasOwn(draft, "weight")) {
    updates.push({
      storeName: WEIGHTS_STORE,
      record: {
        ...(existingWeight || {}),
        dayID,
        value: requestedWeight,
        updatedAt: nowIso(options),
      },
    });
  }

  if (hasOwn(draft, "answers")) {
    const existingAnswers = await getAnswersByDay(db, dayID);
    const existingByPrompt = new Map(existingAnswers.map((answer) => [answer.promptID, answer]));

    for (const [promptID, answerDraft] of Object.entries(draft.answers || {})) {
      const existing = existingByPrompt.get(promptID) || null;
      updates.push({
        storeName: JOURNAL_ANSWERS_STORE,
        record: createJournalAnswerRecord(dayID, getPromptSnapshot(promptID), answerDraft, existing, options),
      });
    }
  }

  return updates;
}

function applyMealDraft(existing, mealDraft = {}, options = {}) {
  let updated = {
    ...existing,
    plannedText: hasOwn(mealDraft, "plannedText") ? normalizePlannedText(mealDraft.plannedText) : existing.plannedText,
    updatedAt: nowIso(options),
  };

  if (mealDraft.logState === MEAL_STATES.skipped) {
    updated = applySkippedMeal(updated, options.now || new Date());
  } else if (mealDraft.logState === MEAL_STATES.notLogged) {
    updated = applyUnskippedMeal(updated, options.now || new Date());
  } else if (mealDraft.logState === MEAL_STATES.logged) {
    updated = applyLoggedMeal(updated, {
      ateWhenHungry: mealDraft.ateWhenHungry,
      stoppedAtEnough: mealDraft.stoppedAtEnough,
      now: options.now || new Date(),
    });
  }

  return updated;
}

function putUpdates(db, updates) {
  if (updates.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const storeNames = Array.from(new Set(updates.map((update) => update.storeName)));
    const transaction = db.transaction(storeNames, "readwrite");
    let requestError = null;

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(requestError || transaction.error);
    transaction.onabort = () => reject(requestError || transaction.error);

    try {
      for (const update of updates) {
        const request = transaction.objectStore(update.storeName).put(update.record);
        request.onerror = () => {
          requestError = request.error;
        };
      }
    } catch (error) {
      reject(error);
    }
  });
}

function displayMeals(dayID, meals, options = {}) {
  const bySlot = new Map(meals.map((meal) => [meal.slot, meal]));

  return MEAL_SLOTS.map((slot) => {
    const existing = bySlot.get(slot.id);

    return existing
      ? { ...existing, saved: true }
      : { ...createDefaultMeal(dayID, slot, options), saved: false };
  });
}

function summarizeHistoryDay(dayID, records, options = {}) {
  const answers = records.answers || [];

  return {
    dayID,
    day: records.day || { dayID },
    editStatus: editStatusFor(dayID, options),
    content: {
      hasMeals: (records.meals || []).some(hasSavedMealContent),
      hasWeight: normalizeWeightValue(records.weight?.value) != null,
      hasReflection: answers.some(hasSavedAnswerContent),
      hasBreakthroughs: answers.some((answer) => answer.breakthroughState
        && answer.breakthroughState !== BREAKTHROUGH_STATES.none),
    },
  };
}

function hasSavedMealContent(meal) {
  return normalizePlannedText(meal?.plannedText) !== ""
    || meal?.logState === MEAL_STATES.logged
    || meal?.logState === MEAL_STATES.skipped;
}

function hasSavedAnswerContent(answer) {
  return normalizeText(answer?.text) !== ""
    || normalizeText(answer?.detail) !== ""
    || (Array.isArray(answer?.selectedChips) && answer.selectedChips.length > 0);
}

function filterRecordsInTrailingWindow(records, windowDays, options = {}) {
  const endDayID = getLocalDayID(options.now || new Date());
  const startDayID = addDays(endDayID, -windowDays + 1);

  return (Array.isArray(records) ? records : []).filter((record) => {
    const dayID = record?.dayID;
    return dayID >= startDayID && dayID <= endDayID;
  });
}

function getPriorWeight(db, dayID) {
  return getRecord(db, WEIGHTS_STORE, addDays(dayID, -1));
}

function addDays(dayID, offset) {
  const [year, month, day] = String(dayID).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);

  return getLocalDayID(date);
}

function editStatusFor(dayID, options = {}) {
  return isEditableDay(dayID, options) ? "Editable" : "ReadOnly";
}

function sortAnswers(answers) {
  const promptOrder = new Map(JOURNAL_PROMPTS.map((prompt, index) => [prompt.id, index]));

  return [...answers].sort((left, right) => {
    const leftOrder = promptOrder.has(left.promptID) ? promptOrder.get(left.promptID) : Number.MAX_SAFE_INTEGER;
    const rightOrder = promptOrder.has(right.promptID) ? promptOrder.get(right.promptID) : Number.MAX_SAFE_INTEGER;

    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });
}

function getPromptSnapshot(promptID) {
  return JOURNAL_PROMPTS.find((prompt) => prompt.id === promptID)
    || {
      id: promptID,
      text: `History note: ${promptID}`,
      supportsChips: true,
      supportsDetail: true,
    };
}

function getRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function getAllRecords(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();

    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
  });
}

function getMealsByDay(db, dayID) {
  return getRecordsByDay(db, MEALS_STORE, dayID, sortMeals);
}

function getAnswersByDay(db, dayID) {
  return getRecordsByDay(db, JOURNAL_ANSWERS_STORE, dayID, sortAnswers);
}

function getRecordsByDay(db, storeName, dayID, sortRecords) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(storeName, "readonly").objectStore(storeName);
    const request = typeof store.index === "function"
      ? store.index("byDay").getAll(dayID)
      : store.getAll();

    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      resolve(sortRecords(records.filter((record) => record.dayID === dayID)));
    };
    request.onerror = () => reject(request.error);
  });
}

function sortMeals(meals) {
  const order = new Map(MEAL_SLOTS.map((slot, index) => [slot.id, index]));

  return [...meals].sort((left, right) => order.get(left.slot) - order.get(right.slot));
}

function roundOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value || {}, key);
}

function nowIso(options = {}) {
  const now = options.now || new Date();
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

import { getLocalDayID, isEditableDay } from "./day-policy.js";
import {
  MEAL_SLOTS,
  MEAL_STATES,
  MEAL_LEVELS,
  applyLoggedMeal,
  applySkippedMeal,
  applyUnskippedMeal,
  createDefaultMeal,
  getSlot,
  isMealLevelAnswered,
  mealLevelLabel,
  mealID,
  normalizeMealLevel,
  normalizePlannedText,
  normalizeWaistValue,
  normalizeWeightValue,
} from "./tracking-model.js?v=5";
import { BREAKTHROUGH_STATES, JOURNAL_PROMPTS, createJournalAnswerRecord } from "./journal-model.js?v=4";
import { openAppDb } from "./storage.js";

const DAYS_STORE = "days";
const MEALS_STORE = "meals";
const WEIGHTS_STORE = "weights";
const JOURNAL_ANSWERS_STORE = "journalAnswers";
const WEIGHT_AVERAGE_TILE_DEFS = Object.freeze([
  {
    id: "current7",
    periodLabel: "Current 7 day average",
    kind: "trailing",
    windowDays: 7,
    displayWhenNotEnoughData: true,
  },
  {
    id: "previous7",
    periodLabel: "Previous 7 day average",
    kind: "previousTrailing",
    windowDays: 7,
    displayWhenNotEnoughData: true,
  },
  {
    id: "trailing30",
    periodLabel: "Average 30 days ago",
    kind: "snapshot",
    windowDays: 7,
    startOffsetDays: -30,
    endOffsetDays: -24,
  },
  {
    id: "trailing90",
    periodLabel: "Average 90 days ago",
    kind: "snapshot",
    windowDays: 7,
    startOffsetDays: -90,
    endOffsetDays: -84,
  },
]);
const REPORT_MEAL_WINDOW_DAYS = 7;
const LARGE_WEIGHT_CHANGE_THRESHOLD = 5;
const WAIST_DISPLAY_ENTRY_LIMIT = 6;
const WAIST_AXIS_MIN = 24;
const WAIST_AXIS_MAX = 72;
const WAIST_TREND_THRESHOLD = 0.5;
const WEIGHT_STATUS_THRESHOLDS = Object.freeze({
  prior7: {
    sustainableMin: 0.25,
    sustainableMax: 1,
    fastLoss: 1.25,
    meaningfulGain: 0.75,
    strongGain: 1.5,
  },
  trailing30: {
    sustainableMin: 1,
    sustainableMax: 3.5,
    fastLoss: 4,
    meaningfulGain: 2,
    strongGain: 3,
  },
  trailing90: {
    sustainableMin: 3,
    sustainableMax: 7,
    fastLoss: 8,
    meaningfulGain: 4,
    strongGain: 6,
  },
});
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  days: [],
  day: null,
  meals: [],
  weight: null,
  answers: [],
  breakthroughs: [],
  waistTrend: null,
  weightAverages: [],
  weightSummary: null,
  mealMetrics: [],
});

export const HISTORY_COPY = Object.freeze({
  title: "History",
  loading: "Loading history...",
  emptyHeading: "No history yet",
  emptyBody: "Daily entries will appear here after you save meals, weight, or reflection.",
  error: "History could not be loaded. Reopen the app and try again. Data already saved on this device stays local.",
  editableBadge: "Editable",
  readOnlyBadge: "Read-only",
  readOnlyExplanation: "This day is outside the 72-hour edit window, so it is shown as a saved record.",
  editableExplanation: "This day is still inside the 72-hour edit window.",
  saveAction: "Save day",
  saveSuccess: "Day saved.",
  saveError: "Day could not be saved. Try again.",
  noPlan: "No plan entered",
  noWeight: "No weight entered",
  noReflection: "No reflection saved",
  noBreakthroughs: "No breakthroughs marked for this day",
  sourceDayOpened: "Opened source day in History.",
});

export const REPORTS_COPY = Object.freeze({
  title: "Reports",
  intro: "Numeric summaries use only saved local entries. Sparse periods show when there is not enough data.",
  loading: "Loading reports...",
  error: "Reports could not be loaded. Reopen the app and try again. Data already saved on this device stays local.",
  weightHeading: "Weight averages",
  weightSevenDays: "Current 7 day average",
  weightPreviousSevenDays: "Previous 7 day average",
  weightThirtyDays: "Average 30 days ago",
  weightNinetyDays: "Average 90 days ago",
  weightDenominator: "Based on {count} weight entry/entries in this period.",
  weightNoData: "No weight data for this period.",
  weightNotEnoughData: "Not Enough Data Yet",
  weightSummaryNoData: "Add a weight entry to begin weight summaries.",
  weightSummaryCollectingData: "Keep collecting data. The app will begin to provide guidance based on your trends once you have logged consistently for 30 days. You can still review your numbers below.",
  weightSummaryPriorNoData: "Not enough data yet to compare your current trailing 7 day average with the prior trailing 7 day average.",
  weightSummaryLongWindowNoData: "Not enough data yet to compare your current trailing 7 day average with 30 and 90 day snapshots.",
  weightReflect: "You are currently gaining weight. Spend time reflecting on your recent statistics around hunger and satiety and review recent food choices. Could you be waiting until you are hungrier to eat a meal? Are you often eating past neutral or moderate satiety? Are you eating a lot of ultra-processed foods? Or are you often eating food outside your plan?",
  weightProgressing: "You are currently losing weight at a sustainable rate. Keep up the good work!",
  weightConsiderMore: "Consider eating slightly more, you may be losing weight at an unsustainable rate. Weight loss that is too rapid can trigger metabolic and hunger regulation issues in some people.",
  weightStable: "You are currently maintaining your weight. Unless you are at your target weight, slight adjustments around hunger, satiety, and meal planning will be necessary to move the needle. Review your statistics and work on optimizing your current habits.",
  weightGainWaistDown: "You are currently gaining weight. However, your waist size is decreasing. It is possible that you are losing fat while also gaining muscle mass, which is a very good thing. Keep up the good work.",
  weightLossWaistUp: "You are currently losing weight. However, your waist size is increasing. It is possible that your scale is malfunctioning, or you are not tracking weight in a consistent manner (e.g. first thing in the morning daily, with no clothes on). Review your statistics and work on optimizing your current habits.",
  weightStableWaistUp: "You are currently maintaining your weight. However, your waist size is increasing. It is possible that your scale is malfunctioning, or you are not tracking weight in a consistent manner (e.g. first thing in the morning daily, with no clothes on). Review your statistics and work on optimizing your current habits.",
  waistHeading: "Waist trend",
  waistLabel: "Latest waist measurements",
  waistNoData: "No waist measurements yet.",
  waistOneEntry: "One waist measurement saved. Add more measurements to see a waist trend.",
  waistTrendSummary: "Waist changed by {delta} inches across the displayed entries.",
  mealHeading: "Meal metrics",
  mealSevenDays: "Trailing 7 days",
  hungryLabel: "Hunger Level",
  enoughLabel: "Satiety Level",
  mealDenominator: "Average rating of {average}, across {denominator} logged meal/meals.",
  mealNoData: "No logged meal levels for this period.",
  mealInsufficient: "Not enough logged data yet. Logged meal levels will count here.",
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
  return withDb(async (db) => {
    if (!isEditableDay(dayID, options)) {
      return {
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

    const existingWeight = await getRecord(db, WEIGHTS_STORE, dayID);
    const requestedWeight = hasOwn(draft, "weight") ? normalizeWeightValue(draft.weight?.value) : null;
    const requestedWaist = hasOwn(draft, "weight") ? normalizeWaistValue(draft.weight?.waist) : null;

    if (hasOwn(draft, "weight") && requestedWeight == null && requestedWaist == null) {
      return historyError(db, dayID, "Invalid", {
        code: "invalid-measurements",
        dayID,
      }, options);
    }

    if (hasOwn(draft, "weight") && requestedWeight != null) {
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

    const updates = await buildHistoryUpdates(db, dayID, draft, options, existingWeight, requestedWeight, requestedWaist);

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
      weightSummary: summarizeWeightChange(weights, options),
      waistTrend: summarizeWaistTrend(weights, options),
      mealMetrics: [
        summarizeMealMetric(meals, "ateWhenHungry", options),
        summarizeMealMetric(meals, "stoppedAtEnough", options),
      ],
    };
  });
}

export function summarizeWeightAverages(weights, options = {}) {
  return WEIGHT_AVERAGE_TILE_DEFS.map((tileDef) => {
    const summary = averageForWeightTile(weights, tileDef, options);

    return {
      id: tileDef.id,
      windowDays: tileDef.windowDays,
      periodLabel: tileDef.periodLabel,
      state: summary.state,
      count: summary.count,
      average: summary.average,
      formattedAverage: formatWeightAverage(summary.average),
      display: tileDef.displayWhenNotEnoughData || summary.state === "Ready",
    };
  });
}

export function summarizeWeightChange(weights, options = {}) {
  const validWeights = validWeightRecords(weights);
  const current7 = averageForTrailingWindow(weights, 7, options);
  const todayID = getLocalDayID(options.now || new Date());
  const prior7 = averageForDayRange(validWeights, addDays(todayID, -13), addDays(todayID, -7));
  const snapshot30 = averageForDayRange(validWeights, addDays(todayID, -30), addDays(todayID, -24));
  const snapshot90 = averageForDayRange(validWeights, addDays(todayID, -90), addDays(todayID, -84));
  const waistTrend = summarizeWaistTrend(weights, options);

  if (current7.state !== "Ready") {
    return {
      status: "NoData",
      notice: createWeightNotice("NoData", validWeights.length < 30 ? REPORTS_COPY.weightSummaryCollectingData : REPORTS_COPY.weightSummaryNoData),
      lines: [REPORTS_COPY.weightSummaryNoData],
      comparisons: [],
    };
  }

  const priorComparison = createWeightComparison("prior7", current7.average, prior7.average);
  const trailing30Comparison = createWeightComparison("trailing30", current7.average, snapshot30.average);
  const trailing90Comparison = createWeightComparison("trailing90", current7.average, snapshot90.average);
  const comparisons = [priorComparison, trailing30Comparison, trailing90Comparison].filter(Boolean);
  const lines = [
    priorComparison
      ? `Your current trailing 7 day average is ${comparisonPhrase(priorComparison)} your 7 day trailing average from a week ago by ${formatSignedMagnitude(priorComparison.delta)} pounds, ${formatPercent(priorComparison.percent)}% of mass.`
      : REPORTS_COPY.weightSummaryPriorNoData,
    trailing30Comparison && trailing90Comparison
      ? `The current trailing 7 day average is ${comparisonDirectionText(trailing30Comparison)} by ${formatSignedMagnitude(trailing30Comparison.delta)} pounds, ${formatPercent(trailing30Comparison.percent)}% of total mass, compared to the average 30 days ago, and ${comparisonDirectionText(trailing90Comparison)} by ${formatSignedMagnitude(trailing90Comparison.delta)} pounds, ${formatPercent(trailing90Comparison.percent)}% of total mass, compared to the average 90 days ago.`
      : REPORTS_COPY.weightSummaryLongWindowNoData,
  ];
  const hasMinimumGuidanceHistory = validWeights.length >= 30;

  return {
    status: "Ready",
    notice: hasMinimumGuidanceHistory
      ? weightNoticeForComparisons(comparisons, waistTrend)
      : createWeightNotice("CollectingData", REPORTS_COPY.weightSummaryCollectingData),
    lines,
    comparisons,
  };
}

export function summarizeMealMetric(meals, metricName, options = {}) {
  const usableMeals = filterRecordsInTrailingWindow(meals, options.windowDays || REPORT_MEAL_WINDOW_DAYS, options)
    .filter((meal) => meal?.logState === MEAL_STATES.logged)
    .map((meal) => normalizeMealLevel(meal?.[metricName]))
    .filter(isMealLevelAnswered);
  const denominator = usableMeals.length;
  const average = denominator > 0
    ? roundOneDecimal(usableMeals.reduce((sum, value) => sum + value, 0) / denominator)
    : null;
  const state = denominator === 0 ? "NoData" : "Ready";

  return {
    kind: "mealLevel",
    metricName,
    label: metricName === "stoppedAtEnough" ? REPORTS_COPY.enoughLabel : REPORTS_COPY.hungryLabel,
    windowDays: options.windowDays || REPORT_MEAL_WINDOW_DAYS,
    periodLabel: `Trailing ${options.windowDays || REPORT_MEAL_WINDOW_DAYS} days`,
    state,
    denominator,
    average,
    formattedAverage: formatWeightAverage(average),
    qualitativeText: qualitativeMealMetricText(metricName, average),
    averageSummary: mealMetricAverageSummary(average, denominator),
  };
}

export function summarizeWaistTrend(weights, options = {}) {
  const entries = validWaistRecords(weights)
    .sort((left, right) => left.dayID.localeCompare(right.dayID))
    .slice(-WAIST_DISPLAY_ENTRY_LIMIT);

  if (entries.length === 0) {
    return {
      status: "NoData",
      entries: [],
      entryCount: 0,
      direction: "stable",
      delta: null,
      formattedDelta: "",
      axisMin: WAIST_AXIS_MIN,
      axisMax: WAIST_AXIS_MAX,
      summaryText: REPORTS_COPY.waistNoData,
    };
  }

  const values = entries.map((entry) => entry.value);
  const delta = entries.length > 1 ? roundOneDecimal(entries.at(-1).value - entries[0].value) : null;
  const direction = delta == null || Math.abs(delta) < WAIST_TREND_THRESHOLD
    ? "stable"
    : delta > 0 ? "increasing" : "decreasing";
  const axisMin = Math.min(WAIST_AXIS_MIN, ...values);
  const axisMax = Math.max(WAIST_AXIS_MAX, ...values);
  const summaryText = entries.length === 1
    ? REPORTS_COPY.waistOneEntry
    : REPORTS_COPY.waistTrendSummary.replace("{delta}", formatSignedMagnitude(delta));

  return {
    status: "Ready",
    entries,
    entryCount: entries.length,
    direction,
    delta,
    formattedDelta: delta == null ? "" : formatWeightAverage(delta),
    axisMin,
    axisMax,
    summaryText,
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

async function buildHistoryUpdates(db, dayID, draft, options, existingWeight, requestedWeight, requestedWaist) {
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
        waist: requestedWaist,
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
      hasWeight: normalizeWeightValue(records.weight?.value) != null || normalizeWaistValue(records.weight?.waist) != null,
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

  return filterRecordsInDayRange(records, startDayID, endDayID);
}

function filterRecordsInDayRange(records, startDayID, endDayID) {
  return (Array.isArray(records) ? records : []).filter((record) => {
    const dayID = record?.dayID;
    return dayID >= startDayID && dayID <= endDayID;
  });
}

function averageForTrailingWindow(weights, windowDays, options = {}, config = {}) {
  const endDayID = getLocalDayID(options.now || new Date());
  const startDayID = addDays(endDayID, -windowDays + 1);
  const validWeights = validWeightRecords(weights);

  if (config.requireFullWindow && !hasBackdatedCoverage(validWeights, startDayID)) {
    return {
      state: "NotEnoughData",
      count: filterRecordsInDayRange(validWeights, startDayID, endDayID).length,
      average: null,
    };
  }

  return averageForDayRange(validWeights, startDayID, endDayID);
}

function averageForWeightTile(weights, tileDef, options = {}) {
  const validWeights = validWeightRecords(weights);

  if (tileDef.kind === "previousTrailing") {
    const todayID = getLocalDayID(options.now || new Date());
    return averageForDayRange(
      validWeights,
      addDays(todayID, -13),
      addDays(todayID, -7),
    );
  }

  if (tileDef.kind === "snapshot") {
    const todayID = getLocalDayID(options.now || new Date());
    return averageForDayRange(
      validWeights,
      addDays(todayID, tileDef.startOffsetDays),
      addDays(todayID, tileDef.endOffsetDays),
    );
  }

  return averageForTrailingWindow(weights, tileDef.windowDays, options, {
    requireFullWindow: tileDef.requireElapsedCoverage === true,
  });
}

function averageForDayRange(weights, startDayID, endDayID) {
  const values = filterRecordsInDayRange(weights, startDayID, endDayID)
    .map((weight) => normalizeWeightValue(weight?.value))
    .filter((value) => value != null);
  const average = values.length > 0
    ? roundOneDecimal(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;

  return {
    state: values.length > 0 ? "Ready" : "NoData",
    count: values.length,
    average,
  };
}

function validWeightRecords(weights) {
  return (Array.isArray(weights) ? weights : [])
    .filter((weight) => weight?.dayID && normalizeWeightValue(weight?.value) != null);
}

function validWaistRecords(weights) {
  return (Array.isArray(weights) ? weights : [])
    .map((weight) => ({
      dayID: weight?.dayID,
      value: normalizeWaistValue(weight?.waist),
    }))
    .filter((weight) => weight.dayID && weight.value != null);
}

function hasBackdatedCoverage(weights, startDayID) {
  return validWeightRecords(weights).some((weight) => weight.dayID <= startDayID);
}

function createWeightComparison(id, currentAverage, comparisonAverage) {
  if (currentAverage == null || comparisonAverage == null || comparisonAverage <= 0) {
    return null;
  }

  const delta = roundOneDecimal(currentAverage - comparisonAverage);
  const percent = roundOneDecimal((delta / comparisonAverage) * 100);

  return {
    id,
    currentAverage,
    comparisonAverage,
    delta,
    percent,
  };
}

function weightNoticeForComparisons(comparisons, waistTrend = null) {
  const evaluable = comparisons.filter((comparison) =>
    Number.isFinite(comparison.percent) && WEIGHT_STATUS_THRESHOLDS[comparison.id]);

  if (evaluable.some((comparison) => comparison.percent < -WEIGHT_STATUS_THRESHOLDS[comparison.id].fastLoss)) {
    return waistAdjustedWeightNotice(createWeightNotice("ConsiderEatingMore", REPORTS_COPY.weightConsiderMore), waistTrend);
  }

  const meaningfulGainCount = evaluable.filter((comparison) =>
    comparison.percent >= WEIGHT_STATUS_THRESHOLDS[comparison.id].meaningfulGain).length;
  const hasStrongGain = evaluable.some((comparison) =>
    comparison.percent >= WEIGHT_STATUS_THRESHOLDS[comparison.id].strongGain);

  if (hasStrongGain || meaningfulGainCount >= 2) {
    return waistAdjustedWeightNotice(createWeightNotice("Reflect", REPORTS_COPY.weightReflect), waistTrend);
  }

  const sustainableLossCount = evaluable.filter((comparison) => {
    const threshold = WEIGHT_STATUS_THRESHOLDS[comparison.id];
    const lossPercent = Math.abs(Math.min(comparison.percent, 0));

    return lossPercent >= threshold.sustainableMin && lossPercent <= threshold.sustainableMax;
  }).length;
  const availableLossCount = evaluable.filter((comparison) => comparison.percent < 0).length;
  const hasConsistentAvailableLoss = sustainableLossCount >= 1
    && availableLossCount >= 2
    && availableLossCount === evaluable.length;

  if (sustainableLossCount >= 2 || hasConsistentAvailableLoss) {
    return waistAdjustedWeightNotice(createWeightNotice("Progressing", REPORTS_COPY.weightProgressing), waistTrend);
  }

  return waistAdjustedWeightNotice(createWeightNotice("Stable", REPORTS_COPY.weightStable), waistTrend);
}

function waistAdjustedWeightNotice(notice, waistTrend) {
  if (!waistTrend || waistTrend.entryCount < 2) {
    return notice;
  }

  if (notice.kind === "Reflect" && waistTrend.direction === "decreasing") {
    return createWeightNotice("Progressing", REPORTS_COPY.weightGainWaistDown);
  }

  if ((notice.kind === "Progressing" || notice.kind === "ConsiderEatingMore") && waistTrend.direction === "increasing") {
    return createWeightNotice("Reflect", REPORTS_COPY.weightLossWaistUp);
  }

  if (notice.kind === "Stable" && waistTrend.direction === "increasing") {
    return createWeightNotice("Reflect", REPORTS_COPY.weightStableWaistUp);
  }

  return notice;
}

function createWeightNotice(kind, text) {
  return {
    kind,
    text,
  };
}

function comparisonPhrase(comparison) {
  if (comparison.delta > 0) {
    return "higher than";
  }

  if (comparison.delta < 0) {
    return "lower than";
  }

  return "the same as";
}

function comparisonDirectionText(comparison) {
  if (comparison.delta > 0) {
    return "higher";
  }

  if (comparison.delta < 0) {
    return "lower";
  }

  return "changed";
}

function formatSignedMagnitude(value) {
  return formatWeightAverage(Math.abs(value));
}

function formatPercent(value) {
  return formatWeightAverage(Math.abs(value));
}

function qualitativeMealMetricText(metricName, average) {
  if (average == null) {
    return REPORTS_COPY.mealNoData;
  }

  const descriptor = closestMealLevelDescriptor(average);
  return metricName === "stoppedAtEnough"
    ? `On average, your satiety levels over the last 7 days have been ${descriptor} after taking a meal.`
    : `On average, your hunger levels over the last 7 days have been ${descriptor} when eating.`;
}

function closestMealLevelDescriptor(average) {
  const roundedValue = Math.min(4, Math.max(0, Math.round(average)));
  return MEAL_LEVELS.find((level) => level.value === roundedValue)?.descriptor || mealLevelLabel(roundedValue);
}

function mealMetricAverageSummary(average, denominator) {
  const averageCopy = average == null ? "no data" : formatWeightAverage(average);
  const noun = denominator === 1 ? "meal" : "meals";
  return REPORTS_COPY.mealDenominator
    .replace("{average}", averageCopy)
    .replace("{denominator}", String(denominator))
    .replace("meal/meals", noun);
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
      supportsDetail: false,
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

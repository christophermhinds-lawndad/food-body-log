import { getTodayDayID, getTomorrowDayID } from "./day-policy.js";
import {
  MEAL_SLOTS,
  applyLoggedMeal,
  applySkippedMeal,
  applyUnskippedMeal,
  createDefaultMeal,
  getSlot,
  mealID,
  normalizePlannedText,
  normalizeWeightValue,
  rankPlannedTextSuggestions,
} from "./tracking-model.js?v=3";
import { openAppDb } from "./storage.js";

const DAYS_STORE = "days";
const MEALS_STORE = "meals";
const WEIGHTS_STORE = "weights";
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  day: null,
  meals: [],
  weight: null,
});

export async function getTodayTrackingState(options = {}) {
  const dayID = getTodayDayID(options);

  return readDayState(dayID, options);
}

export async function getPlanState(dayIDOrOptions = {}) {
  const dayID = typeof dayIDOrOptions === "string" ? dayIDOrOptions : getTomorrowDayID(dayIDOrOptions);

  return readDayState(dayID, typeof dayIDOrOptions === "string" ? {} : dayIDOrOptions);
}

export async function getPlanSuggestions(query, options = {}) {
  return withDb(async (db) => ({
    status: "Ready",
    suggestions: rankPlannedTextSuggestions(query, await getAllMeals(db), options),
  }), {
    suggestions: [],
  });
}

export async function savePlan(dayID, plannedTextBySlot, options = {}) {
  return withDb(async (db) => {
    const day = await ensureDay(db, dayID, options);
    const meals = await ensureMealsForDay(db, dayID, options);
    const changedMeals = meals.filter((meal) => hasPlannedTextForSlot(plannedTextBySlot, meal.slot));
    const updatedAt = nowIso(options);
    const updates = changedMeals.map((meal) => ({
      ...meal,
      plannedText: normalizePlannedText(plannedTextBySlot[meal.slot]),
      updatedAt,
    }));

    try {
      await putRecordsAtomically(db, MEALS_STORE, updates);
    } catch {
      return {
        status: "Error",
        day,
        meals: await ensureMealsForDay(db, dayID, options),
        weight: await getWeight(db, dayID),
        error: {
          code: "plan-save-failed",
          dayID,
        },
      };
    }

    return {
      status: "Ready",
      day,
      meals: await ensureMealsForDay(db, dayID, options),
      weight: await getWeight(db, dayID),
    };
  });
}

export async function saveMealLog(dayID, slot, answers = {}) {
  return withDb(async (db) => {
    const selectedSlot = getSlot(slot);
    const day = await ensureDay(db, dayID, answers);
    await ensureMealsForDay(db, dayID, answers);

    const existingMeal = await getMeal(db, dayID, selectedSlot.id);
    let loggedMeal;

    try {
      loggedMeal = applyLoggedMeal(existingMeal, answers);
    } catch (error) {
      if (error instanceof TypeError) {
        return {
          status: "Invalid",
          day,
          meals: await ensureMealsForDay(db, dayID, answers),
          weight: await getWeight(db, dayID),
          error: {
            code: "partial-metric-answers",
            dayID,
            slot: selectedSlot.id,
          },
        };
      }

      throw error;
    }

    try {
      await putRecord(db, MEALS_STORE, loggedMeal);
    } catch {
      return {
        status: "Error",
        day,
        meals: await ensureMealsForDay(db, dayID, answers),
        weight: await getWeight(db, dayID),
        error: {
          code: "meal-save-failed",
          dayID,
          slot: selectedSlot.id,
        },
      };
    }

    return {
      status: "Ready",
      day,
      meals: await ensureMealsForDay(db, dayID, answers),
      weight: await getWeight(db, dayID),
    };
  });
}

export async function skipMeal(dayID, slot, options = {}) {
  return withDb(async (db) => {
    const selectedSlot = getSlot(slot);
    const day = await ensureDay(db, dayID, options);
    await ensureMealsForDay(db, dayID, options);

    const existingMeal = await getMeal(db, dayID, selectedSlot.id);
    const skippedMeal = applySkippedMeal(existingMeal, options.now || new Date());
    await putRecord(db, MEALS_STORE, skippedMeal);

    return {
      status: "Ready",
      day,
      meals: await ensureMealsForDay(db, dayID, options),
      weight: await getWeight(db, dayID),
    };
  });
}

export async function unskipMeal(dayID, slot, options = {}) {
  return withDb(async (db) => {
    const selectedSlot = getSlot(slot);
    const day = await ensureDay(db, dayID, options);
    await ensureMealsForDay(db, dayID, options);

    const existingMeal = await getMeal(db, dayID, selectedSlot.id);
    const unskippedMeal = applyUnskippedMeal(existingMeal, options.now || new Date());
    await putRecord(db, MEALS_STORE, unskippedMeal);

    return {
      status: "Ready",
      day,
      meals: await ensureMealsForDay(db, dayID, options),
      weight: await getWeight(db, dayID),
    };
  });
}

export async function saveWeight(dayID, value, options = {}) {
  const normalizedWeight = normalizeWeightValue(value);

  if (normalizedWeight == null) {
    return {
      ...UNAVAILABLE,
      status: "Invalid",
    };
  }

  return withDb(async (db) => {
    const day = await ensureDay(db, dayID, options);
    await ensureMealsForDay(db, dayID, options);
    const priorWeight = await getPriorWeight(db, dayID);
    const difference = priorWeight?.value == null ? 0 : Math.abs(normalizedWeight - priorWeight.value);

    if (difference > 5 && options.confirmLargeChange !== true) {
      return {
        status: "NeedsConfirmation",
        day,
        meals: await ensureMealsForDay(db, dayID, options),
        weight: await getWeight(db, dayID),
        warning: {
          code: "possible-weight-typo",
          dayID,
          priorDayID: priorWeight.dayID,
          priorValue: priorWeight.value,
          value: normalizedWeight,
          difference,
        },
      };
    }

    const weight = {
      dayID,
      value: normalizedWeight,
      updatedAt: nowIso(options),
    };
    await putRecord(db, WEIGHTS_STORE, weight);

    return {
      status: "Ready",
      day,
      meals: await ensureMealsForDay(db, dayID, options),
      weight,
    };
  });
}

async function readDayState(dayID, options = {}) {
  return withDb(async (db) => {
    const day = await ensureDay(db, dayID, options);
    const meals = await ensureMealsForDay(db, dayID, options);
    const weight = await getWeight(db, dayID);

    return {
      status: "Ready",
      day,
      meals,
      weight,
    };
  });
}

async function withDb(callback, unavailableExtras = {}) {
  try {
    const db = await openAppDb();

    if (!db) {
      return { ...UNAVAILABLE, ...unavailableExtras };
    }

    try {
      const result = await callback(db);
      return {
        available: true,
        ...result,
      };
    } finally {
      db.close?.();
    }
  } catch {
    return { ...UNAVAILABLE, ...unavailableExtras };
  }
}

async function ensureDay(db, dayID, options = {}) {
  const existingDay = await getRecord(db, DAYS_STORE, dayID);

  if (existingDay) {
    return existingDay;
  }

  const day = {
    dayID,
    createdAt: nowIso(options),
    updatedAt: nowIso(options),
  };
  await putRecord(db, DAYS_STORE, day);

  return day;
}

async function ensureMealsForDay(db, dayID, options = {}) {
  const existingMeals = await getMealsByDay(db, dayID);
  const bySlot = new Map(existingMeals.map((meal) => [meal.slot, meal]));
  const missingMeals = MEAL_SLOTS
    .filter((slot) => !bySlot.has(slot.id))
    .map((slot) => createDefaultMeal(dayID, slot, options));

  if (missingMeals.length > 0) {
    await putRecords(db, MEALS_STORE, missingMeals);
  }

  return sortMeals([...existingMeals, ...missingMeals]);
}

async function getMeal(db, dayID, slot) {
  const existingMeal = await getRecord(db, MEALS_STORE, mealID(dayID, slot));

  return existingMeal || createDefaultMeal(dayID, getSlot(slot));
}

async function getWeight(db, dayID) {
  return await getRecord(db, WEIGHTS_STORE, dayID) || null;
}

async function getPriorWeight(db, dayID) {
  return await getWeight(db, previousDayID(dayID));
}

function previousDayID(dayID) {
  const [year, month, day] = String(dayID).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  const previousYear = date.getFullYear();
  const previousMonth = String(date.getMonth() + 1).padStart(2, "0");
  const previousDay = String(date.getDate()).padStart(2, "0");

  return `${previousYear}-${previousMonth}-${previousDay}`;
}

function sortMeals(meals) {
  const order = new Map(MEAL_SLOTS.map((slot, index) => [slot.id, index]));

  return [...meals].sort((left, right) => order.get(left.slot) - order.get(right.slot));
}

function getRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);

    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

async function putRecords(db, storeName, records) {
  for (const record of records) {
    await putRecord(db, storeName, record);
  }
}

function putRecordsAtomically(db, storeName, records) {
  if (records.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    let requestError = null;

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(requestError || transaction.error);
    transaction.onabort = () => reject(requestError || transaction.error);

    try {
      for (const record of records) {
        const request = store.put(record);
        request.onerror = () => {
          requestError = request.error;
        };
      }
    } catch (error) {
      reject(error);
    }
  });
}

function getMealsByDay(db, dayID) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(MEALS_STORE, "readonly").objectStore(MEALS_STORE);
    const request = typeof store.index === "function"
      ? store.index("byDay").getAll(dayID)
      : store.getAll();

    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      resolve(records.filter((meal) => meal.dayID === dayID));
    };
    request.onerror = () => reject(request.error);
  });
}

function getAllMeals(db) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEALS_STORE, "readonly").objectStore(MEALS_STORE).getAll();

    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
  });
}

function nowIso(options = {}) {
  const now = options.now || new Date();
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

function hasPlannedTextForSlot(plannedTextBySlot, slot) {
  return Object.prototype.hasOwnProperty.call(plannedTextBySlot || {}, slot);
}

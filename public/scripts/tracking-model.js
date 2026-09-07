export const MEAL_SLOTS = Object.freeze([
  Object.freeze({ id: "breakfast", label: "Breakfast" }),
  Object.freeze({ id: "lunch", label: "Lunch" }),
  Object.freeze({ id: "dinner", label: "Dinner" }),
  Object.freeze({ id: "snack", label: "Optional Snack" }),
]);

export const MEAL_STATES = Object.freeze({
  notLogged: "notLogged",
  logged: "logged",
  skipped: "skipped",
});

export const MEAL_ANSWERS = Object.freeze({
  yes: "yes",
  no: "no",
  unanswered: "unanswered",
});

export const MEAL_LEVELS = Object.freeze([
  Object.freeze({ value: 0, descriptor: "None" }),
  Object.freeze({ value: 1, descriptor: "Neutral" }),
  Object.freeze({ value: 2, descriptor: "Moderate" }),
  Object.freeze({ value: 3, descriptor: "Distracting" }),
  Object.freeze({ value: 4, descriptor: "Uncomfortable" }),
]);

const MEAL_LEVEL_BY_VALUE = new Map(MEAL_LEVELS.map((level) => [level.value, level]));

export function createDefaultMeal(dayID, slot, options = {}) {
  const slotInfo = getSlot(slot);
  const nowIso = toIso(options.now || new Date());

  return {
    id: mealID(dayID, slotInfo.id),
    dayID,
    slot: slotInfo.id,
    slotLabel: slotInfo.label,
    plannedText: "",
    logState: MEAL_STATES.notLogged,
    ateWhenHungry: MEAL_ANSWERS.unanswered,
    stoppedAtEnough: MEAL_ANSWERS.unanswered,
    loggedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function applySkippedMeal(existingMeal, now = new Date()) {
  const nowIso = toIso(now);

  return {
    ...existingMeal,
    logState: MEAL_STATES.skipped,
    ateWhenHungry: MEAL_ANSWERS.unanswered,
    stoppedAtEnough: MEAL_ANSWERS.unanswered,
    loggedAt: nowIso,
    updatedAt: nowIso,
  };
}

export function applyUnskippedMeal(existingMeal, now = new Date()) {
  const nowIso = toIso(now);

  return {
    ...existingMeal,
    logState: MEAL_STATES.notLogged,
    ateWhenHungry: MEAL_ANSWERS.unanswered,
    stoppedAtEnough: MEAL_ANSWERS.unanswered,
    loggedAt: null,
    updatedAt: nowIso,
  };
}

export function applyLoggedMeal(existingMeal, options = {}) {
  const ateWhenHungry = normalizeMealLevel(options.ateWhenHungry);
  const stoppedAtEnough = normalizeMealLevel(options.stoppedAtEnough);

  if (!isMealLevelAnswered(ateWhenHungry) || !isMealLevelAnswered(stoppedAtEnough)) {
    throw new TypeError("Logged meals require both meal levels.");
  }

  const nowIso = toIso(options.now || new Date());

  return {
    ...existingMeal,
    logState: MEAL_STATES.logged,
    ateWhenHungry,
    stoppedAtEnough,
    loggedAt: nowIso,
    updatedAt: nowIso,
  };
}

export function normalizePlannedText(value) {
  return String(value ?? "").trim();
}

export function normalizedPlannedTextWords(value) {
  return normalizePlannedText(value).toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function rankPlannedTextSuggestions(query, meals, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 3;
  const queryWords = new Set(normalizedPlannedTextWords(query));

  if (queryWords.size === 0) {
    return [];
  }

  const seenTexts = new Set();
  const candidates = [];

  for (const meal of Array.isArray(meals) ? meals : []) {
    const text = normalizePlannedText(meal?.plannedText);
    const normalizedKey = normalizedPlannedTextWords(text).join(" ");

    if (!text || !normalizedKey || seenTexts.has(normalizedKey)) {
      continue;
    }

    seenTexts.add(normalizedKey);
    const words = new Set(normalizedPlannedTextWords(text));
    const sharedWordCount = Array.from(queryWords).filter((word) => words.has(word)).length;

    if (sharedWordCount === 0) {
      continue;
    }

    candidates.push({
      text,
      sharedWordCount,
      updatedAt: meal?.updatedAt || "",
      firstSeen: candidates.length,
    });
  }

  return candidates
    .sort((left, right) => right.sharedWordCount - left.sharedWordCount
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.firstSeen - right.firstSeen)
    .slice(0, limit)
    .map((candidate) => candidate.text);
}

export function normalizeWeightValue(value) {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").trim());

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function normalizeWaistValue(value) {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").trim());

  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

export function normalizeMealLevel(value) {
  if (value === MEAL_ANSWERS.yes) {
    return 3;
  }

  if (value === MEAL_ANSWERS.no) {
    return 0;
  }

  if (value === MEAL_ANSWERS.unanswered || value == null || value === "") {
    return MEAL_ANSWERS.unanswered;
  }

  const numericValue = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);

  return MEAL_LEVEL_BY_VALUE.has(numericValue) ? numericValue : MEAL_ANSWERS.unanswered;
}

export function isMealLevelAnswered(value) {
  return normalizeMealLevel(value) !== MEAL_ANSWERS.unanswered;
}

export function mealLevelLabel(value) {
  const normalized = normalizeMealLevel(value);

  if (!isMealLevelAnswered(normalized)) {
    return "Not logged";
  }

  const level = MEAL_LEVEL_BY_VALUE.get(normalized);
  return `${level.value} - ${level.descriptor}`;
}

export function isLowHungerLevel(value) {
  const normalized = normalizeMealLevel(value);
  return isMealLevelAnswered(normalized) && normalized <= 1;
}

export function isHighSatietyLevel(value) {
  const normalized = normalizeMealLevel(value);
  return isMealLevelAnswered(normalized) && normalized >= 4;
}

export function mealID(dayID, slot) {
  return `${dayID}:${getSlot(slot).id}`;
}

export function getSlot(slot) {
  const slotID = typeof slot === "string" ? slot : slot?.id;
  const match = MEAL_SLOTS.find((mealSlot) => mealSlot.id === slotID);

  if (!match) {
    throw new TypeError(`Unknown meal slot: ${slotID}`);
  }

  return match;
}

function toIso(dateLike) {
  return (dateLike instanceof Date ? dateLike : new Date(dateLike)).toISOString();
}

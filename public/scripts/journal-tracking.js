import {
  MEAL_SLOTS,
} from "./tracking-model.js?v=3";
import {
  BREAKTHROUGH_STATES,
  OUTSIDE_PLAN_PROMPT,
  OUTSIDE_PLAN_PROMPT_ID,
  createJournalAnswerRecord,
  promptsForMeals,
} from "./journal-model.js?v=2";
import { openAppDb } from "./storage.js";

const DAYS_STORE = "days";
const MEALS_STORE = "meals";
const JOURNAL_ANSWERS_STORE = "journalAnswers";
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  day: null,
  meals: [],
  prompts: [],
  answers: [],
  outsidePlanAnswer: null,
  breakthroughs: [],
});

export async function getJournalState(dayID) {
  return withDb(async (db) => {
    const day = await getRecord(db, DAYS_STORE, dayID) || null;
    const meals = await getMealsByDay(db, dayID);
    const allAnswers = await getAnswersByDay(db, dayID);
    const outsidePlanAnswer = outsidePlanAnswerFrom(allAnswers);
    const prompts = promptsForMeals(meals, { outsidePlan: outsidePlanAnswer?.text === "yes" });
    const answers = sortAnswersForPrompts(allAnswers, prompts);
    const breakthroughs = sortBreakthroughs((await getBreakthroughRecords(db))
      .filter((answer) => answer.breakthroughState === BREAKTHROUGH_STATES.marked));

    return {
      status: "Ready",
      day,
      meals,
      prompts,
      answers,
      outsidePlanAnswer,
      breakthroughs,
    };
  });
}

export async function saveReflection(dayID, answersByPrompt = {}, options = {}) {
  return withDb(async (db) => {
    const day = await getRecord(db, DAYS_STORE, dayID) || null;
    const meals = await getMealsByDay(db, dayID);
    const existingAnswers = await getAnswersByDay(db, dayID);
    const existingByPromptID = new Map(existingAnswers.map((answer) => [answer.promptID, answer]));
    const outsidePlanAnswerInput = normalizeOutsidePlanAnswerInput(answersByPrompt?.[OUTSIDE_PLAN_PROMPT_ID]);
    const prompts = promptsForMeals(meals, { outsidePlan: outsidePlanAnswerInput.text === "yes" });
    const records = [
      createJournalAnswerRecord(
        dayID,
        OUTSIDE_PLAN_PROMPT,
        outsidePlanAnswerInput,
        existingByPromptID.get(OUTSIDE_PLAN_PROMPT_ID) || null,
        options,
      ),
      ...prompts.map((prompt) => createJournalAnswerRecord(
        dayID,
        prompt,
        answersByPrompt?.[prompt.id] || {},
        existingByPromptID.get(prompt.id) || null,
        options,
      )),
    ];

    try {
      await putRecordsAtomically(db, JOURNAL_ANSWERS_STORE, records);
    } catch {
      return {
        status: "Error",
        day,
        meals,
        prompts,
        answers: sortAnswersForPrompts(await getAnswersByDay(db, dayID), prompts),
        outsidePlanAnswer: outsidePlanAnswerFrom(await getAnswersByDay(db, dayID)),
        breakthroughs: sortBreakthroughs(await getBreakthroughRecords(db)),
        error: {
          code: "reflection-save-failed",
          dayID,
        },
      };
    }

    return {
      status: "Ready",
      day,
      meals,
      prompts,
      answers: sortAnswersForPrompts(await getAnswersByDay(db, dayID), prompts),
      outsidePlanAnswer: outsidePlanAnswerFrom(await getAnswersByDay(db, dayID)),
      breakthroughs: sortBreakthroughs(await getBreakthroughRecords(db)),
    };
  });
}

export async function setAnswerBreakthrough(answerID, active, options = {}) {
  return withDb(async (db) => {
    const existing = await getRecord(db, JOURNAL_ANSWERS_STORE, answerID);

    if (!existing) {
      return {
        status: "Error",
        answer: null,
        error: {
          code: "journal-answer-not-found",
          answerID,
        },
      };
    }

    const updated = {
      ...existing,
      breakthroughState: active ? BREAKTHROUGH_STATES.marked : BREAKTHROUGH_STATES.none,
      breakthroughMarkedAt: active ? nowIso(options) : null,
      breakthroughDroppedAt: null,
      updatedAt: nowIso(options),
    };
    await putRecordAtomically(db, JOURNAL_ANSWERS_STORE, updated);

    return {
      status: "Ready",
      answer: updated,
      breakthroughs: sortBreakthroughs(await getBreakthroughRecords(db)),
    };
  }, {
    answer: null,
  });
}

export async function dropBreakthrough(answerID, options = {}) {
  return withDb(async (db) => {
    const existing = await getRecord(db, JOURNAL_ANSWERS_STORE, answerID);

    if (!existing) {
      return {
        status: "Error",
        answer: null,
        error: {
          code: "journal-answer-not-found",
          answerID,
        },
      };
    }

    const updated = {
      ...existing,
      breakthroughState: BREAKTHROUGH_STATES.dropped,
      breakthroughDroppedAt: nowIso(options),
      updatedAt: nowIso(options),
    };
    await putRecordAtomically(db, JOURNAL_ANSWERS_STORE, updated);

    return {
      status: "Ready",
      answer: updated,
      breakthroughs: sortBreakthroughs(await getBreakthroughRecords(db)),
    };
  }, {
    answer: null,
  });
}

export async function getBreakthroughs() {
  return withDb(async (db) => ({
    status: "Ready",
    breakthroughs: sortBreakthroughs(await getBreakthroughRecords(db)),
  }));
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

function getRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecordAtomically(db, storeName, record) {
  return putRecordsAtomically(db, storeName, [record]);
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
      resolve(sortMeals(records.filter((meal) => meal.dayID === dayID)));
    };
    request.onerror = () => reject(request.error);
  });
}

function getAnswersByDay(db, dayID) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(JOURNAL_ANSWERS_STORE, "readonly").objectStore(JOURNAL_ANSWERS_STORE);
    const request = typeof store.index === "function"
      ? store.index("byDay").getAll(dayID)
      : store.getAll();

    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      resolve(records.filter((answer) => answer.dayID === dayID));
    };
    request.onerror = () => reject(request.error);
  });
}

function getBreakthroughRecords(db) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(JOURNAL_ANSWERS_STORE, "readonly").objectStore(JOURNAL_ANSWERS_STORE);
    const request = typeof store.index === "function"
      ? store.index("byBreakthrough").getAll(BREAKTHROUGH_STATES.marked)
      : store.getAll();

    request.onsuccess = () => {
      const records = Array.isArray(request.result) ? request.result : [];
      resolve(records.filter((answer) => answer.breakthroughState === BREAKTHROUGH_STATES.marked));
    };
    request.onerror = () => reject(request.error);
  });
}

function sortMeals(meals) {
  const order = new Map(MEAL_SLOTS.map((slot, index) => [slot.id, index]));

  return [...meals].sort((left, right) => order.get(left.slot) - order.get(right.slot));
}

function sortAnswersForPrompts(answers, prompts) {
  const promptOrder = new Map(prompts.map((prompt, index) => [prompt.id, index]));

  return [...answers].filter((answer) => promptOrder.has(answer.promptID)).sort((left, right) => {
    const leftOrder = promptOrder.has(left.promptID) ? promptOrder.get(left.promptID) : Number.MAX_SAFE_INTEGER;
    const rightOrder = promptOrder.has(right.promptID) ? promptOrder.get(right.promptID) : Number.MAX_SAFE_INTEGER;

    return leftOrder - rightOrder || left.id.localeCompare(right.id);
  });
}

function outsidePlanAnswerFrom(answers) {
  return (answers || []).find((answer) => answer.promptID === OUTSIDE_PLAN_PROMPT_ID) || null;
}

function normalizeOutsidePlanAnswerInput(answer = {}) {
  const text = answer?.text === "yes" || answer?.text === "no" ? answer.text : "";

  return {
    text,
    selectedChipIDs: [],
    detail: "",
  };
}

function sortBreakthroughs(answers) {
  return [...answers].sort((left, right) => right.dayID.localeCompare(left.dayID)
    || String(right.breakthroughMarkedAt || "").localeCompare(String(left.breakthroughMarkedAt || ""))
    || String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))
    || left.id.localeCompare(right.id));
}

function nowIso(options = {}) {
  const now = options.now || new Date();
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

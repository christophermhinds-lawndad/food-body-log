import { openAppDb } from "./storage.js";
import { JOURNAL_CHIPS, JOURNAL_PROMPTS, OUTSIDE_PLAN_PROMPT_ID } from "./journal-model.js?v=2";

const APP_ID = "food-body-log";
const EXPORT_VERSION = 1;
const DB_NAME = "food-body-log";
const DB_VERSION = 3;
const MAX_IMPORT_BYTES = 2_000_000;
const MAX_RECORDS_PER_STORE = 20_000;
const MAX_STRING_LENGTH = 20_000;
const STORE_NAMES = Object.freeze(["settings", "days", "meals", "weights", "journalAnswers"]);
const STORE_KEY_PATHS = Object.freeze({
  settings: "key",
  days: "dayID",
  meals: "id",
  weights: "dayID",
  journalAnswers: "id",
});
const NON_PORTABLE_SETTINGS_KEYS = Object.freeze(["setup-status"]);
const MEAL_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snack"]);
const MEAL_STATES = Object.freeze(["notLogged", "logged", "skipped"]);
const MEAL_ANSWERS = Object.freeze(["yes", "no", "unanswered"]);
const BREAKTHROUGH_STATES = Object.freeze(["none", "marked", "dropped"]);
const JOURNAL_PROMPT_SNAPSHOTS = Object.freeze([
  Object.freeze({
    id: OUTSIDE_PLAN_PROMPT_ID,
    text: "Did I eat food outside of my plan, when I was not hungry?",
    supportsChips: false,
    supportsDetail: false,
  }),
  ...JOURNAL_PROMPTS,
  Object.freeze({
    id: "outside-plan-food",
    text: "What food?",
    supportsChips: false,
    supportsDetail: false,
  }),
  Object.freeze({
    id: "outside-plan-time",
    text: "What time of day?",
    supportsChips: false,
    supportsDetail: false,
  }),
  Object.freeze({
    id: "outside-plan-context",
    text: "Context Tiles",
    supportsChips: true,
    supportsDetail: true,
  }),
]);
const JOURNAL_PROMPT_BY_ID = new Map(JOURNAL_PROMPT_SNAPSHOTS.map((prompt) => [prompt.id, prompt]));
const JOURNAL_CHIP_BY_ID = new Map(JOURNAL_CHIPS.map((chip) => [chip.id, chip]));
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  payload: null,
  fileName: "",
});

export const BACKUP_COPY = Object.freeze({
  exportReady: "Backup is ready to save.",
  importReady: "Backup is ready to import.",
  importComplete: "Backup imported on this device.",
  invalidBackup: "Choose a Food Body Log backup JSON file.",
});

export async function exportLocalData(options = {}) {
  return withDb(async (db) => {
    const exportedAt = isoString(options.now || new Date());
    const dataEntries = await Promise.all(STORE_NAMES.map(async (storeName) => [
      storeName,
      portableRecords(storeName, await getAllRecords(db, storeName)),
    ]));

    return {
      status: "Ready",
      fileName: backupFileName(exportedAt),
      payload: {
        app: APP_ID,
        exportVersion: EXPORT_VERSION,
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        exportedAt,
        data: Object.fromEntries(dataEntries),
      },
    };
  }, {
    fileName: backupFileName(isoString(options.now || new Date())),
  });
}

export function parseBackupText(text) {
  let parsed;

  try {
    parsed = JSON.parse(String(text ?? ""));
  } catch {
    return invalidResult("invalid-json");
  }

  return validateBackupPayload(parsed);
}

export function validateBackupPayload(payload) {
  if (!isPlainObject(payload)) {
    return invalidResult("invalid-backup");
  }

  if (payload.app !== APP_ID || payload.exportVersion !== EXPORT_VERSION) {
    return invalidResult("unsupported-backup");
  }

  if (payload.dbName !== DB_NAME || payload.dbVersion !== DB_VERSION) {
    return invalidResult("unsupported-backup");
  }

  if (!isIsoLikeString(payload.exportedAt) || !isPlainObject(payload.data)) {
    return invalidResult("invalid-backup");
  }

  const normalizedData = {};

  for (const storeName of STORE_NAMES) {
    const records = payload.data[storeName];

    if (!Array.isArray(records)) {
      return invalidResult("missing-store", { storeName });
    }

    if (records.length > MAX_RECORDS_PER_STORE) {
      return invalidResult("too-many-records", { storeName });
    }

    const normalizedRecords = [];
    const seenKeys = new Set();

    for (const record of records) {
      const normalized = normalizeRecord(storeName, record);

      if (!normalized.valid) {
        return invalidResult("invalid-record", { storeName, reason: normalized.reason });
      }

      if (normalized.record == null) {
        continue;
      }

      const key = normalized.record[STORE_KEY_PATHS[storeName]];

      if (seenKeys.has(key)) {
        return invalidResult("duplicate-record", { storeName });
      }

      seenKeys.add(key);
      normalizedRecords.push(normalized.record);
    }

    normalizedData[storeName] = normalizedRecords;
  }

  return {
    available: true,
    status: "Ready",
    payload: {
      app: APP_ID,
      exportVersion: EXPORT_VERSION,
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      exportedAt: payload.exportedAt,
      data: normalizedData,
    },
  };
}

export async function replaceLocalDataFromBackup(payload) {
  const validation = validateBackupPayload(payload);

  if (validation.status !== "Ready") {
    return validation;
  }

  return withDb(async (db) => {
    try {
      await replaceStores(db, validation.payload.data);
    } catch {
      return {
        available: true,
        status: "Error",
        payload: null,
        error: {
          code: "import-replace-failed",
        },
      };
    }

    return {
      status: "Ready",
      payload: validation.payload,
      restoredCounts: restoredCounts(validation.payload.data),
    };
  });
}

export async function inspectBackupImport(payload) {
  const validation = validateBackupPayload(payload);

  if (validation.status !== "Ready") {
    return validation;
  }

  return withDb(async (db) => {
    const plan = await createImportPlan(db, validation.payload.data);

    return {
      status: "Ready",
      payload: validation.payload,
      importedCounts: restoredCounts(validation.payload.data),
      overlapDayCount: plan.overlapDayIDs.length,
      overlapDayIDs: plan.overlapDayIDs,
    };
  });
}

export async function importLocalDataFromBackup(payload, options = {}) {
  const validation = validateBackupPayload(payload);

  if (validation.status !== "Ready") {
    return validation;
  }

  return withDb(async (db) => {
    const plan = await createImportPlan(db, validation.payload.data);

    if (plan.overlapDayIDs.length > 0 && options.allowOverwrite !== true) {
      return {
        status: "NeedsOverlapConfirmation",
        payload: validation.payload,
        importedCounts: restoredCounts(validation.payload.data),
        overlapDayCount: plan.overlapDayIDs.length,
        overlapDayIDs: plan.overlapDayIDs,
        error: {
          code: "overlapping-days",
        },
      };
    }

    try {
      await mergeStores(db, validation.payload.data, plan);
    } catch (error) {
      return {
        available: true,
        status: "Error",
        payload: null,
        error: {
          code: "import-merge-failed",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }

    return {
      status: "Ready",
      payload: validation.payload,
      importedCounts: restoredCounts(validation.payload.data),
      overlapDayCount: plan.overlapDayIDs.length,
      overlapDayIDs: plan.overlapDayIDs,
    };
  });
}

export async function importSelectedBackup(file, options = {}) {
  if (!file || typeof file !== "object") {
    return invalidResult("missing-file");
  }

  if (Number.isFinite(file.size) && file.size > MAX_IMPORT_BYTES) {
    return invalidResult("file-too-large", {
      maxBytes: MAX_IMPORT_BYTES,
      fileName: safeFileName(file.name),
    });
  }

  if (typeof file.text !== "function") {
    return invalidResult("invalid-file");
  }

  try {
    const parsed = parseBackupText(await file.text());

    if (parsed.status !== "Ready") {
      return parsed;
    }

    return importLocalDataFromBackup(parsed.payload, options);
  } catch {
    return {
      available: true,
      status: "Error",
      payload: null,
      error: {
        code: "file-read-failed",
      },
    };
  }
}

export function createDownloadSpec(payload, fileName = "") {
  const validation = validateBackupPayload(payload);

  if (validation.status !== "Ready") {
    return validation;
  }

  return {
    available: true,
    status: "Ready",
    fileName: safeFileName(fileName) || backupFileName(validation.payload.exportedAt),
    mimeType: "application/json",
    text: `${JSON.stringify(validation.payload, null, 2)}\n`,
  };
}

async function withDb(callback, unavailableExtras = {}) {
  let db = null;

  try {
    db = await openAppDb();

    if (!db) {
      return { ...UNAVAILABLE, ...unavailableExtras };
    }

    return {
      available: true,
      ...(await callback(db)),
    };
  } catch {
    return { ...UNAVAILABLE, ...unavailableExtras };
  } finally {
    db?.close?.();
  }
}

function getAllRecords(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();

    request.onsuccess = () => resolve(Array.isArray(request.result)
      ? request.result.map((record) => structuredClone(record))
      : []);
    request.onerror = () => reject(request.error);
  });
}

function replaceStores(db, data) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([...STORE_NAMES], "readwrite");
    let requestError = null;

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(requestError || transaction.error);
    transaction.onabort = () => reject(requestError || transaction.error);

    try {
      for (const storeName of STORE_NAMES) {
        const clearRequest = transaction.objectStore(storeName).clear();
        clearRequest.onerror = () => {
          requestError = clearRequest.error;
        };
      }

      for (const storeName of STORE_NAMES) {
        for (const record of data[storeName]) {
          const putRequest = transaction.objectStore(storeName).put(record);
          putRequest.onerror = () => {
            requestError = putRequest.error;
          };
        }
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function createImportPlan(db, data) {
  const localRecords = Object.fromEntries(await Promise.all(
    ["days", "meals", "weights", "journalAnswers"].map(async (storeName) => [
      storeName,
      await getAllRecords(db, storeName),
    ]),
  ));
  const importDayIDs = collectDayIDs(data);
  const localDayIDs = collectDayIDs(localRecords);
  const overlapDayIDs = Array.from(importDayIDs)
    .filter((dayID) => localDayIDs.has(dayID))
    .sort();
  const overlapDayIDSet = new Set(overlapDayIDs);

  return {
    overlapDayIDs,
    deleteKeys: {
      days: overlapDayIDs,
      meals: localRecords.meals
        .filter((record) => overlapDayIDSet.has(record.dayID))
        .map((record) => record.id),
      weights: overlapDayIDs,
      journalAnswers: localRecords.journalAnswers
        .filter((record) => overlapDayIDSet.has(record.dayID))
        .map((record) => record.id),
    },
  };
}

function mergeStores(db, data, plan) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([...STORE_NAMES], "readwrite");
    let requestError = null;
    let operationCount = 0;

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(requestError || transaction.error);
    transaction.onabort = () => reject(requestError || transaction.error);

    try {
      for (const [storeName, keys] of Object.entries(plan.deleteKeys)) {
        for (const key of keys) {
          operationCount += 1;
          const deleteRequest = transaction.objectStore(storeName).delete(key);
          deleteRequest.onerror = () => {
            requestError = deleteRequest.error;
          };
        }
      }

      for (const storeName of STORE_NAMES) {
        for (const record of data[storeName]) {
          operationCount += 1;
          const putRequest = transaction.objectStore(storeName).put(record);
          putRequest.onerror = () => {
            requestError = putRequest.error;
          };
        }
      }

      if (operationCount === 0) {
        queueMicrotask(() => transaction.oncomplete?.());
      }
    } catch (error) {
      reject(error);
    }
  });
}

function collectDayIDs(data) {
  const dayIDs = new Set();

  for (const day of data.days || []) {
    if (day?.dayID) {
      dayIDs.add(day.dayID);
    }
  }

  for (const meal of data.meals || []) {
    if (meal?.dayID) {
      dayIDs.add(meal.dayID);
    }
  }

  for (const weight of data.weights || []) {
    if (weight?.dayID) {
      dayIDs.add(weight.dayID);
    }
  }

  for (const answer of data.journalAnswers || []) {
    if (answer?.dayID) {
      dayIDs.add(answer.dayID);
    }
  }

  return dayIDs;
}

function normalizeRecord(storeName, record) {
  if (!isPlainObject(record) || hasOversizedString(record)) {
    return { valid: false, reason: "invalid-object" };
  }

  if (storeName === "settings") {
    return normalizeSettingsRecord(record);
  }

  if (storeName === "days") {
    return normalizeDayRecord(record);
  }

  if (storeName === "meals") {
    return normalizeMealRecord(record);
  }

  if (storeName === "weights") {
    return normalizeWeightRecord(record);
  }

  if (storeName === "journalAnswers") {
    return normalizeJournalAnswerRecord(record);
  }

  return { valid: false, reason: "unknown-store" };
}

function normalizeSettingsRecord(record) {
  if (!nonEmptyString(record.key)) {
    return { valid: false, reason: "missing-key" };
  }

  if (NON_PORTABLE_SETTINGS_KEYS.includes(record.key)) {
    return { valid: true, record: null };
  }

  return { valid: true, record: structuredClone(record) };
}

function normalizeDayRecord(record) {
  if (!isDayID(record.dayID)) {
    return { valid: false, reason: "invalid-day-id" };
  }

  return { valid: true, record: structuredClone(record) };
}

function normalizeMealRecord(record) {
  if (!isDayID(record.dayID) || record.id !== `${record.dayID}:${record.slot}`) {
    return { valid: false, reason: "invalid-meal-id" };
  }

  if (!MEAL_SLOTS.includes(record.slot) || typeof record.slotLabel !== "string") {
    return { valid: false, reason: "invalid-meal-slot" };
  }

  if (!MEAL_STATES.includes(record.logState)
    || !MEAL_ANSWERS.includes(record.ateWhenHungry)
    || !MEAL_ANSWERS.includes(record.stoppedAtEnough)) {
    return { valid: false, reason: "invalid-meal-state" };
  }

  if (record.logState === "logged" && (record.ateWhenHungry === "unanswered" || record.stoppedAtEnough === "unanswered")) {
    return { valid: false, reason: "missing-logged-answer" };
  }

  if (typeof record.plannedText !== "string" || !nullableString(record.loggedAt)) {
    return { valid: false, reason: "invalid-meal-text" };
  }

  return { valid: true, record: structuredClone(record) };
}

function normalizeWeightRecord(record) {
  if (!isDayID(record.dayID) || !Number.isFinite(record.value) || record.value <= 0) {
    return { valid: false, reason: "invalid-weight" };
  }

  return { valid: true, record: structuredClone(record) };
}

function normalizeJournalAnswerRecord(record) {
  if (!isDayID(record.dayID) || record.id !== `${record.dayID}:journal:${record.promptID}`) {
    return { valid: false, reason: "invalid-answer-id" };
  }

  const prompt = JOURNAL_PROMPT_BY_ID.get(record.promptID);

  if (!nonEmptyString(record.promptID)
    || !prompt
    || typeof record.promptText !== "string"
    || typeof record.supportsChips !== "boolean"
    || typeof record.supportsDetail !== "boolean"
    || typeof record.text !== "string"
    || typeof record.detail !== "string") {
    return { valid: false, reason: "invalid-answer-shape" };
  }

  if (record.promptText !== prompt.text
    || record.supportsChips !== prompt.supportsChips
    || record.supportsDetail !== prompt.supportsDetail) {
    return { valid: false, reason: "invalid-answer-prompt" };
  }

  if (!Array.isArray(record.selectedChips)
    || !record.selectedChips.every(isValidChip)
    || record.selectedChips.some((chip) => JOURNAL_CHIP_BY_ID.get(chip.id)?.label !== chip.label)
    || (!prompt.supportsChips && record.selectedChips.length > 0)) {
    return { valid: false, reason: "invalid-chip" };
  }

  if (!BREAKTHROUGH_STATES.includes(record.breakthroughState)
    || !nullableString(record.breakthroughMarkedAt)
    || !nullableString(record.breakthroughDroppedAt)) {
    return { valid: false, reason: "invalid-breakthrough" };
  }

  return { valid: true, record: structuredClone(record) };
}

function restoredCounts(data) {
  return Object.fromEntries(STORE_NAMES.map((storeName) => [storeName, data[storeName].length]));
}

function portableRecords(storeName, records) {
  if (storeName !== "settings") {
    return records;
  }

  return records.filter((record) => !NON_PORTABLE_SETTINGS_KEYS.includes(record.key));
}

function invalidResult(code, details = {}) {
  return {
    available: true,
    status: "Invalid",
    payload: null,
    error: {
      code,
      ...details,
    },
  };
}

function backupFileName(exportedAt) {
  return `${APP_ID}-backup-${String(exportedAt).slice(0, 10)}.json`;
}

function safeFileName(name) {
  const value = String(name || "").trim();
  return value && !/[\\/]/.test(value) ? value : "";
}

function isoString(value) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isDayID(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isIsoLikeString(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value) {
  return value === null || typeof value === "string";
}

function isValidChip(chip) {
  return isPlainObject(chip) && nonEmptyString(chip.id) && typeof chip.label === "string";
}

function hasOversizedString(value) {
  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH;
  }

  if (Array.isArray(value)) {
    return value.some(hasOversizedString);
  }

  if (isPlainObject(value)) {
    return Object.values(value).some(hasOversizedString);
  }

  return false;
}

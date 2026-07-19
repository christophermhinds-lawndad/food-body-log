import { openAppDb } from "./storage.js";

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
const MEAL_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snack"]);
const MEAL_STATES = Object.freeze(["notLogged", "logged", "skipped"]);
const MEAL_ANSWERS = Object.freeze(["yes", "no", "unanswered"]);
const BREAKTHROUGH_STATES = Object.freeze(["none", "marked", "dropped"]);
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  payload: null,
  fileName: "",
});

export const BACKUP_COPY = Object.freeze({
  exportReady: "Backup is ready to save.",
  importReady: "Backup is ready to restore.",
  importComplete: "Backup restored on this device.",
  invalidBackup: "Choose a Food Body Log backup JSON file.",
});

export async function exportLocalData(options = {}) {
  return withDb(async (db) => {
    const exportedAt = isoString(options.now || new Date());
    const dataEntries = await Promise.all(STORE_NAMES.map(async (storeName) => [
      storeName,
      await getAllRecords(db, storeName),
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

export async function importSelectedBackup(file) {
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

    return replaceLocalDataFromBackup(parsed.payload);
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

export function createDownloadSpec(payload, fileName = backupFileName(isoString(new Date()))) {
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

  if (!nonEmptyString(record.promptID)
    || typeof record.promptText !== "string"
    || typeof record.supportsChips !== "boolean"
    || typeof record.supportsDetail !== "boolean"
    || typeof record.text !== "string"
    || typeof record.detail !== "string") {
    return { valid: false, reason: "invalid-answer-shape" };
  }

  if (!Array.isArray(record.selectedChips) || !record.selectedChips.every(isValidChip)) {
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
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

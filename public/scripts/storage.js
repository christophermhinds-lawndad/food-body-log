const DB_NAME = "food-body-log";
const DB_VERSION = 3;
const SETTINGS_STORE = "settings";
const DAYS_STORE = "days";
const MEALS_STORE = "meals";
const WEIGHTS_STORE = "weights";
const JOURNAL_ANSWERS_STORE = "journalAnswers";
const SETUP_STATUS_KEY = "setup-status";
const UNAVAILABLE = Object.freeze({
  available: false,
  status: "Unavailable",
  value: null,
});

export function openAppDb() {
  if (!("indexedDB" in globalThis) || !globalThis.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(DAYS_STORE)) {
        db.createObjectStore(DAYS_STORE, { keyPath: "dayID" });
      }

      if (!db.objectStoreNames.contains(MEALS_STORE)) {
        const mealsStore = db.createObjectStore(MEALS_STORE, { keyPath: "id" });
        mealsStore.createIndex("byDay", "dayID", { unique: false });
        mealsStore.createIndex("byDaySlot", ["dayID", "slot"], { unique: true });
      }

      if (!db.objectStoreNames.contains(WEIGHTS_STORE)) {
        db.createObjectStore(WEIGHTS_STORE, { keyPath: "dayID" });
      }

      if (!db.objectStoreNames.contains(JOURNAL_ANSWERS_STORE)) {
        const journalAnswersStore = db.createObjectStore(JOURNAL_ANSWERS_STORE, { keyPath: "id" });
        journalAnswersStore.createIndex("byDay", "dayID", { unique: false });
        journalAnswersStore.createIndex("byBreakthrough", "breakthroughState", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function writeSetupStatus(status) {
  try {
    const db = await openAppDb();

    if (!db) {
      return { ...UNAVAILABLE };
    }

    const value = {
      ...status,
      key: SETUP_STATUS_KEY,
      checkedAt: new Date().toISOString(),
    };

    await putRecord(db, value);
    db.close?.();

    return {
      available: true,
      status: "Ready",
      value,
    };
  } catch {
    return { ...UNAVAILABLE };
  }
}

export async function readSetupStatus() {
  try {
    const db = await openAppDb();

    if (!db) {
      return { ...UNAVAILABLE };
    }

    const value = await getRecord(db, SETUP_STATUS_KEY);
    const recordCount = await getRecordCount(db, value);
    db.close?.();

    return {
      available: true,
      status: value ? "Ready" : "Not ready",
      value: value || null,
      meta: { recordCount },
    };
  } catch {
    return { ...UNAVAILABLE };
  }
}

function putRecord(db, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS_STORE, "readwrite").objectStore(SETTINGS_STORE).put(value);

    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

function getRecord(db, key) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getRecordCount(db, fallbackValue) {
  return new Promise((resolve, reject) => {
    const store = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE);

    if (typeof store.count !== "function") {
      resolve(fallbackValue ? 1 : 0);
      return;
    }

    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

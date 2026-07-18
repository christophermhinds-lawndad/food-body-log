const DB_NAME = "food-body-log";
const DB_VERSION = 1;
const SETTINGS_STORE = "settings";
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
      key: SETUP_STATUS_KEY,
      checkedAt: new Date().toISOString(),
      ...status,
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
    db.close?.();

    return {
      available: true,
      status: value ? "Ready" : "Not ready",
      value: value || null,
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

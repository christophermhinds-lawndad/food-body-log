import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FIXED_NOW = new Date(2026, 6, 18, 8, 30, 0);
const FIXED_NOW_ISO = "2026-07-18T13:30:00.000Z";
const STORE_NAMES = ["settings", "days", "meals", "weights", "journalAnswers"];

class FakeObjectStore {
  constructor(store, transaction = null) {
    this.store = store;
    this.transaction = transaction;
  }

  createIndex(name, keyPath, options) {
    this.store.indexes.set(name, { keyPath, options });
    return { name, keyPath, options };
  }

  clear() {
    if (this.store.shouldFailClear?.()) {
      const error = new Error("failed clear");
      this.transaction?.fail(error);
      return requestThatFails(error);
    }

    if (this.transaction?.mode === "readwrite") {
      this.transaction.stageClear(this.store);
    } else {
      this.store.records.clear();
    }

    this.transaction?.queueCompletion();
    return requestThatSucceeds(undefined);
  }

  put(value) {
    const record = structuredClone(value);
    if (this.store.shouldFailPut?.(record)) {
      const error = new Error(`failed put for ${record.id || record.dayID || record.key}`);
      this.transaction?.fail(error);
      return requestThatFails(error);
    }

    const key = record[this.store.keyPath];
    if (this.transaction?.mode === "readwrite") {
      this.transaction.stagePut(this.store, key, record);
    } else {
      this.store.records.set(key, record);
    }

    this.transaction?.queueCompletion();
    return requestThatSucceeds(key);
  }

  getAll() {
    return requestThatSucceeds(Array.from(this.store.records.values()).map((record) => structuredClone(record)));
  }
}

class FakeStoreState {
  constructor(keyPath) {
    this.keyPath = keyPath;
    this.records = new Map();
    this.indexes = new Map();
    this.shouldFailClear = null;
    this.shouldFailPut = null;
  }
}

class FakeTransaction {
  constructor(stores, mode, tracker, names) {
    this.stores = stores;
    this.mode = mode;
    this.tracker = tracker;
    this.names = names;
    this.pendingOps = [];
    this.failed = false;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.completionQueued = false;
    this.tracker.transactions.push({ mode, names: [...names] });
  }

  objectStore(name) {
    const store = this.stores.get(name);
    assert.ok(store, `missing object store ${name}`);
    return new FakeObjectStore(store, this);
  }

  stageClear(store) {
    this.pendingOps.push({ type: "clear", store });
  }

  stagePut(store, key, value) {
    this.pendingOps.push({ type: "put", store, key, value: structuredClone(value) });
  }

  fail(error) {
    this.failed = true;
    this.error = error;
    this.queueCompletion();
  }

  queueCompletion() {
    if (this.completionQueued) {
      return;
    }

    this.completionQueued = true;
    queueMicrotask(() => {
      queueMicrotask(() => {
        if (this.failed) {
          this.onabort?.();
          this.onerror?.();
          return;
        }

        for (const op of this.pendingOps) {
          if (op.type === "clear") {
            op.store.records.clear();
          } else {
            op.store.records.set(op.key, structuredClone(op.value));
          }
        }

        this.oncomplete?.();
      });
    });
  }
}

class FakeDb {
  constructor() {
    this.stores = new Map();
    this.transactions = [];
    this.closeCount = 0;
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name),
    };
  }

  createObjectStore(name, options) {
    const store = new FakeStoreState(options.keyPath);
    this.stores.set(name, store);
    return new FakeObjectStore(store);
  }

  transaction(names, mode) {
    const storeNames = Array.isArray(names) ? names : [names];
    for (const name of storeNames) {
      assert.ok(this.stores.has(name), `transaction requested missing store ${name}`);
    }
    assert.match(mode, /readonly|readwrite/);
    return new FakeTransaction(this.stores, mode, this, storeNames);
  }

  close() {
    this.closeCount += 1;
  }
}

function installFakeIndexedDb() {
  const db = new FakeDb();

  globalThis.indexedDB = {
    open(name, version) {
      assert.equal(name, "food-body-log");
      assert.equal(version, 3);

      const request = { result: db, error: null };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };

  return db;
}

function requestThatSucceeds(result) {
  const request = { result, error: null };
  queueMicrotask(() => request.onsuccess?.());
  return request;
}

function requestThatFails(error) {
  const request = { result: undefined, error };
  queueMicrotask(() => request.onerror?.());
  return request;
}

async function loadModules(suffix) {
  const db = installFakeIndexedDb();
  const storage = await import(`../public/scripts/storage.js?portability=${suffix}`);
  const dataPortability = await import(`../public/scripts/data-portability.js?portability=${suffix}`);
  const initializedDb = await storage.openAppDb();
  initializedDb.close?.();

  return { db, dataPortability };
}

function seedRecord(db, storeName, record) {
  db.stores.get(storeName).records.set(record.id || record.dayID || record.key, structuredClone(record));
}

function seedPortableRecords(db, suffix = "") {
  seedRecord(db, "settings", {
    key: `setup-status${suffix}`,
    installMode: "browser",
    cacheStatus: "ready",
    checkedAt: "2026-07-18T08:00:00.000Z",
  });
  seedRecord(db, "days", {
    dayID: `2026-07-1${suffix || "7"}`,
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T20:00:00.000Z",
  });
  seedRecord(db, "meals", {
    id: "2026-07-17:breakfast",
    dayID: "2026-07-17",
    slot: "breakfast",
    slotLabel: "Breakfast",
    plannedText: "Oatmeal",
    logState: "logged",
    ateWhenHungry: "yes",
    stoppedAtEnough: "no",
    loggedAt: "2026-07-17T08:15:00.000Z",
    createdAt: "2026-07-17T08:00:00.000Z",
    updatedAt: "2026-07-17T08:15:00.000Z",
  });
  seedRecord(db, "weights", {
    dayID: "2026-07-17",
    value: 184.4,
    updatedAt: "2026-07-17T07:30:00.000Z",
  });
  seedRecord(db, "journalAnswers", {
    id: "2026-07-17:journal:baseline-feeling",
    dayID: "2026-07-17",
    promptID: "baseline-feeling",
    promptText: "How was I feeling around food today?",
    supportsChips: true,
    supportsDetail: true,
    text: "A steady breakfast helped.",
    selectedChips: [{ id: "rushed", label: "Rushed" }],
    detail: "Packed the bag first.",
    breakthroughState: "marked",
    breakthroughMarkedAt: "2026-07-17T21:00:00.000Z",
    breakthroughDroppedAt: null,
    createdAt: "2026-07-17T20:00:00.000Z",
    updatedAt: "2026-07-17T21:00:00.000Z",
  });
}

function recordsByKey(db, storeName) {
  return Object.fromEntries(Array.from(db.stores.get(storeName).records.entries())
    .map(([key, value]) => [key, structuredClone(value)]));
}

function snapshotStores(db) {
  return Object.fromEntries(STORE_NAMES.map((storeName) => [
    storeName,
    {
      keys: Array.from(db.stores.get(storeName).records.keys()).sort(),
      records: recordsByKey(db, storeName),
    },
  ]));
}

function clonePayload(payload) {
  return structuredClone(payload);
}

test("exportLocalData returns a versioned JSON envelope with all local stores", async () => {
  const { db, dataPortability } = await loadModules("export");
  seedPortableRecords(db);

  const result = await dataPortability.exportLocalData({ now: FIXED_NOW });

  assert.equal(result.available, true);
  assert.equal(result.status, "Ready");
  assert.match(result.fileName, /^food-body-log-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(result.payload.app, "food-body-log");
  assert.equal(result.payload.exportVersion, 1);
  assert.equal(result.payload.dbName, "food-body-log");
  assert.equal(result.payload.dbVersion, 3);
  assert.equal(result.payload.exportedAt, FIXED_NOW_ISO);
  assert.deepEqual(Object.keys(result.payload.data).sort(), [...STORE_NAMES].sort());
  assert.deepEqual(result.payload.data.settings, Object.values(recordsByKey(db, "settings")));
  assert.deepEqual(result.payload.data.days, Object.values(recordsByKey(db, "days")));
  assert.deepEqual(result.payload.data.meals, Object.values(recordsByKey(db, "meals")));
  assert.deepEqual(result.payload.data.weights, Object.values(recordsByKey(db, "weights")));
  assert.deepEqual(result.payload.data.journalAnswers, Object.values(recordsByKey(db, "journalAnswers")));
  assert.doesNotMatch(JSON.stringify(result.payload), /\bbackend\b|\bnetwork\b|\bcache\b/i);
  assert.ok(db.transactions.every((transaction) => transaction.mode === "readonly"));
});

test("parseBackupText validates JSON and normalizes a backup payload", async () => {
  const { db, dataPortability } = await loadModules("parse");
  seedPortableRecords(db);

  const exported = await dataPortability.exportLocalData({ now: FIXED_NOW });
  const parsed = dataPortability.parseBackupText(JSON.stringify(exported.payload));
  const malformed = dataPortability.parseBackupText("{not-json");

  assert.equal(parsed.status, "Ready");
  assert.deepEqual(parsed.payload, exported.payload);
  assert.equal(malformed.status, "Invalid");
  assert.equal(malformed.error.code, "invalid-json");
});

test("replaceLocalDataFromBackup clears prior records and restores exported data atomically", async () => {
  const first = await loadModules("round-trip-source");
  seedPortableRecords(first.db);
  const exported = await first.dataPortability.exportLocalData({ now: FIXED_NOW });
  const expected = clonePayload(exported.payload);

  const second = await loadModules("round-trip-target");
  seedRecord(second.db, "settings", { key: "old-setting", stale: true });
  seedRecord(second.db, "days", { dayID: "2026-07-01", stale: true });
  seedRecord(second.db, "meals", {
    id: "2026-07-01:lunch",
    dayID: "2026-07-01",
    slot: "lunch",
    slotLabel: "Lunch",
    plannedText: "Old",
    logState: "notLogged",
    ateWhenHungry: "unanswered",
    stoppedAtEnough: "unanswered",
    loggedAt: null,
  });
  seedRecord(second.db, "weights", { dayID: "2026-07-01", value: 199 });
  seedRecord(second.db, "journalAnswers", {
    id: "2026-07-01:journal:baseline-feeling",
    dayID: "2026-07-01",
    promptID: "baseline-feeling",
    promptText: "Old",
    supportsChips: false,
    supportsDetail: false,
    text: "Old",
    selectedChips: [],
    detail: "",
    breakthroughState: "none",
    breakthroughMarkedAt: null,
    breakthroughDroppedAt: null,
  });

  const result = await second.dataPortability.replaceLocalDataFromBackup(expected);
  const readwriteTransactions = second.db.transactions.filter((transaction) => transaction.mode === "readwrite");

  assert.equal(result.available, true);
  assert.equal(result.status, "Ready");
  assert.equal(result.restoredCounts.settings, 1);
  assert.equal(result.restoredCounts.days, 1);
  assert.equal(result.restoredCounts.meals, 1);
  assert.equal(result.restoredCounts.weights, 1);
  assert.equal(result.restoredCounts.journalAnswers, 1);
  assert.deepEqual(snapshotStores(second.db).settings.records, keyBy(expected.data.settings, "key"));
  assert.deepEqual(snapshotStores(second.db).days.records, keyBy(expected.data.days, "dayID"));
  assert.deepEqual(snapshotStores(second.db).meals.records, keyBy(expected.data.meals, "id"));
  assert.deepEqual(snapshotStores(second.db).weights.records, keyBy(expected.data.weights, "dayID"));
  assert.deepEqual(snapshotStores(second.db).journalAnswers.records, keyBy(expected.data.journalAnswers, "id"));
  assert.equal(readwriteTransactions.length, 1);
  assert.deepEqual(readwriteTransactions[0].names, STORE_NAMES);
});

test("invalid backups are rejected before any write transaction opens", async () => {
  const { db, dataPortability } = await loadModules("invalid-no-write");
  seedPortableRecords(db);
  const exported = await dataPortability.exportLocalData({ now: FIXED_NOW });
  const original = snapshotStores(db);
  const readwriteCount = () => db.transactions.filter((transaction) => transaction.mode === "readwrite").length;

  const invalidPayloads = [
    ["unsupported app", { ...clonePayload(exported.payload), app: "other-app" }, "unsupported-backup"],
    ["unsupported version", { ...clonePayload(exported.payload), exportVersion: 2 }, "unsupported-backup"],
    ["missing store array", (() => {
      const payload = clonePayload(exported.payload);
      delete payload.data.weights;
      return payload;
    })(), "missing-store"],
    ["malformed setting", (() => {
      const payload = clonePayload(exported.payload);
      payload.data.settings = [{ checkedAt: "2026-07-18T08:00:00.000Z" }];
      return payload;
    })(), "invalid-record"],
    ["bad day id", (() => {
      const payload = clonePayload(exported.payload);
      payload.data.days[0].dayID = "07/17/2026";
      return payload;
    })(), "invalid-record"],
    ["bad meal state", (() => {
      const payload = clonePayload(exported.payload);
      payload.data.meals[0].logState = "done";
      return payload;
    })(), "invalid-record"],
    ["bad answer enum value", (() => {
      const payload = clonePayload(exported.payload);
      payload.data.meals[0].ateWhenHungry = "sometimes";
      return payload;
    })(), "invalid-record"],
    ["bad journal chip value", (() => {
      const payload = clonePayload(exported.payload);
      payload.data.journalAnswers[0].selectedChips = [{ id: "", label: "Missing" }];
      return payload;
    })(), "invalid-record"],
  ];

  for (const [name, payload, code] of invalidPayloads) {
    const beforeWrites = readwriteCount();
    const result = await dataPortability.replaceLocalDataFromBackup(payload);

    assert.equal(result.status, "Invalid", name);
    assert.equal(result.error.code, code, name);
    assert.equal(readwriteCount(), beforeWrites, name);
    assert.deepEqual(snapshotStores(db), original, name);
  }
});

test("importSelectedBackup rejects oversized file metadata without reading or writing", async () => {
  const { db, dataPortability } = await loadModules("oversized");
  seedPortableRecords(db);
  const original = snapshotStores(db);
  let textCalled = false;

  const result = await dataPortability.importSelectedBackup({
    name: "backup.json",
    size: 2_000_001,
    text: async () => {
      textCalled = true;
      return "{}";
    },
  });

  assert.equal(result.status, "Invalid");
  assert.equal(result.error.code, "file-too-large");
  assert.equal(textCalled, false);
  assert.deepEqual(snapshotStores(db), original);
  assert.equal(db.transactions.filter((transaction) => transaction.mode === "readwrite").length, 0);
});

test("createDownloadSpec returns user-save JSON text without browser cache or URL side effects", async () => {
  const { db, dataPortability } = await loadModules("download-spec");
  seedPortableRecords(db);

  const exported = await dataPortability.exportLocalData({ now: FIXED_NOW });
  const spec = dataPortability.createDownloadSpec(exported.payload);

  assert.equal(spec.available, true);
  assert.equal(spec.status, "Ready");
  assert.equal(spec.fileName, exported.fileName);
  assert.equal(spec.mimeType, "application/json");
  assert.equal(spec.text.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(spec.text), exported.payload);
});

test("data portability source remains local-only and avoids sensitive cache boundaries", async () => {
  const source = await readFile(new URL("../public/scripts/data-portability.js", import.meta.url), "utf8");

  assert.match(source, /from "\.\/storage\.js"/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bsendBeacon\b/);
  assert.doesNotMatch(source, /\bcaches\b/);
  assert.doesNotMatch(source, /\bCacheStorage\b/);
  assert.doesNotMatch(source, /\blocalStorage\b/);
  assert.doesNotMatch(source, /\bhttps?:\/\//);
  assert.doesNotMatch(source, /\bapi\/|backend|analytics|node_modules|package\.json|child_process|exec\(/i);
  assert.doesNotMatch(source, /\binnerHTML\b|\binsertAdjacentHTML\b|\bDOMParser\b|\bdangerouslySetInnerHTML\b/);
  assert.doesNotMatch(source, /\bcreateObjectURL\b|\brevokeObjectURL\b|\bBlob\b/);
});

function keyBy(records, key) {
  return Object.fromEntries(records.map((record) => [record[key], record]));
}

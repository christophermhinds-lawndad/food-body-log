import assert from "node:assert/strict";
import test from "node:test";

class FakeObjectStore {
  constructor(store) {
    this.store = store;
    this.records = store.records;
  }

  createIndex(name, keyPath, options) {
    this.store.indexes.set(name, { keyPath, options });
    return { name, keyPath, options };
  }

  put(value) {
    const key = value[this.store.keyPath];
    this.records.set(key, structuredClone(value));
    return requestThatSucceeds(key);
  }

  get(key) {
    return requestThatSucceeds(this.records.get(key));
  }

  count() {
    return requestThatSucceeds(this.records.size);
  }
}

class FakeStoreState {
  constructor(keyPath) {
    this.keyPath = keyPath;
    this.records = new Map();
    this.indexes = new Map();
  }
}

class FakeTransaction {
  constructor(stores) {
    this.stores = stores;
  }

  objectStore(name) {
    const store = this.stores.get(name);

    assert.ok(store, `missing object store ${name}`);
    return new FakeObjectStore(store);
  }
}

class FakeDb {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name),
    };
  }

  createObjectStore(name, options) {
    assert.ok(options?.keyPath, `${name} store needs a keyPath`);
    const store = new FakeStoreState(options.keyPath);
    this.stores.set(name, store);
    return new FakeObjectStore(store);
  }

  transaction(names, mode) {
    for (const name of Array.isArray(names) ? names : [names]) {
      assert.ok(this.stores.has(name), `transaction requested missing store ${name}`);
    }
    assert.match(mode, /readonly|readwrite/);
    return new FakeTransaction(this.stores);
  }

  close() {}
}

function requestThatSucceeds(result) {
  const request = { result, error: null };
  queueMicrotask(() => request.onsuccess?.());
  return request;
}

function installFakeIndexedDb() {
  const db = new FakeDb();

  globalThis.indexedDB = {
    open(name, version) {
      assert.equal(name, "food-body-log");
      assert.equal(version, 2);

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

test("storage adapter opens version 2 settings and daily tracking stores", async () => {
  const db = installFakeIndexedDb();
  const storage = await import("../public/scripts/storage.js");

  const writeResult = await storage.writeSetupStatus({
    checkedAt: "2026-07-18T04:00:00.000Z",
    storage: "Ready",
  });

  assert.equal(writeResult.available, true);
  assert.deepEqual(Array.from(db.stores.keys()).sort(), ["days", "meals", "settings", "weights"]);
  assert.equal(db.stores.get("settings").keyPath, "key");
  assert.equal(db.stores.get("days").keyPath, "dayID");
  assert.equal(db.stores.get("meals").keyPath, "id");
  assert.equal(db.stores.get("weights").keyPath, "dayID");
  assert.ok(db.stores.get("meals").indexes.has("byDay"));
  assert.ok(db.stores.get("meals").indexes.has("byDaySlot"));
});

test("setup status writes update one stable settings record", async () => {
  installFakeIndexedDb();
  const storage = await import(`../public/scripts/storage.js?idempotent=${Date.now()}`);

  await storage.writeSetupStatus({
    storage: "Checking",
    offlineCache: "Not ready",
  });
  const secondWrite = await storage.writeSetupStatus({
    storage: "Ready",
    offlineCache: "Ready",
  });
  const readResult = await storage.readSetupStatus();

  assert.equal(secondWrite.available, true);
  assert.equal(readResult.value.key, "setup-status");
  assert.equal(readResult.value.storage, "Ready");
  assert.equal(readResult.value.offlineCache, "Ready");
  assert.equal(readResult.meta.recordCount, 1);
});

test("setup status writes preserve storage-owned key and timestamp", async () => {
  installFakeIndexedDb();
  const storage = await import(`../public/scripts/storage.js?invariants=${Date.now()}`);

  const writeResult = await storage.writeSetupStatus({
    key: "caller-controlled-key",
    checkedAt: "2000-01-01T00:00:00.000Z",
    storage: "Ready",
  });
  const readResult = await storage.readSetupStatus();

  assert.equal(writeResult.available, true);
  assert.equal(writeResult.value.key, "setup-status");
  assert.notEqual(writeResult.value.checkedAt, "2000-01-01T00:00:00.000Z");
  assert.equal(readResult.value.key, "setup-status");
  assert.equal(readResult.value.checkedAt, writeResult.value.checkedAt);
  assert.equal(readResult.meta.recordCount, 1);
});

test("storage adapter returns neutral unavailable status when IndexedDB is missing", async () => {
  delete globalThis.indexedDB;
  const storage = await import(`../public/scripts/storage.js?missing=${Date.now()}`);

  const writeResult = await storage.writeSetupStatus({ storage: "Checking" });
  const readResult = await storage.readSetupStatus();

  assert.equal(writeResult.available, false);
  assert.equal(writeResult.status, "Unavailable");
  assert.equal(readResult.available, false);
  assert.equal(readResult.status, "Unavailable");
});

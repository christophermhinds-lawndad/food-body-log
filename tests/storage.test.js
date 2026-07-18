import assert from "node:assert/strict";
import test from "node:test";

class FakeObjectStore {
  constructor(records) {
    this.records = records;
  }

  put(value) {
    this.records.set(value.key, structuredClone(value));
    return requestThatSucceeds(value.key);
  }

  get(key) {
    return requestThatSucceeds(this.records.get(key));
  }
}

class FakeTransaction {
  constructor(records) {
    this.records = records;
  }

  objectStore() {
    return new FakeObjectStore(this.records);
  }
}

class FakeDb {
  constructor() {
    this.records = new Map();
    this.objectStoreNames = {
      contains: (name) => name === "settings" && this.hasSettingsStore,
    };
    this.hasSettingsStore = false;
  }

  createObjectStore(name, options) {
    assert.equal(name, "settings");
    assert.deepEqual(options, { keyPath: "key" });
    this.hasSettingsStore = true;
  }

  transaction(name, mode) {
    assert.equal(name, "settings");
    assert.match(mode, /readonly|readwrite/);
    return new FakeTransaction(this.records);
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
      assert.equal(version, 1);

      const request = { result: db, error: null };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test("storage adapter opens version 1 settings store and writes/reads setup status", async () => {
  installFakeIndexedDb();
  const storage = await import("../public/scripts/storage.js");

  const writeResult = await storage.writeSetupStatus({
    checkedAt: "2026-07-18T04:00:00.000Z",
    storage: "Ready",
  });

  assert.equal(writeResult.available, true);
  assert.equal(writeResult.value.key, "setup-status");
  assert.equal(writeResult.value.storage, "Ready");

  const readResult = await storage.readSetupStatus();

  assert.equal(readResult.available, true);
  assert.equal(readResult.value.key, "setup-status");
  assert.equal(readResult.value.storage, "Ready");
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

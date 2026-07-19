import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FIXED_NOW = new Date(2026, 6, 18, 8, 30, 0);
const EDITABLE_DAY_ID = "2026-07-17";
const READ_ONLY_DAY_ID = "2026-07-13";

class FakeObjectStore {
  constructor(store, transaction = null) {
    this.store = store;
    this.transaction = transaction;
  }

  createIndex(name, keyPath, options) {
    this.store.indexes.set(name, { keyPath, options });
    return { name, keyPath, options };
  }

  put(value) {
    const record = structuredClone(value);

    if (this.store.shouldFailPut?.(record)) {
      const error = new Error(`failed put for ${record.id || record.dayID || record.key}`);
      this.transaction?.fail(error);
      return requestThatFails(error);
    }

    if (this.transaction?.mode === "readwrite") {
      this.transaction.stage(this.store, record[this.store.keyPath], record);
    } else {
      this.store.records.set(record[this.store.keyPath], record);
    }

    this.transaction?.queueCompletion();
    return requestThatSucceeds(record[this.store.keyPath]);
  }

  get(key) {
    return requestThatSucceeds(structuredClone(this.store.records.get(key)));
  }

  getAll() {
    return requestThatSucceeds(Array.from(this.store.records.values()).map((record) => structuredClone(record)));
  }

  count() {
    return requestThatSucceeds(this.store.records.size);
  }

  index(name) {
    const index = this.store.indexes.get(name);
    assert.ok(index, `missing index ${name}`);
    return new FakeIndex(this.store, index.keyPath);
  }
}

class FakeIndex {
  constructor(store, keyPath) {
    this.store = store;
    this.keyPath = keyPath;
  }

  getAll(queryKey) {
    return requestThatSucceeds(Array.from(this.store.records.values())
      .filter((record) => keyMatches(readKey(record, this.keyPath), queryKey))
      .map((record) => structuredClone(record)));
  }
}

class FakeStoreState {
  constructor(keyPath) {
    this.keyPath = keyPath;
    this.records = new Map();
    this.indexes = new Map();
    this.shouldFailPut = null;
  }
}

class FakeTransaction {
  constructor(stores, mode, tracker) {
    this.stores = stores;
    this.mode = mode;
    this.tracker = tracker;
    this.pendingWrites = [];
    this.failed = false;
    this.error = null;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.completionQueued = false;
    this.tracker.transactions.push(mode);
  }

  objectStore(name) {
    const store = this.stores.get(name);
    assert.ok(store, `missing object store ${name}`);
    return new FakeObjectStore(store, this);
  }

  stage(store, key, value) {
    this.pendingWrites.push({ store, key, value: structuredClone(value) });
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

        for (const write of this.pendingWrites) {
          write.store.records.set(write.key, structuredClone(write.value));
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
    for (const name of Array.isArray(names) ? names : [names]) {
      assert.ok(this.stores.has(name), `transaction requested missing store ${name}`);
    }
    assert.match(mode, /readonly|readwrite/);
    return new FakeTransaction(this.stores, mode, this);
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

function readKey(record, keyPath) {
  return Array.isArray(keyPath) ? keyPath.map((path) => record[path]) : record[keyPath];
}

function keyMatches(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

async function loadModules(suffix) {
  const db = installFakeIndexedDb();
  const storage = await import(`../public/scripts/storage.js?history=${suffix}`);
  const trackingModel = await import(`../public/scripts/tracking-model.js?history=${suffix}`);
  const journalModel = await import(`../public/scripts/journal-model.js?history=${suffix}`);
  const historyReports = await import(`../public/scripts/history-reports.js?history=${suffix}`);
  const initializedDb = await storage.openAppDb();
  initializedDb.close?.();

  return { db, historyReports, journalModel, trackingModel };
}

function seedRecord(db, storeName, record) {
  db.stores.get(storeName).records.set(record.id || record.dayID || record.key, structuredClone(record));
}

function seedDay(db, dayID, options = {}) {
  seedRecord(db, "days", {
    dayID,
    createdAt: options.createdAt || `${dayID}T08:00:00.000Z`,
    updatedAt: options.updatedAt || `${dayID}T20:00:00.000Z`,
  });
}

function seedMeal(db, dayID, slot, overrides = {}) {
  seedRecord(db, "meals", {
    id: `${dayID}:${slot}`,
    dayID,
    slot,
    slotLabel: {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snack: "Optional Snack",
    }[slot],
    plannedText: "",
    logState: "notLogged",
    ateWhenHungry: "unanswered",
    stoppedAtEnough: "unanswered",
    loggedAt: null,
    createdAt: `${dayID}T08:00:00.000Z`,
    updatedAt: `${dayID}T08:00:00.000Z`,
    ...overrides,
  });
}

function seedWeight(db, dayID, value) {
  seedRecord(db, "weights", {
    dayID,
    value,
    updatedAt: `${dayID}T07:30:00.000Z`,
  });
}

function seedAnswer(db, dayID, promptID, overrides = {}) {
  seedRecord(db, "journalAnswers", {
    id: `${dayID}:journal:${promptID}`,
    dayID,
    promptID,
    promptText: `Prompt ${promptID}`,
    supportsChips: false,
    supportsDetail: false,
    text: "",
    selectedChips: [],
    detail: "",
    breakthroughState: "none",
    breakthroughMarkedAt: null,
    breakthroughDroppedAt: null,
    createdAt: `${dayID}T20:00:00.000Z`,
    updatedAt: `${dayID}T20:00:00.000Z`,
    ...overrides,
  });
}

test("history state lists only saved-content days newest first without mutating storage", async () => {
  const { db, historyReports } = await loadModules("history-state");
  seedDay(db, "2026-07-10");
  seedDay(db, "2026-07-14");
  seedDay(db, EDITABLE_DAY_ID);
  seedMeal(db, "2026-07-14", "lunch", { plannedText: "Rice bowl" });
  seedMeal(db, EDITABLE_DAY_ID, "breakfast", { logState: "skipped" });

  const before = snapshotStores(db);
  const state = await historyReports.getHistoryState({ now: FIXED_NOW });
  const after = snapshotStores(db);

  assert.equal(state.available, true);
  assert.equal(state.status, "Ready");
  assert.deepEqual(state.days.map((day) => day.dayID), [EDITABLE_DAY_ID, "2026-07-14"]);
  assert.deepEqual(state.days[0].content, {
    hasMeals: true,
    hasWeight: false,
    hasReflection: false,
    hasBreakthroughs: false,
  });
  assert.equal(state.days[0].editStatus, "Editable");
  assert.equal(state.days[1].editStatus, "ReadOnly");
  assert.deepEqual(after, before);
  assert.ok(db.transactions.every((mode) => mode === "readonly"));
});

test("history day returns display-only fixed meal order, neutral fallbacks, answers, and edit status", async () => {
  const { db, historyReports } = await loadModules("history-day");
  seedDay(db, EDITABLE_DAY_ID);
  seedMeal(db, EDITABLE_DAY_ID, "dinner", {
    plannedText: "Soup",
    logState: "logged",
    ateWhenHungry: "yes",
    stoppedAtEnough: "no",
  });
  seedMeal(db, EDITABLE_DAY_ID, "breakfast", { plannedText: "Oatmeal" });
  seedWeight(db, EDITABLE_DAY_ID, 184.4);
  seedAnswer(db, EDITABLE_DAY_ID, "baseline-feeling", {
    promptText: "How was I feeling around food today?",
    supportsChips: true,
    supportsDetail: true,
    text: "Calm dinner.",
    selectedChips: [{ id: "rushed", label: "Rushed" }],
    detail: "Longer note",
    breakthroughState: "marked",
    breakthroughMarkedAt: "2026-07-17T21:00:00.000Z",
  });

  const result = await historyReports.getHistoryDay(EDITABLE_DAY_ID, { now: FIXED_NOW });

  assert.equal(result.available, true);
  assert.equal(result.status, "Ready");
  assert.equal(result.editStatus, "Editable");
  assert.equal(result.day.dayID, EDITABLE_DAY_ID);
  assert.deepEqual(result.meals.map((meal) => meal.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.equal(result.meals[0].plannedText, "Oatmeal");
  assert.equal(result.meals[1].plannedText, "");
  assert.equal(result.meals[1].saved, false);
  assert.equal(result.meals[1].logState, "notLogged");
  assert.equal(result.weight.value, 184.4);
  assert.equal(result.answers[0].text, "Calm dinner.");
  assert.deepEqual(result.answers[0].selectedChips, [{ id: "rushed", label: "Rushed" }]);
  assert.equal(result.breakthroughs[0].id, `${EDITABLE_DAY_ID}:journal:baseline-feeling`);
  assert.deepEqual(snapshotStores(db).meals.keys.sort(), [`${EDITABLE_DAY_ID}:breakfast`, `${EDITABLE_DAY_ID}:dinner`]);
});

test("history save rejects read-only days before writes and preserves omitted siblings on scoped saves", async () => {
  const { db, historyReports } = await loadModules("history-save");
  seedDay(db, EDITABLE_DAY_ID);
  seedDay(db, READ_ONLY_DAY_ID);
  seedMeal(db, EDITABLE_DAY_ID, "breakfast", { plannedText: "Oatmeal" });
  seedMeal(db, EDITABLE_DAY_ID, "lunch", {
    plannedText: "Rice bowl",
    logState: "logged",
    ateWhenHungry: "yes",
    stoppedAtEnough: "yes",
  });
  seedWeight(db, EDITABLE_DAY_ID, 184.2);
  seedAnswer(db, EDITABLE_DAY_ID, "baseline-helped", { text: "Soup helped." });

  const transactionCountBeforeReadOnly = db.transactions.length;
  const readOnlyResult = await historyReports.saveHistoryDay(READ_ONLY_DAY_ID, {
    weight: { value: 199 },
  }, { now: FIXED_NOW });
  const readOnlyTransactions = db.transactions.slice(transactionCountBeforeReadOnly);
  const beforeEditableSave = snapshotStores(db);
  const editableResult = await historyReports.saveHistoryDay(EDITABLE_DAY_ID, {
    meals: {
      breakfast: { plannedText: "Eggs" },
    },
    answers: {
      "baseline-helped": { text: "Soup still helped." },
    },
  }, { now: new Date(2026, 6, 18, 9, 15, 0) });
  const meals = recordsByKey(db, "meals");
  const answers = recordsByKey(db, "journalAnswers");
  const weights = recordsByKey(db, "weights");

  assert.equal(readOnlyResult.available, true);
  assert.equal(readOnlyResult.status, "ReadOnly");
  assert.deepEqual(readOnlyResult.error, { code: "day-read-only", dayID: READ_ONLY_DAY_ID });
  assert.deepEqual(readOnlyTransactions, [], "read-only rejection must happen before opening transactions");

  assert.equal(editableResult.status, "Ready");
  assert.equal(meals[`${EDITABLE_DAY_ID}:breakfast`].plannedText, "Eggs");
  assert.equal(meals[`${EDITABLE_DAY_ID}:lunch`].plannedText, "Rice bowl");
  assert.equal(meals[`${EDITABLE_DAY_ID}:lunch`].logState, "logged");
  assert.equal(answers[`${EDITABLE_DAY_ID}:journal:baseline-helped`].text, "Soup still helped.");
  assert.equal(weights[EDITABLE_DAY_ID].value, beforeEditableSave.weights.records[EDITABLE_DAY_ID].value);
});

test("history weight save reuses Today large-change confirmation before updating weight", async () => {
  const { db, historyReports } = await loadModules("history-weight-confirmation");
  seedDay(db, "2026-07-16");
  seedDay(db, EDITABLE_DAY_ID);
  seedWeight(db, "2026-07-16", 184);

  const warning = await historyReports.saveHistoryDay(EDITABLE_DAY_ID, {
    weight: { value: "190.2" },
  }, { now: FIXED_NOW });
  const afterWarning = recordsByKey(db, "weights");
  const confirmed = await historyReports.saveHistoryDay(EDITABLE_DAY_ID, {
    weight: { value: "190.2" },
  }, { now: FIXED_NOW, confirmLargeChange: true });

  assert.equal(warning.status, "NeedsConfirmation");
  assert.deepEqual(warning.warning, {
    code: "possible-weight-typo",
    dayID: EDITABLE_DAY_ID,
    priorDayID: "2026-07-16",
    priorValue: 184,
    value: 190.2,
    difference: 6.199999999999989,
  });
  assert.equal(afterWarning[EDITABLE_DAY_ID], undefined);
  assert.equal(confirmed.status, "Ready");
  assert.equal(recordsByKey(db, "weights")[EDITABLE_DAY_ID].value, 190.2);
});

test("reports expose trailing weight averages and sparse meal metric states", async () => {
  const { db, historyReports } = await loadModules("reports-state");
  seedWeight(db, "2026-07-18", 186);
  seedWeight(db, "2026-07-17", 184);
  seedWeight(db, "2026-07-12", 180);
  seedWeight(db, "2026-06-30", 178);
  seedMeal(db, "2026-07-18", "breakfast", {
    logState: "logged",
    ateWhenHungry: "yes",
    stoppedAtEnough: "yes",
  });
  seedMeal(db, "2026-07-18", "lunch", {
    logState: "logged",
    ateWhenHungry: "no",
    stoppedAtEnough: "yes",
  });
  seedMeal(db, "2026-07-18", "dinner", {
    logState: "skipped",
    ateWhenHungry: "unanswered",
    stoppedAtEnough: "unanswered",
  });
  seedMeal(db, "2026-07-17", "breakfast", {
    logState: "logged",
    ateWhenHungry: "yes",
    stoppedAtEnough: "unanswered",
  });

  const noWeight = historyReports.summarizeWeightAverages([], { now: FIXED_NOW });
  const oneMeal = historyReports.summarizeMealMetric([
    { dayID: "2026-07-18", logState: "logged", ateWhenHungry: "yes" },
  ], "ateWhenHungry", { now: FIXED_NOW });
  const state = await historyReports.getReportsState({ now: FIXED_NOW });

  assert.deepEqual(noWeight.map((summary) => summary.state), ["NoData", "NoData", "NoData"]);
  assert.equal(oneMeal.state, "Insufficient");
  assert.equal(oneMeal.percentage, null);
  assert.deepEqual(state.weightAverages.map((summary) => [summary.windowDays, summary.state, summary.count, summary.average]), [
    [7, "Ready", 3, 183.3],
    [30, "Ready", 4, 182],
    [90, "Ready", 4, 182],
  ]);
  assert.deepEqual(state.weightAverages.map((summary) => summary.periodLabel), [
    "Trailing 7 days",
    "Trailing 30 days",
    "Trailing 90 days",
  ]);
  assert.deepEqual(state.mealMetrics.map((summary) => [summary.metricName, summary.state, summary.yesCount, summary.denominator, summary.percentage]), [
    ["ateWhenHungry", "Ready", 2, 3, 67],
    ["stoppedAtEnough", "Ready", 2, 2, 100],
  ]);
  assert.equal(historyReports.formatWeightAverage(182), "182");
  assert.equal(historyReports.formatWeightAverage(183.3), "183.3");
});

test("history reports repository returns neutral unavailable results without IndexedDB", async () => {
  delete globalThis.indexedDB;
  const historyReports = await import(`../public/scripts/history-reports.js?missing=${Date.now()}`);

  const history = await historyReports.getHistoryState();
  const day = await historyReports.getHistoryDay(EDITABLE_DAY_ID);
  const save = await historyReports.saveHistoryDay(EDITABLE_DAY_ID, {});
  const reports = await historyReports.getReportsState();

  assert.equal(history.available, false);
  assert.equal(day.available, false);
  assert.equal(save.status, "Unavailable");
  assert.deepEqual(reports.weightAverages, []);
  assert.deepEqual(reports.mealMetrics, []);
});

test("history reports source stays local-only and avoids record-creating browse helpers", async () => {
  const source = await readFile(new URL("../public/scripts/history-reports.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bsendBeacon\b/);
  assert.doesNotMatch(source, /\bcaches\b/);
  assert.doesNotMatch(source, /\bCacheStorage\b/);
  assert.doesNotMatch(source, /\bhttps?:\/\//);
  assert.doesNotMatch(source, /\bapi\/|backend|analytics|node_modules|package\.json|child_process|exec\(/i);
  assert.doesNotMatch(source, /\bensureDay\b|\bensureMealsForDay\b|\bsavePlan\b|\bsaveMealLog\b|\bsaveWeight\b|\bsaveReflection\b/);
});

function recordsByKey(db, storeName) {
  return Object.fromEntries(Array.from(db.stores.get(storeName).records.entries())
    .map(([key, value]) => [key, structuredClone(value)]));
}

function snapshotStores(db) {
  return Object.fromEntries(Array.from(db.stores.entries())
    .map(([name, store]) => [
      name,
      {
        keys: Array.from(store.records.keys()).sort(),
        records: recordsByKey(db, name),
      },
    ]));
}

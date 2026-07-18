import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const DAY_ID = "2026-07-18";
const FIXED_NOW = new Date("2026-07-18T20:15:00.000Z");
const LATER_NOW = new Date("2026-07-18T21:30:00.000Z");

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
  }
}

class FakeTransaction {
  constructor(stores, mode) {
    this.stores = stores;
    this.mode = mode;
    this.pendingWrites = [];
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.completionQueued = false;
  }

  objectStore(name) {
    const store = this.stores.get(name);
    assert.ok(store, `missing object store ${name}`);
    return new FakeObjectStore(store, this);
  }

  stage(store, key, value) {
    this.pendingWrites.push({ store, key, value: structuredClone(value) });
  }

  queueCompletion() {
    if (this.completionQueued) {
      return;
    }

    this.completionQueued = true;
    queueMicrotask(() => {
      queueMicrotask(() => {
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
    return new FakeTransaction(this.stores, mode);
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

function readKey(record, keyPath) {
  return Array.isArray(keyPath) ? keyPath.map((path) => record[path]) : record[keyPath];
}

function keyMatches(value, expected) {
  return JSON.stringify(value) === JSON.stringify(expected);
}

async function loadModules(suffix) {
  const db = installFakeIndexedDb();
  const model = await import(`../public/scripts/journal-model.js?${suffix}`);
  const todayRepository = await import(`../public/scripts/today-tracking.js?${suffix}`);
  const journalRepository = await import(`../public/scripts/journal-tracking.js?${suffix}`);

  return { db, model, todayRepository, journalRepository };
}

test("journal state returns day meals prompts existing answers and highlighted breakthroughs", async () => {
  const { model, todayRepository, journalRepository } = await loadModules("state");

  await todayRepository.saveMealLog(DAY_ID, "breakfast", {
    ateWhenHungry: "no",
    stoppedAtEnough: "yes",
    now: FIXED_NOW,
  });

  const beforeSave = await journalRepository.getJournalState(DAY_ID, { now: FIXED_NOW });

  assert.equal(beforeSave.available, true);
  assert.equal(beforeSave.status, "Ready");
  assert.equal(beforeSave.day.dayID, DAY_ID);
  assert.deepEqual(beforeSave.meals.map((meal) => meal.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.deepEqual(beforeSave.prompts.map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
    "deeper-hungry",
    "deeper-next-time",
  ]);
  assert.deepEqual(beforeSave.answers, []);
  assert.deepEqual(beforeSave.breakthroughs, []);

  await journalRepository.saveReflection(DAY_ID, {
    "baseline-feeling": {
      text: "  I noticed breakfast felt rushed.  ",
      selectedChipIDs: ["rushed"],
      detail: "  I was between calls.  ",
    },
  }, { now: FIXED_NOW });
  await journalRepository.setAnswerBreakthrough(model.journalAnswerID(DAY_ID, "baseline-feeling"), true, {
    now: LATER_NOW,
  });

  const afterSave = await journalRepository.getJournalState(DAY_ID, { now: FIXED_NOW });
  const answer = afterSave.answers.find((record) => record.promptID === "baseline-feeling");

  assert.equal(answer.text, "I noticed breakfast felt rushed.");
  assert.deepEqual(answer.selectedChips, [{ id: "rushed", label: "Rushed" }]);
  assert.equal(afterSave.breakthroughs.length, 1);
  assert.equal(afterSave.breakthroughs[0].id, answer.id);
  assert.equal(afterSave.breakthroughs[0].breakthroughState, model.BREAKTHROUGH_STATES.marked);
});

test("saving reflection writes one record per rendered prompt including blanks", async () => {
  const { model, todayRepository, journalRepository } = await loadModules("save");

  await todayRepository.saveMealLog(DAY_ID, "lunch", {
    ateWhenHungry: "no",
    stoppedAtEnough: "no",
    now: FIXED_NOW,
  });

  const saveResult = await journalRepository.saveReflection(DAY_ID, {
    "deeper-hungry": {
      text: "  I had waited too long. ",
      selectedChipIDs: ["tired", "habit"],
      detail: " ",
    },
  }, { now: FIXED_NOW });
  const state = await journalRepository.getJournalState(DAY_ID, { now: FIXED_NOW });

  assert.equal(saveResult.available, true);
  assert.equal(saveResult.status, "Ready");
  assert.deepEqual(state.prompts.map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
    "deeper-hungry",
    "deeper-enough",
    "deeper-next-time",
  ]);
  assert.deepEqual(state.answers.map((answer) => answer.promptID), state.prompts.map((prompt) => prompt.id));
  assert.equal(state.answers.find((answer) => answer.promptID === "baseline-feeling").text, "");
  assert.deepEqual(state.answers.find((answer) => answer.promptID === "baseline-feeling").selectedChips, []);
  assert.equal(state.answers.find((answer) => answer.promptID === "baseline-feeling").detail, "");
  assert.equal(state.answers.find((answer) => answer.promptID === "deeper-hungry").text, "I had waited too long.");
  assert.deepEqual(state.answers.find((answer) => answer.promptID === "deeper-hungry").selectedChips, [
    { id: "tired", label: "Tired" },
    { id: "habit", label: "Habit" },
  ]);
  assert.ok(state.answers.every((answer) => answer.breakthroughState === model.BREAKTHROUGH_STATES.none));
});

test("remove and drop update breakthrough metadata without deleting the source answer", async () => {
  const { model, journalRepository } = await loadModules("breakthrough-metadata");
  const answerID = model.journalAnswerID(DAY_ID, "baseline-helped");

  await journalRepository.saveReflection(DAY_ID, {
    "baseline-helped": { text: "Soup helped me slow down." },
  }, { now: FIXED_NOW });

  const marked = await journalRepository.setAnswerBreakthrough(answerID, true, { now: FIXED_NOW });
  assert.equal(marked.answer.breakthroughState, model.BREAKTHROUGH_STATES.marked);
  assert.equal(marked.answer.breakthroughMarkedAt, "2026-07-18T20:15:00.000Z");

  const removed = await journalRepository.setAnswerBreakthrough(answerID, false, { now: LATER_NOW });
  const afterRemove = await journalRepository.getJournalState(DAY_ID, { now: FIXED_NOW });
  assert.equal(removed.answer.breakthroughState, model.BREAKTHROUGH_STATES.none);
  assert.equal(removed.answer.breakthroughMarkedAt, null);
  assert.equal(afterRemove.answers.find((answer) => answer.id === answerID).text, "Soup helped me slow down.");
  assert.deepEqual(afterRemove.breakthroughs, []);

  await journalRepository.setAnswerBreakthrough(answerID, true, { now: FIXED_NOW });
  const dropped = await journalRepository.dropBreakthrough(answerID, { now: LATER_NOW });
  const afterDrop = await journalRepository.getJournalState(DAY_ID, { now: FIXED_NOW });

  assert.equal(dropped.answer.breakthroughState, model.BREAKTHROUGH_STATES.dropped);
  assert.equal(dropped.answer.breakthroughDroppedAt, "2026-07-18T21:30:00.000Z");
  assert.equal(afterDrop.answers.find((answer) => answer.id === answerID).text, "Soup helped me slow down.");
  assert.deepEqual(afterDrop.breakthroughs, []);
});

test("breakthrough list returns marked answers in deterministic newest-first order", async () => {
  const { model, journalRepository } = await loadModules("breakthrough-list");
  const olderDayID = "2026-07-17";
  const olderID = model.journalAnswerID(olderDayID, "baseline-feeling");
  const newerHelpedID = model.journalAnswerID(DAY_ID, "baseline-helped");
  const newerTomorrowID = model.journalAnswerID(DAY_ID, "baseline-tomorrow");

  await journalRepository.saveReflection(olderDayID, {
    "baseline-feeling": {
      text: "Older answer",
      selectedChipIDs: ["tired"],
      detail: "Detail",
    },
  }, { now: new Date("2026-07-17T20:00:00.000Z") });
  await journalRepository.saveReflection(DAY_ID, {
    "baseline-helped": { text: "Newer helped" },
    "baseline-tomorrow": { text: "Newer tomorrow" },
  }, { now: FIXED_NOW });

  await journalRepository.setAnswerBreakthrough(olderID, true, { now: new Date("2026-07-17T21:00:00.000Z") });
  await journalRepository.setAnswerBreakthrough(newerTomorrowID, true, { now: new Date("2026-07-18T21:00:00.000Z") });
  await journalRepository.setAnswerBreakthrough(newerHelpedID, true, { now: new Date("2026-07-18T21:20:00.000Z") });

  const list = await journalRepository.getBreakthroughs();

  assert.equal(list.available, true);
  assert.deepEqual(list.breakthroughs.map((answer) => answer.id), [
    newerHelpedID,
    newerTomorrowID,
    olderID,
  ]);
  assert.deepEqual(list.breakthroughs[2].selectedChips, [{ id: "tired", label: "Tired" }]);
  assert.equal(list.breakthroughs[2].promptText, "How was I feeling around food today?");
  assert.equal(list.breakthroughs[2].detail, "Detail");
});

test("journal repository returns neutral unavailable results without IndexedDB", async () => {
  delete globalThis.indexedDB;
  const journalRepository = await import(`../public/scripts/journal-tracking.js?missing=${Date.now()}`);

  const state = await journalRepository.getJournalState(DAY_ID);
  const save = await journalRepository.saveReflection(DAY_ID, {});
  const marked = await journalRepository.setAnswerBreakthrough("missing-answer", true);
  const dropped = await journalRepository.dropBreakthrough("missing-answer");
  const list = await journalRepository.getBreakthroughs();

  assert.equal(state.available, false);
  assert.equal(state.status, "Unavailable");
  assert.deepEqual(state.prompts, []);
  assert.deepEqual(save.answers, []);
  assert.equal(marked.answer, null);
  assert.equal(dropped.answer, null);
  assert.deepEqual(list.breakthroughs, []);
});

test("journal repository stays local-only and does not use network or cache APIs", async () => {
  const source = await readFile(new URL("../public/scripts/journal-tracking.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(source, /\bsendBeacon\b/);
  assert.doesNotMatch(source, /\bcaches\b/);
});

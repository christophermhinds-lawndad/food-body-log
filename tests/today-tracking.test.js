import assert from "node:assert/strict";
import test from "node:test";

const FIXED_NOW = new Date(2026, 6, 18, 8, 30, 0);
const TODAY_ID = "2026-07-18";
const TOMORROW_ID = "2026-07-19";

class FakeObjectStore {
  constructor(store) {
    this.store = store;
  }

  createIndex(name, keyPath, options) {
    this.store.indexes.set(name, { keyPath, options });
    return { name, keyPath, options };
  }

  put(value) {
    const record = structuredClone(value);
    if (this.store.shouldFailPut?.(record)) {
      return requestThatFails(new Error(`failed put for ${record.id || record.dayID || record.key}`));
    }

    this.store.records.set(record[this.store.keyPath], record);
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

  get(queryKey) {
    return requestThatSucceeds(this.findMatchingRecords(queryKey)[0] || undefined);
  }

  getAll(queryKey) {
    return requestThatSucceeds(this.findMatchingRecords(queryKey));
  }

  findMatchingRecords(queryKey) {
    return Array.from(this.store.records.values())
      .filter((record) => keyMatches(readKey(record, this.keyPath), queryKey))
      .map((record) => structuredClone(record));
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

async function loadTrackingModules(suffix) {
  const db = installFakeIndexedDb();

  const model = await import(`../public/scripts/tracking-model.js?${suffix}`);
  const repository = await import(`../public/scripts/today-tracking.js?${suffix}`);

  return { db, model, repository };
}

test("tracking model keeps fixed slots and state values distinct", async () => {
  const { model } = await loadTrackingModules("model");

  assert.deepEqual(
    model.MEAL_SLOTS.map((slot) => slot.id),
    ["breakfast", "lunch", "dinner", "snack"],
  );
  assert.equal(new Set(Object.values(model.MEAL_STATES)).size, 3);
  assert.equal(new Set(Object.values(model.MEAL_ANSWERS)).size, 3);

  const defaultMeal = model.createDefaultMeal(TODAY_ID, model.MEAL_SLOTS[0]);
  assert.equal(defaultMeal.plannedText, "");
  assert.equal(defaultMeal.logState, model.MEAL_STATES.notLogged);
  assert.equal(defaultMeal.ateWhenHungry, model.MEAL_ANSWERS.unanswered);

  const loggedMeal = model.applyLoggedMeal(defaultMeal, {
    ateWhenHungry: model.MEAL_ANSWERS.yes,
    stoppedAtEnough: model.MEAL_ANSWERS.no,
    now: FIXED_NOW,
  });
  assert.equal(loggedMeal.logState, model.MEAL_STATES.logged);
  assert.equal(loggedMeal.ateWhenHungry, model.MEAL_ANSWERS.yes);
  assert.equal(loggedMeal.stoppedAtEnough, model.MEAL_ANSWERS.no);

  const skippedMeal = model.applySkippedMeal(loggedMeal, FIXED_NOW);
  assert.equal(skippedMeal.logState, model.MEAL_STATES.skipped);
  assert.equal(skippedMeal.ateWhenHungry, model.MEAL_ANSWERS.unanswered);
  assert.equal(skippedMeal.stoppedAtEnough, model.MEAL_ANSWERS.unanswered);
});

test("repository ensures four slots and preserves blank planned text", async () => {
  const { repository } = await loadTrackingModules("slots");

  const todayState = await repository.getTodayTrackingState({ now: FIXED_NOW });
  assert.equal(todayState.available, true);
  assert.equal(todayState.day.dayID, TODAY_ID);
  assert.deepEqual(todayState.meals.map((meal) => meal.slot), ["breakfast", "lunch", "dinner", "snack"]);
  assert.ok(todayState.meals.every((meal) => meal.plannedText === ""));

  const planResult = await repository.savePlan(TOMORROW_ID, {
    breakfast: "",
    lunch: "  soup and toast  ",
    dinner: "Pasta",
    snack: "",
  });
  assert.equal(planResult.available, true);

  const planState = await repository.getPlanState(TOMORROW_ID);
  assert.deepEqual(planState.meals.map((meal) => meal.plannedText), ["", "soup and toast", "Pasta", ""]);
});

test("plan saves update supplied slots without resetting sibling log state or answers", async () => {
  const { model, repository } = await loadTrackingModules("partial-plan");

  await repository.savePlan(TODAY_ID, {
    breakfast: "Oatmeal",
    lunch: "Rice bowl",
    dinner: "Soup",
    snack: "",
  });
  await repository.saveMealLog(TODAY_ID, "lunch", {
    ateWhenHungry: model.MEAL_ANSWERS.no,
    stoppedAtEnough: model.MEAL_ANSWERS.yes,
    now: FIXED_NOW,
  });
  await repository.savePlan(TODAY_ID, {
    breakfast: "",
  });

  const todayState = await repository.getTodayTrackingState({ now: FIXED_NOW });
  const meals = Object.fromEntries(todayState.meals.map((meal) => [meal.slot, meal]));

  assert.equal(todayState.meals.length, 4);
  assert.deepEqual(todayState.meals.map((meal) => meal.id), [
    `${TODAY_ID}:breakfast`,
    `${TODAY_ID}:lunch`,
    `${TODAY_ID}:dinner`,
    `${TODAY_ID}:snack`,
  ]);
  assert.equal(meals.breakfast.plannedText, "");
  assert.equal(meals.lunch.plannedText, "Rice bowl");
  assert.equal(meals.lunch.logState, model.MEAL_STATES.logged);
  assert.equal(meals.lunch.ateWhenHungry, model.MEAL_ANSWERS.no);
  assert.equal(meals.lunch.stoppedAtEnough, model.MEAL_ANSWERS.yes);
  assert.equal(meals.dinner.plannedText, "Soup");
  assert.equal(meals.snack.plannedText, "");
});

test("saving one meal log updates that slot only and preserves sibling records", async () => {
  const { model, repository } = await loadTrackingModules("meal-save");

  await repository.savePlan(TODAY_ID, {
    breakfast: "Oatmeal",
    lunch: "Rice bowl",
    dinner: "",
    snack: "",
  });

  const saveResult = await repository.saveMealLog(TODAY_ID, "lunch", {
    ateWhenHungry: model.MEAL_ANSWERS.yes,
    stoppedAtEnough: model.MEAL_ANSWERS.no,
    now: FIXED_NOW,
  });
  assert.equal(saveResult.available, true);

  const todayState = await repository.getTodayTrackingState({ now: FIXED_NOW });
  const meals = Object.fromEntries(todayState.meals.map((meal) => [meal.slot, meal]));

  assert.equal(meals.breakfast.plannedText, "Oatmeal");
  assert.equal(meals.breakfast.logState, model.MEAL_STATES.notLogged);
  assert.equal(meals.lunch.plannedText, "Rice bowl");
  assert.equal(meals.lunch.logState, model.MEAL_STATES.logged);
  assert.equal(meals.lunch.ateWhenHungry, model.MEAL_ANSWERS.yes);
  assert.equal(meals.lunch.stoppedAtEnough, model.MEAL_ANSWERS.no);
  assert.equal(meals.dinner.logState, model.MEAL_STATES.notLogged);
  assert.equal(meals.snack.logState, model.MEAL_STATES.notLogged);
});

test("partial non-skipped meal answers return an affected-slot failure without persisting logged state", async () => {
  const { model, repository } = await loadTrackingModules("partial-log");

  await repository.savePlan(TODAY_ID, {
    breakfast: "Oatmeal",
    lunch: "Rice bowl",
    dinner: "Soup",
    snack: "Yogurt",
  });

  assert.throws(
    () => model.applyLoggedMeal(model.createDefaultMeal(TODAY_ID, "breakfast"), {
      ateWhenHungry: model.MEAL_ANSWERS.yes,
      stoppedAtEnough: model.MEAL_ANSWERS.unanswered,
      now: FIXED_NOW,
    }),
    /require both metric answers/i,
  );

  const partialResult = await repository.saveMealLog(TODAY_ID, "breakfast", {
    ateWhenHungry: model.MEAL_ANSWERS.yes,
    stoppedAtEnough: model.MEAL_ANSWERS.unanswered,
    now: FIXED_NOW,
  });
  const todayState = await repository.getTodayTrackingState({ now: FIXED_NOW });
  const meals = Object.fromEntries(todayState.meals.map((meal) => [meal.slot, meal]));

  assert.equal(partialResult.available, true);
  assert.equal(partialResult.status, "Invalid");
  assert.deepEqual(partialResult.error, {
    code: "partial-metric-answers",
    dayID: TODAY_ID,
    slot: "breakfast",
  });
  assert.equal(meals.breakfast.logState, model.MEAL_STATES.notLogged);
  assert.equal(meals.breakfast.ateWhenHungry, model.MEAL_ANSWERS.unanswered);
  assert.equal(meals.breakfast.stoppedAtEnough, model.MEAL_ANSWERS.unanswered);
  assert.equal(meals.lunch.plannedText, "Rice bowl");
  assert.equal(meals.dinner.plannedText, "Soup");
  assert.equal(meals.snack.plannedText, "Yogurt");
});

test("failed single-meal write reports the affected slot and preserves sibling records", async () => {
  const { db, model, repository } = await loadTrackingModules("failed-meal-write");

  await repository.savePlan(TODAY_ID, {
    breakfast: "Oatmeal",
    lunch: "Rice bowl",
    dinner: "Soup",
    snack: "Yogurt",
  });

  const mealsStore = db.stores.get("meals");
  mealsStore.shouldFailPut = (record) => record.id === `${TODAY_ID}:lunch`
    && record.logState === model.MEAL_STATES.logged;

  const saveResult = await repository.saveMealLog(TODAY_ID, "lunch", {
    ateWhenHungry: model.MEAL_ANSWERS.yes,
    stoppedAtEnough: model.MEAL_ANSWERS.no,
    now: FIXED_NOW,
  });
  mealsStore.shouldFailPut = null;

  const todayState = await repository.getTodayTrackingState({ now: FIXED_NOW });
  const meals = Object.fromEntries(todayState.meals.map((meal) => [meal.slot, meal]));

  assert.equal(saveResult.available, true);
  assert.equal(saveResult.status, "Error");
  assert.deepEqual(saveResult.error, {
    code: "meal-save-failed",
    dayID: TODAY_ID,
    slot: "lunch",
  });
  assert.equal(meals.breakfast.plannedText, "Oatmeal");
  assert.equal(meals.breakfast.logState, model.MEAL_STATES.notLogged);
  assert.equal(meals.lunch.plannedText, "Rice bowl");
  assert.equal(meals.lunch.logState, model.MEAL_STATES.notLogged);
  assert.equal(meals.dinner.plannedText, "Soup");
  assert.equal(meals.dinner.logState, model.MEAL_STATES.notLogged);
  assert.equal(meals.snack.plannedText, "Yogurt");
  assert.equal(meals.snack.logState, model.MEAL_STATES.notLogged);
});

test("skipped meals and daily weight upserts stay distinct", async () => {
  const { model, repository } = await loadTrackingModules("skip-weight");

  const skipResult = await repository.skipMeal(TODAY_ID, "snack", { now: FIXED_NOW });
  assert.equal(skipResult.available, true);

  const firstWeight = await repository.saveWeight(TODAY_ID, "184.6", { now: FIXED_NOW });
  const secondWeight = await repository.saveWeight(TODAY_ID, "184.2", { now: FIXED_NOW });
  const invalidWeight = await repository.saveWeight(TODAY_ID, "", { now: FIXED_NOW });
  const todayState = await repository.getTodayTrackingState({ now: FIXED_NOW });
  const snack = todayState.meals.find((meal) => meal.slot === "snack");

  assert.equal(firstWeight.available, true);
  assert.equal(secondWeight.available, true);
  assert.equal(invalidWeight.available, false);
  assert.equal(snack.logState, model.MEAL_STATES.skipped);
  assert.equal(snack.ateWhenHungry, model.MEAL_ANSWERS.unanswered);
  assert.equal(snack.stoppedAtEnough, model.MEAL_ANSWERS.unanswered);
  assert.equal(todayState.weight.value, 184.2);
});

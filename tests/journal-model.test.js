import assert from "node:assert/strict";
import test from "node:test";

import {
  MEAL_ANSWERS,
  MEAL_STATES,
  createDefaultMeal,
} from "../public/scripts/tracking-model.js";

const DAY_ID = "2026-07-18";
const FIXED_NOW = new Date("2026-07-18T20:15:00.000Z");

function meal(slot, answers = {}) {
  return {
    ...createDefaultMeal(DAY_ID, slot, { now: FIXED_NOW }),
    ...answers,
  };
}

async function loadJournalModel(suffix = "default") {
  return await import(`../public/scripts/journal-model.js?${suffix}`);
}

test("journal prompts always include baseline prompts and only relevant deeper prompts", async () => {
  const model = await loadJournalModel("prompt-eligibility");

  assert.deepEqual(model.promptsForMeals([]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
  ]);
  assert.deepEqual(model.promptsForMeals([
    meal("breakfast", { logState: MEAL_STATES.notLogged }),
  ]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
  ]);
  assert.deepEqual(model.promptsForMeals([
    meal("breakfast", { logState: MEAL_STATES.skipped }),
  ]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
  ]);
  assert.deepEqual(model.promptsForMeals([
    meal("breakfast", {
      logState: MEAL_STATES.logged,
      ateWhenHungry: MEAL_ANSWERS.yes,
      stoppedAtEnough: MEAL_ANSWERS.yes,
    }),
    meal("lunch", { logState: MEAL_STATES.skipped }),
  ]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
  ]);
  assert.deepEqual(model.promptsForMeals([
    meal("breakfast", {
      logState: MEAL_STATES.logged,
      ateWhenHungry: MEAL_ANSWERS.no,
      stoppedAtEnough: MEAL_ANSWERS.yes,
    }),
  ]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
    "deeper-hungry",
    "deeper-next-time",
  ]);
  assert.deepEqual(model.promptsForMeals([
    meal("breakfast", {
      logState: MEAL_STATES.logged,
      ateWhenHungry: MEAL_ANSWERS.yes,
      stoppedAtEnough: MEAL_ANSWERS.no,
    }),
  ]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
    "deeper-enough",
    "deeper-next-time",
  ]);
  assert.deepEqual(model.promptsForMeals([
    meal("breakfast", {
      logState: MEAL_STATES.logged,
      ateWhenHungry: MEAL_ANSWERS.no,
      stoppedAtEnough: MEAL_ANSWERS.no,
    }),
  ]).map((prompt) => prompt.id), [
    "baseline-feeling",
    "baseline-helped",
    "baseline-tomorrow",
    "deeper-hungry",
    "deeper-enough",
    "deeper-next-time",
  ]);
});

test("journal chips use the locked v1 ids and labels", async () => {
  const model = await loadJournalModel("chips");

  assert.deepEqual(model.JOURNAL_CHIPS, [
    { id: "stressed", label: "Stressed" },
    { id: "tired", label: "Tired" },
    { id: "rushed", label: "Rushed" },
    { id: "bored", label: "Bored" },
    { id: "anxious", label: "Anxious" },
    { id: "sad", label: "Sad" },
    { id: "lonely", label: "Lonely" },
    { id: "celebratory", label: "Celebratory" },
    { id: "distracted", label: "Distracted" },
    { id: "social-pressure", label: "Social pressure" },
    { id: "habit", label: "Habit" },
    { id: "craving", label: "Craving" },
    { id: "convenience", label: "Convenience" },
    { id: "conflict", label: "Conflict" },
    { id: "work-pressure", label: "Work pressure" },
  ]);
  assert.equal(model.JOURNAL_CHIPS.some((chip) => chip.id === "body-image"), false);
  assert.equal(model.JOURNAL_CHIPS.some((chip) => chip.id === "skipped-meal"), false);
  assert.throws(
    () => model.normalizeJournalAnswer({ selectedChipIDs: ["body-image"] }, { promptID: "baseline-feeling" }),
    /unknown journal chip/i,
  );
});

test("journal answer records preserve prompt and chip snapshots while accepting blanks", async () => {
  const model = await loadJournalModel("answer-records");
  const prompt = model.JOURNAL_PROMPTS.find((candidate) => candidate.id === "baseline-feeling");
  const blankPrompt = model.JOURNAL_PROMPTS.find((candidate) => candidate.id === "baseline-helped");

  assert.equal(model.journalAnswerID(DAY_ID, prompt.id), "2026-07-18:journal:baseline-feeling");

  const selectedRecord = model.createJournalAnswerRecord(DAY_ID, prompt, {
    text: "  I paused before lunch.  ",
    selectedChipIDs: ["tired", "social-pressure", "tired"],
    detail: "  Late meeting.  ",
  }, null, { now: FIXED_NOW });

  assert.equal(selectedRecord.id, "2026-07-18:journal:baseline-feeling");
  assert.equal(selectedRecord.dayID, DAY_ID);
  assert.equal(selectedRecord.promptID, "baseline-feeling");
  assert.equal(selectedRecord.promptText, "How was I feeling around food today?");
  assert.equal(selectedRecord.supportsChips, true);
  assert.equal(selectedRecord.supportsDetail, true);
  assert.equal(selectedRecord.text, "I paused before lunch.");
  assert.deepEqual(selectedRecord.selectedChips, [
    { id: "tired", label: "Tired" },
    { id: "social-pressure", label: "Social pressure" },
  ]);
  assert.equal(selectedRecord.detail, "Late meeting.");
  assert.equal(selectedRecord.breakthroughState, model.BREAKTHROUGH_STATES.none);
  assert.equal(selectedRecord.breakthroughMarkedAt, null);
  assert.equal(selectedRecord.breakthroughDroppedAt, null);
  assert.equal(selectedRecord.createdAt, "2026-07-18T20:15:00.000Z");
  assert.equal(selectedRecord.updatedAt, "2026-07-18T20:15:00.000Z");

  const blankRecord = model.createJournalAnswerRecord(DAY_ID, blankPrompt, {}, null, { now: FIXED_NOW });

  assert.equal(blankRecord.id, "2026-07-18:journal:baseline-helped");
  assert.equal(blankRecord.text, "");
  assert.deepEqual(blankRecord.selectedChips, []);
  assert.equal(blankRecord.detail, "");
  assert.equal(blankRecord.supportsChips, false);
  assert.equal(blankRecord.supportsDetail, false);
});

test("journal answer updates preserve created and breakthrough metadata", async () => {
  const model = await loadJournalModel("answer-updates");
  const prompt = model.JOURNAL_PROMPTS.find((candidate) => candidate.id === "deeper-hungry");
  const existing = {
    id: model.journalAnswerID(DAY_ID, prompt.id),
    dayID: DAY_ID,
    promptID: prompt.id,
    promptText: prompt.text,
    selectedChips: [{ id: "habit", label: "Habit" }],
    text: "Earlier answer",
    detail: "",
    breakthroughState: model.BREAKTHROUGH_STATES.marked,
    breakthroughMarkedAt: "2026-07-18T21:00:00.000Z",
    breakthroughDroppedAt: null,
    createdAt: "2026-07-18T20:00:00.000Z",
    updatedAt: "2026-07-18T20:00:00.000Z",
  };

  const updated = model.createJournalAnswerRecord(DAY_ID, prompt, {
    text: "  Later answer  ",
    selectedChipIDs: [],
    detail: "",
  }, existing, { now: FIXED_NOW });

  assert.equal(updated.createdAt, existing.createdAt);
  assert.equal(updated.updatedAt, "2026-07-18T20:15:00.000Z");
  assert.equal(updated.breakthroughState, model.BREAKTHROUGH_STATES.marked);
  assert.equal(updated.breakthroughMarkedAt, "2026-07-18T21:00:00.000Z");
  assert.equal(updated.text, "Later answer");
  assert.deepEqual(updated.selectedChips, []);
});

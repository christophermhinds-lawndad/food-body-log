import { MEAL_ANSWERS, MEAL_STATES } from "./tracking-model.js?v=3";

export const OUTSIDE_PLAN_PROMPT_ID = "outside-plan-check";

export const BREAKTHROUGH_STATES = Object.freeze({
  none: "none",
  marked: "marked",
  dropped: "dropped",
});

export const OUTSIDE_PLAN_PROMPT = Object.freeze({
  id: OUTSIDE_PLAN_PROMPT_ID,
  text: "Did I eat food outside of my plan, when I was not hungry?",
  supportsChips: false,
  supportsDetail: false,
});

export const JOURNAL_PROMPTS = Object.freeze([
  Object.freeze({
    id: "baseline-feeling",
    text: "How was I feeling around food today?",
    supportsChips: true,
    supportsDetail: true,
  }),
  Object.freeze({
    id: "baseline-helped",
    text: "What helped me listen to hunger or enough today?",
    supportsChips: false,
    supportsDetail: false,
  }),
  Object.freeze({
    id: "baseline-tomorrow",
    text: "What would support me tomorrow?",
    supportsChips: false,
    supportsDetail: false,
  }),
  Object.freeze({
    id: "deeper-hungry",
    text: "What was happening when I ate when I was not hungry?",
    supportsChips: true,
    supportsDetail: true,
  }),
  Object.freeze({
    id: "deeper-enough",
    text: "What was happening when I ate past enough?",
    supportsChips: true,
    supportsDetail: true,
  }),
  Object.freeze({
    id: "deeper-next-time",
    text: "What might I try differently next time?",
    supportsChips: false,
    supportsDetail: false,
  }),
]);

export const JOURNAL_CHIPS = Object.freeze([
  Object.freeze({ id: "stressed", label: "Stressed" }),
  Object.freeze({ id: "tired", label: "Tired" }),
  Object.freeze({ id: "rushed", label: "Rushed" }),
  Object.freeze({ id: "bored", label: "Bored" }),
  Object.freeze({ id: "anxious", label: "Anxious" }),
  Object.freeze({ id: "sad", label: "Sad" }),
  Object.freeze({ id: "lonely", label: "Lonely" }),
  Object.freeze({ id: "celebratory", label: "Celebratory" }),
  Object.freeze({ id: "distracted", label: "Distracted" }),
  Object.freeze({ id: "social-pressure", label: "Social pressure" }),
  Object.freeze({ id: "habit", label: "Habit" }),
  Object.freeze({ id: "craving", label: "Craving" }),
  Object.freeze({ id: "convenience", label: "Convenience" }),
  Object.freeze({ id: "conflict", label: "Conflict" }),
  Object.freeze({ id: "work-pressure", label: "Work pressure" }),
]);

const BASELINE_PROMPTS = Object.freeze(JOURNAL_PROMPTS.slice(0, 3));
const CHIP_BY_ID = new Map(JOURNAL_CHIPS.map((chip) => [chip.id, chip]));
const SLOT_LABELS = Object.freeze({
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Optional Snack",
});

export function journalAnswerID(dayID, promptID) {
  const prompt = getPrompt(promptID);
  return `${String(dayID)}:journal:${prompt.id}`;
}

export function promptsForMeals(meals, options = {}) {
  const flags = promptFlagsForMeals(meals);
  const outsidePlan = options.outsidePlan === true;
  const prompts = outsidePlan
    ? [
      getPrompt("outside-plan-food"),
      getPrompt("outside-plan-time"),
      getPrompt("outside-plan-context"),
      ...BASELINE_PROMPTS.slice(1),
    ]
    : [...BASELINE_PROMPTS];

  if (flags.hungryNo) {
    prompts.push(withContextItems(getPrompt("deeper-hungry"), "Meals marked as eaten when not hungry", flags.hungryNoMeals));
  }

  if (flags.enoughNo) {
    prompts.push(withContextItems(getPrompt("deeper-enough"), "Meals marked as eaten past enough", flags.enoughNoMeals));
  }

  if (flags.hungryNo || flags.enoughNo) {
    prompts.push(getPrompt("deeper-next-time"));
  }

  return prompts;
}

export function normalizeJournalAnswer(input = {}, options = {}) {
  const prompt = getPrompt(options.promptID || options.prompt || input.promptID || input.prompt);
  const text = normalizeText(input.text);
  const selectedChips = prompt.supportsChips ? normalizeSelectedChips(input) : [];
  const detail = prompt.supportsDetail ? normalizeText(input.detail) : "";

  return {
    text,
    selectedChips,
    detail,
  };
}

export function createJournalAnswerRecord(dayID, prompt, input = {}, existing = null, options = {}) {
  const promptSnapshot = getPrompt(prompt);
  const now = nowIso(options);
  const normalized = normalizeJournalAnswer(input, { prompt: promptSnapshot });

  return {
    ...(existing || {}),
    id: journalAnswerID(dayID, promptSnapshot.id),
    dayID,
    promptID: promptSnapshot.id,
    promptText: promptSnapshot.text,
    supportsChips: promptSnapshot.supportsChips,
    supportsDetail: promptSnapshot.supportsDetail,
    text: normalized.text,
    selectedChips: normalized.selectedChips,
    detail: normalized.detail,
    breakthroughState: normalizeBreakthroughState(existing?.breakthroughState),
    breakthroughMarkedAt: existing?.breakthroughMarkedAt || null,
    breakthroughDroppedAt: existing?.breakthroughDroppedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function promptFlagsForMeals(meals) {
  const loggedMeals = (Array.isArray(meals) ? meals : [])
    .filter((meal) => meal?.logState === MEAL_STATES.logged);
  const hungryNoMeals = loggedMeals.filter((meal) => meal.ateWhenHungry === MEAL_ANSWERS.no).map(mealLabel);
  const enoughNoMeals = loggedMeals.filter((meal) => meal.stoppedAtEnough === MEAL_ANSWERS.no).map(mealLabel);

  return {
    hungryNo: hungryNoMeals.length > 0,
    enoughNo: enoughNoMeals.length > 0,
    hungryNoMeals,
    enoughNoMeals,
  };
}

function withContextItems(prompt, contextHeading, contextItems) {
  return Object.freeze({
    ...prompt,
    contextHeading,
    contextItems: Object.freeze([...contextItems]),
  });
}

function mealLabel(meal) {
  return SLOT_LABELS[meal?.slot] || String(meal?.slot || "Meal");
}

function normalizeSelectedChips(input) {
  const selectedIDs = Array.isArray(input.selectedChipIDs)
    ? input.selectedChipIDs
    : (Array.isArray(input.selectedChips) ? input.selectedChips.map((chip) => chip?.id || chip) : []);
  const seen = new Set();
  const chips = [];

  for (const selectedID of selectedIDs) {
    const chipID = String(selectedID ?? "").trim();

    if (!chipID || seen.has(chipID)) {
      continue;
    }

    const chip = CHIP_BY_ID.get(chipID);

    if (!chip) {
      throw new TypeError(`Unknown journal chip: ${chipID}`);
    }

    seen.add(chipID);
    chips.push({ id: chip.id, label: chip.label });
  }

  return chips;
}

function getPrompt(prompt) {
  const promptID = typeof prompt === "string" ? prompt : prompt?.id;
  const match = [
    OUTSIDE_PLAN_PROMPT,
    ...JOURNAL_PROMPTS,
    {
      id: "outside-plan-food",
      text: "What food?",
      supportsChips: false,
      supportsDetail: false,
    },
    {
      id: "outside-plan-time",
      text: "What time of day?",
      supportsChips: false,
      supportsDetail: false,
    },
    {
      id: "outside-plan-context",
      text: "Context Tiles",
      supportsChips: true,
      supportsDetail: true,
    },
  ].find((candidate) => candidate.id === promptID);

  if (!match) {
    throw new TypeError(`Unknown journal prompt: ${promptID}`);
  }

  return match;
}

function normalizeBreakthroughState(state) {
  return Object.values(BREAKTHROUGH_STATES).includes(state) ? state : BREAKTHROUGH_STATES.none;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function nowIso(options = {}) {
  const now = options.now || new Date();
  return (now instanceof Date ? now : new Date(now)).toISOString();
}

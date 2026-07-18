import assert from "node:assert/strict";
import test from "node:test";

import { createPlanSuggestionController } from "../public/scripts/plan-suggestions-ui.js";

test("plan suggestion controller applies tap and keyboard choices without stale re-open", async () => {
  const { document, input, list, message } = createSuggestionHarness();
  const queries = [];
  const controller = createPlanSuggestionController({
    document,
    getPlanDayID: () => "2026-07-19",
    getPlanSuggestions: async (query) => {
      queries.push(query);
      return { available: true, suggestions: ["Apple with peanut butter"] };
    },
    planMessage: message,
    setText: (node, value) => {
      node.textContent = value == null ? "" : String(value);
    },
    suggestionErrorMessage: "Suggestions could not be loaded. You can keep typing.",
  });

  controller.attachInput(input);
  input.focus();
  input.value = "apple";
  await input.dispatch("input", createEvent());

  assert.equal(list.hidden, false);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].type, "button");
  assert.equal(list.children[0].textContent, "Apple with peanut butter");

  const pointerEvent = createEvent();
  await list.children[0].dispatch("pointerdown", pointerEvent);
  assert.equal(pointerEvent.defaultPrevented, true);
  assert.equal(input.value, "Apple with peanut butter");
  assert.equal(document.activeElement, input);

  const clickEvent = createEvent();
  await list.children[0].dispatch("click", clickEvent);
  await tick();
  assert.equal(clickEvent.defaultPrevented, true);
  assert.equal(list.hidden, true);
  assert.equal(list.children.length, 0);

  const queryCountAfterClick = queries.length;
  await input.dispatch("focus", createEvent());
  assert.equal(queries.length, queryCountAfterClick, "exact applied value must not reopen suggestions");
  assert.equal(list.hidden, true);

  input.value = "apple";
  await input.dispatch("input", createEvent());
  const tabEvent = createEvent({ key: "Tab", shiftKey: false });
  await input.dispatch("keydown", tabEvent);
  assert.equal(tabEvent.defaultPrevented, true);
  assert.equal(document.activeElement, list.children[0]);

  const enterEvent = createEvent({ key: "Enter" });
  await list.children[0].dispatch("keydown", enterEvent);
  await tick();
  assert.equal(enterEvent.defaultPrevented, true);
  assert.equal(input.value, "Apple with peanut butter");
  assert.equal(document.activeElement, input);
  assert.equal(list.hidden, true);
  assert.equal(list.children.length, 0);

  input.value = "apple";
  await input.dispatch("input", createEvent());
  await input.dispatch("keydown", createEvent({ key: "Tab", shiftKey: false }));
  const spaceEvent = createEvent({ key: " " });
  await list.children[0].dispatch("keydown", spaceEvent);
  await tick();
  assert.equal(spaceEvent.defaultPrevented, true);
  assert.equal(input.value, "Apple with peanut butter");
  assert.equal(document.activeElement, input);
  assert.equal(list.hidden, true);
});

test("plan suggestion controller ignores stale async results after apply", async () => {
  const { document, input, list, message } = createSuggestionHarness();
  let resolveSuggestions;
  const controller = createPlanSuggestionController({
    document,
    getPlanDayID: () => "2026-07-19",
    getPlanSuggestions: () => new Promise((resolve) => {
      resolveSuggestions = resolve;
    }),
    planMessage: message,
    setText: (node, value) => {
      node.textContent = value == null ? "" : String(value);
    },
    suggestionErrorMessage: "Suggestions could not be loaded. You can keep typing.",
  });

  input.focus();
  input.value = "app";
  const pendingUpdate = controller.update(input);
  controller.apply(input, "Apple with peanut butter");
  resolveSuggestions({ available: true, suggestions: ["Apple with peanut butter"] });
  await pendingUpdate;
  await tick();

  assert.equal(input.value, "Apple with peanut butter");
  assert.equal(list.hidden, true);
  assert.equal(list.children.length, 0);
});

test("plan suggestion controller keeps typing usable when lookup is unavailable", async () => {
  const { document, input, list, message } = createSuggestionHarness();
  const controller = createPlanSuggestionController({
    document,
    getPlanDayID: () => "2026-07-19",
    getPlanSuggestions: async () => ({ available: false, suggestions: [] }),
    planMessage: message,
    setText: (node, value) => {
      node.textContent = value == null ? "" : String(value);
    },
    suggestionErrorMessage: "Suggestions could not be loaded. You can keep typing.",
  });

  input.focus();
  input.value = "apple";
  await controller.update(input);

  assert.equal(input.value, "apple");
  assert.equal(document.activeElement, input);
  assert.equal(list.hidden, true);
  assert.equal(list.children.length, 0);
  assert.equal(message.textContent, "Suggestions could not be loaded. You can keep typing.");
});

function createSuggestionHarness() {
  const document = new FakeDocument();
  const input = new FakeElement(document, "input");
  input.dataset.planSlot = "breakfast";
  input.isConnected = true;
  const list = new FakeElement(document, "div");
  list.dataset.planSuggestions = "breakfast";
  list.hidden = true;
  const message = new FakeElement(document, "p");

  document.inputs.set("breakfast", input);
  document.lists.set("breakfast", list);

  return { document, input, list, message };
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.inputs = new Map();
    this.lists = new Map();
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  querySelector(selector) {
    const planSlot = selector.match(/^\[data-plan-slot="([^"]+)"\]$/)?.[1];
    if (planSlot) {
      return this.inputs.get(planSlot) || null;
    }

    const suggestionSlot = selector.match(/^\[data-plan-suggestions="([^"]+)"\]$/)?.[1];
    if (suggestionSlot) {
      return this.lists.get(suggestionSlot) || null;
    }

    return null;
  }

  querySelectorAll(selector) {
    if (selector === "[data-plan-suggestions]") {
      return Array.from(this.lists.values());
    }

    return [];
  }
}

class FakeElement {
  constructor(document, tagName) {
    this.document = document;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.textContent = "";
    this.value = "";
    this.hidden = false;
    this.isConnected = true;
    this.attributes = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(child) {
    child.parent = this;
    this.children.push(child);
  }

  contains(node) {
    return node === this || this.children.includes(node);
  }

  focus() {
    this.document.activeElement = this;
  }

  querySelector(selector) {
    if (selector === "button") {
      return this.children.find((child) => child.tagName === "BUTTON") || null;
    }

    return null;
  }

  replaceChildren() {
    this.children = [];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  async dispatch(type, event) {
    for (const listener of this.listeners.get(type) || []) {
      await listener(event);
    }
  }
}

function createEvent(overrides = {}) {
  return {
    defaultPrevented: false,
    key: "",
    shiftKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

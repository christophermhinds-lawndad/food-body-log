export function createPlanSuggestionController(options) {
  const {
    document,
    getPlanSuggestions,
    getPlanDayID,
    planMessage,
    setText,
    suggestionErrorMessage,
  } = options;
  let requestID = 0;

  function attachInput(input) {
    input.addEventListener("input", () => update(input));
    input.addEventListener("focus", () => update(input));
    input.addEventListener("keydown", (event) => focusSuggestionOnTab(event, input));
  }

  async function update(input) {
    const slot = input?.dataset.planSlot;
    const query = input?.value || "";
    const requestedDayID = getPlanDayID();
    const currentRequestID = ++requestID;

    if (input?.dataset.appliedPlanSuggestion === query) {
      hide(input);
      return;
    }

    delete input?.dataset.appliedPlanSuggestion;

    if (!slot || !query.trim()) {
      clearFailureMessage();
      hide(input);
      return;
    }

    const result = await getPlanSuggestions(query);

    if (currentRequestID !== requestID || requestedDayID !== getPlanDayID() || document.activeElement !== input) {
      return;
    }

    if (!isReadyResult(result)) {
      setText(planMessage, suggestionErrorMessage);
      hide(input);
      return;
    }

    clearFailureMessage();
    render(input, result.suggestions);
  }

  function render(input, suggestions) {
    const list = listFor(input);

    if (!list || !Array.isArray(suggestions) || suggestions.length === 0) {
      hide(input);
      return;
    }

    hideAll(input);
    list.replaceChildren();
    for (const suggestion of suggestions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan-suggestion-option";
      setText(button, suggestion);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        apply(input, suggestion, { hide: false });
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        apply(input, suggestion);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          apply(input, suggestion);
        }
      });
      list.append(button);
    }

    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function hide(inputOrSlot) {
    const list = listFor(inputOrSlot);
    const input = typeof inputOrSlot === "string"
      ? document.querySelector(`[data-plan-slot="${inputOrSlot}"]`)
      : inputOrSlot;

    if (list) {
      list.replaceChildren();
      list.hidden = true;
    }

    input?.setAttribute("aria-expanded", "false");
  }

  function hideAll(exceptInput = null) {
    document.querySelectorAll("[data-plan-suggestions]").forEach((list) => {
      if (exceptInput?.dataset.planSlot === list.dataset.planSuggestions) {
        return;
      }

      hide(list.dataset.planSuggestions);
    });
  }

  function apply(input, suggestionText, applyOptions = {}) {
    if (!input?.isConnected) {
      return;
    }

    clearFailureMessage();
    requestID += 1;
    input.value = suggestionText;
    input.dataset.appliedPlanSuggestion = suggestionText;
    if (applyOptions.hide !== false) {
      hide(input);
      setTimeout(() => {
        if (input.isConnected && input.value === suggestionText) {
          hide(input);
        }
      }, 0);
    }
    input.focus({ preventScroll: true });
  }

  function focusSuggestionOnTab(event, input) {
    if (event.key !== "Tab" || event.shiftKey) {
      return;
    }

    const list = listFor(input);
    const firstSuggestion = list?.querySelector("button");

    if (!list || list.hidden || !firstSuggestion) {
      return;
    }

    event.preventDefault();
    firstSuggestion.focus({ preventScroll: true });
  }

  function listFor(inputOrSlot) {
    const slot = typeof inputOrSlot === "string" ? inputOrSlot : inputOrSlot?.dataset.planSlot;
    return slot ? document.querySelector(`[data-plan-suggestions="${slot}"]`) : null;
  }

  function clearFailureMessage() {
    if (planMessage?.textContent === suggestionErrorMessage) {
      setText(planMessage, "");
    }
  }

  return {
    apply,
    attachInput,
    focusSuggestionOnTab,
    hide,
    hideAll,
    listFor,
    render,
    update,
  };
}

function isReadyResult(result) {
  return result?.available === true || result?.ok === true;
}

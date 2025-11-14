/**
 * Prompt Enhancer Module
 * Handles all functionality related to the Prompt Enhancer section of the sidepanel
 */

/**
 * Renders the prompt values into the DOM
 * @param {Object} prompts - Object containing originalPrompt, optionA, and optionB
 */
export function renderPrompts({ originalPrompt, optionA, optionB }) {
  const originalField = document.getElementById("original-prompt");
  const optionAField = document.getElementById("option-a");
  const optionBField = document.getElementById("option-b");
  
  if (originalField) originalField.value = originalPrompt ?? "";
  if (optionAField) optionAField.value = optionA ?? "";
  if (optionBField) optionBField.value = optionB ?? "";
}

/**
 * Handles the enhance button click action
 * @param {Object} state - Current application state
 * @param {Object} dependencies - Required dependencies (renderStatus, saveState, detailLevelLabels, defaultState)
 * @returns {Promise<Object>} Updated state
 */
export async function handleEnhance(state, dependencies = {}) {
  const { renderStatus, saveState, detailLevelLabels, defaultState } = dependencies;
  const { enhancementsUsed, enhancementsLimit } = state;
  
  if (enhancementsUsed >= enhancementsLimit) {
    alert("You have reached your enhancement limit for today. Upgrade to continue.");
    return state;
  }

  const textarea = document.getElementById("original-prompt");
  if (!textarea) {
    return state;
  }
  
  const basePrompt = textarea.value.trim();
  const fallbackA = defaultState.optionA;
  const fallbackB = defaultState.optionB;

  const spin = (text) =>
    `${text} (Model: ${state.settings.model}, Output: ${state.settings.output}, Type: ${state.settings.contentType}, Detail: ${detailLevelLabels[state.settings.complexity] || state.settings.complexity})`;

  state.enhancementsUsed = enhancementsUsed + 1;
  state.optionA = basePrompt
    ? spin(`${basePrompt} — Version A focuses on clarity and persuasive voice.`)
    : spin(fallbackA);
  state.optionB = basePrompt
    ? spin(`${basePrompt} — Version B adds context and a stronger CTA.`)
    : spin(fallbackB);

  renderStatus(state);
  renderPrompts(state);
  await saveState(state);
  return state;
}

/**
 * Registers event handlers for copy, insert, and regenerate buttons
 */
export function registerCopyHandlers() {
  const copyButtons = document.querySelectorAll("[data-copy]");
  if (!copyButtons.length) {
    return;
  }
  
  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.copy;
      const field = document.getElementById(targetId);
      if (!field) {
        return;
      }
      try {
        await navigator.clipboard.writeText(field.value);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      } catch (error) {
        console.error("Clipboard copy failed", error);
      }
    });
  });

  const insertButtons = document.querySelectorAll("[data-insert]");
  insertButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.insert;
      const field = document.getElementById(targetId);
      if (!field) {
        return;
      }
      try {
        await navigator.clipboard.writeText(field.value);
        button.textContent = "Inserted";
        setTimeout(() => {
          button.textContent = "Insert";
        }, 1200);
      } catch (error) {
        console.error("Clipboard copy failed", error);
      }
    });
  });

  const regenerateButtons = document.querySelectorAll("[data-regenerate]");
  regenerateButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.regenerate;
      const field = document.getElementById(targetId);
      if (!field) {
        return;
      }
      field.value = `${field.value}\n\n(Re-generated preview coming soon.)`;
    });
  });
}

/**
 * Initializes tab switching functionality for Option A and Option B tabs
 */
export function initTabs() {
  const tabs = document.querySelectorAll(".prompt-tab");
  const tabPanels = document.querySelectorAll(".prompt-tabpanel");
  
  if (!tabs.length || !tabPanels.length) {
    return;
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((btn) => {
        const isActive = btn === tab;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
      tabPanels.forEach((panel) => {
        const matches = panel.id === `${target}-panel`;
        panel.hidden = !matches;
        panel.classList.toggle("is-active", matches);
      });
    });
  });
}

/**
 * Registers the enhance button click handler
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} dependencies - Required dependencies (renderStatus, saveState, detailLevelLabels, defaultState)
 */
export function registerEnhanceButton(stateRef, dependencies) {
  const enhanceButton = document.getElementById("enhance-btn");
  if (!enhanceButton) {
    return;
  }

  enhanceButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await handleEnhance(stateRef, dependencies);
  });
}


/**
 * Settings Panel Module
 * Handles all functionality related to the Settings dialog panel
 */


/**
 * Converts model identifier to display name
 * Always returns "ChatGPT" since we only support ChatGPT
 * @param {string} model - Model identifier (deprecated, always returns ChatGPT)
 * @returns {string} Display name (always "ChatGPT")
 */
export function getModelDisplayName(model) {
  return "ChatGPT";
}

/**
 * Detail level labels for complexity slider
 */
export const detailLevelLabels = {
  1: "Low",
  2: "Medium",
  3: "High"
};

/**
 * Detail level descriptions for complexity slider
 */
export const detailLevelDescriptions = {
  1: "Low Detail is best for quick tasks, simple questions, or fast browsing where you don't need a deep breakdown.",
  2: "Medium Detail gives a balanced, structured refinement suitable for everyday writing, explanations, or general research.",
  3: "High Detail creates the most comprehensive prompts—ideal for books, image generation, business plans, or any complex project where maximum clarity is needed."
};

/**
 * Renders tabs in a container
 * @param {HTMLElement} container - Container element to render tabs in
 * @param {Array} items - Array of tab items with value and label
 * @param {string} currentValue - Currently selected value
 */
export function renderTabs(container, items, currentValue) {
  container.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "form-tab";
    button.dataset.value = item.value;
    button.textContent = item.label;
    if (item.value === currentValue) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }
    container.append(button);
  });
}

/**
 * Updates range output labels and descriptions
 */
export function updateRangeOutputs() {
  document.querySelectorAll("input[type='range']").forEach((input) => {
    const output = document.querySelector(`.range-output[data-for='${input.id}']`);
    if (output) {
      const label = detailLevelLabels[input.value] ?? input.value;
      output.textContent = label;
    }
    
    // Update description for complexity slider
    if (input.id === 'setting-complexity') {
      const description = document.getElementById('complexity-description');
      if (description) {
        const descriptionText = detailLevelDescriptions[input.value] || '';
        description.textContent = descriptionText;
      }
    }
  });
}

/**
 * Renders settings values into the settings form
 * @param {Object} settings - Settings object to render
 */
export function renderSettings(settings) {
  if (!settings) {
    return;
  }
  
  const complexityField = document.getElementById("setting-complexity");
  const outputTabs = document.querySelectorAll(".form-tab[data-setting='output']");
  const evaluationToggle = document.getElementById("setting-real-time-evaluation");

  if (complexityField) {
    complexityField.value = settings.complexity;
  }

  if (evaluationToggle) {
    evaluationToggle.checked = settings.realTimeEvaluation === true;
  }

  outputTabs.forEach((tab) => {
    const value = tab.dataset.value;
    const isActive = value === settings.output;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  updateRangeOutputs();
}

/**
 * Registers all event handlers for the Settings panel
 * @param {Object} stateRef - Reference to application state
 * @param {Object} dependencies - Required dependencies (saveState)
 */
export function registerSettingsHandlers(stateRef, dependencies = {}) {
  const { saveState } = dependencies;
  const settingsDialog = document.getElementById("settings-dialog");
  const settingsTrigger = document.getElementById("open-settings");
  const outputTabs = document.querySelectorAll(".form-tab[data-setting='output']");
  const detailSlider = document.getElementById("setting-complexity");

  if (!settingsDialog || !settingsTrigger || !saveState) {
    return;
  }

  settingsTrigger.addEventListener("click", () => {
    renderSettings(stateRef.settings);
    settingsDialog.showModal();
  });

  settingsDialog.addEventListener("close", async () => {
    if (settingsDialog.returnValue !== "confirm") {
      renderSettings(stateRef.settings);
      return;
    }
    
    // Read the active output tab's value directly from the DOM
    const activeOutputTab = document.querySelector(".form-tab[data-setting='output'].is-active");
    const selectedOutput = activeOutputTab?.dataset.value || stateRef.settings.output || "text";
    const evaluationToggle = document.getElementById("setting-real-time-evaluation");
    
    // Always use ChatGPT - model selection removed
    stateRef.settings = {
      complexity: Number(document.getElementById("setting-complexity").value),
      model: "chatgpt", // Always ChatGPT
      output: selectedOutput,
      realTimeEvaluation: evaluationToggle ? evaluationToggle.checked : false
    };
    
    // Update activePlatform to always be ChatGPT
    stateRef.activePlatform = "ChatGPT";
    
    renderSettings(stateRef.settings);
    await saveState(stateRef);
    
    // Update status card
    if (typeof window.renderStatus === 'function') {
      window.renderStatus({
        plan: stateRef.plan,
        enhancementsUsed: stateRef.enhancementsUsed,
        enhancementsLimit: stateRef.enhancementsLimit
      });
    }
  });

  detailSlider.addEventListener("input", updateRangeOutputs);

  outputTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const value = tab.dataset.value;
      if (!value) {
        return;
      }
      stateRef.settings.output = value;
      renderSettings(stateRef.settings);
    });
  });
}


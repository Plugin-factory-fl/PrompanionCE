/**
 * Settings Panel Module
 * Handles all functionality related to the Settings dialog panel
 */


/**
 * Available model options
 */
export const modelOptions = ["chatgpt", "gemini", "claude", "grok"];

/**
 * Detail level labels for complexity slider
 */
export const detailLevelLabels = {
  1: "Low",
  2: "Medium",
  3: "High"
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
 * Updates range output labels
 */
export function updateRangeOutputs() {
  document.querySelectorAll("input[type='range']").forEach((input) => {
    const output = document.querySelector(`.range-output[data-for='${input.id}']`);
    if (output) {
      const label = detailLevelLabels[input.value] ?? input.value;
      output.textContent = label;
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
  const modelButtons = document.querySelectorAll(".model-pill");
  const outputTabs = document.querySelectorAll(".form-tab[data-setting='output']");

  if (complexityField) {
    complexityField.value = settings.complexity;
  }

  modelButtons.forEach((button) => {
    const value = button.dataset.model;
    button.classList.toggle("is-active", value === settings.model);
  });

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
  const modelButtons = document.querySelectorAll(".model-pill");

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
    stateRef.settings = {
      complexity: Number(document.getElementById("setting-complexity").value),
      model: stateRef.settings.model ?? "chatgpt",
      output: stateRef.settings.output ?? "text"
    };
    renderSettings(stateRef.settings);
    await saveState(stateRef);
  });

  detailSlider.addEventListener("input", updateRangeOutputs);

  modelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.model;
      if (!value || !modelOptions.includes(value)) {
        return;
      }
      stateRef.settings.model = value;
      renderSettings(stateRef.settings);
    });
  });

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


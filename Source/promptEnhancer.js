/**
 * Prompt Enhancer Module
 * Handles all functionality related to the Prompt Enhancer section of the sidepanel
 */

/**
 * Initializes the Prompt Enhancer section
 * Clears all prompt fields to ensure a clean working area on every load
 * This directly manipulates the DOM to guarantee empty fields regardless of cached state
 * @param {Object} stateRef - Reference to current state object
 */
export function initPromptEnhancer(stateRef) {
  stateRef.originalPrompt = "";
  stateRef.optionA = "";
  stateRef.optionB = "";
  
  requestAnimationFrame(() => {
    const originalField = document.getElementById("original-prompt");
    const optionAField = document.getElementById("option-a");
    const optionBField = document.getElementById("option-b");
    
    if (originalField) {
      originalField.value = "";
      originalField.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (optionAField) {
      optionAField.value = "";
      optionAField.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (optionBField) {
      optionBField.value = "";
      optionBField.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

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
 * Calls the OpenAI API to generate two enhanced versions of the prompt
 * @param {Object} state - Current application state
 * @param {Object} dependencies - Required dependencies (renderStatus, saveState)
 * @returns {Promise<Object>} Updated state
 */
export async function handleEnhance(state, dependencies = {}) {
  const { renderStatus, saveState } = dependencies;
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
  if (!basePrompt) {
    alert("Please enter a prompt to enhance.");
    return state;
  }

  const enhanceButton = document.getElementById("enhance-btn");
  const originalButtonText = enhanceButton?.textContent;
  
  // Show loading state
  if (enhanceButton) {
    enhanceButton.disabled = true;
    enhanceButton.textContent = "Enhancing...";
  }

  try {
    // Call background script to generate enhancements
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "PROMPANION_PREPARE_ENHANCEMENT",
          prompt: basePrompt,
          openPanel: false
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    if (!response?.ok) {
      throw new Error(response?.reason || "Failed to generate enhancements");
    }

    // Check if API key is missing (fallback prompts were used)
    const hasApiKey = state.settings?.apiKey?.trim();
    if (!hasApiKey && (response.optionA?.includes("Refined focus:") || response.optionB?.includes("Refined focus:"))) {
      // Show a one-time notification that API key is recommended
      const notificationShown = sessionStorage.getItem("prompanion-api-key-notification");
      if (!notificationShown) {
        setTimeout(() => {
          alert("Tip: Add your OpenAI API key in settings for AI-powered prompt enhancements. Currently using basic fallback enhancements.");
          sessionStorage.setItem("prompanion-api-key-notification", "true");
        }, 500);
      }
    }

    // Update state with the enhanced prompts
    state.originalPrompt = basePrompt;
    state.optionA = response.optionA || basePrompt;
    state.optionB = response.optionB || basePrompt;
    state.enhancementsUsed = enhancementsUsed + 1;

    // Render the updated prompts
    renderPrompts(state);
    if (renderStatus) {
      renderStatus(state);
    }
    
    // Save state
    if (saveState) {
      await saveState(state);
    }

    return state;
  } catch (error) {
    console.error("Prompanion: enhancement failed", error);
    
    // Show error message to user
    const errorMessage = error.message?.includes("API key") 
      ? "Please add your OpenAI API key in settings to use prompt enhancement."
      : "Failed to enhance prompt. Please try again.";
    
    alert(errorMessage);
    
    return state;
  } finally {
    // Restore button state
    if (enhanceButton) {
      enhanceButton.disabled = false;
      enhanceButton.textContent = originalButtonText || "Enhance";
    }
  }
}

/**
 * Registers event handlers for copy, insert, and regenerate buttons
 */
export function registerCopyHandlers() {
  // Register copy button handlers (if they exist)
  const copyButtons = document.querySelectorAll("[data-copy]");
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

  // Register insert button handlers (if they exist)
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

  // Register regenerate button handlers using document-level event delegation
  // This ensures handlers work regardless of when elements are created or section state
  // Remove any existing handler to prevent duplicates
  if (document._prompanionRegenerateHandler) {
    document.removeEventListener("click", document._prompanionRegenerateHandler, true);
  }

  const regenerateHandler = async (event) => {
    // Check if click target is a regenerate button or inside one
    const button = event.target.closest("[data-regenerate]");
    if (!button) {
      return;
    }

    // Only handle clicks within the prompt preview section
    const promptPreview = button.closest(".prompt-preview");
    if (!promptPreview) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const targetId = button.dataset.regenerate;
    if (!targetId) {
      console.error("Prompanion: Regenerate button missing data-regenerate attribute");
      return;
    }

    const originalField = document.getElementById("original-prompt");
    if (!originalField) {
      console.error("Prompanion: original-prompt field not found");
      return;
    }

    const originalPrompt = originalField.value.trim();
    if (!originalPrompt) {
      alert("No original prompt to regenerate. Please enter a prompt in the Original field first.");
      return;
    }

    // Prevent multiple simultaneous regenerations
    if (button.disabled) {
      return;
    }

    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = "Regenerating...";

    try {
      // Determine which option (a or b) based on targetId
      const option = targetId === "option-a" ? "a" : targetId === "option-b" ? "b" : null;
      if (!option) {
        throw new Error(`Invalid option: ${targetId}`);
      }
      
      // Call background script to regenerate using the original prompt
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: "PROMPANION_REGENERATE_ENHANCEMENT",
            prompt: originalPrompt,
            option: option
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response) {
              reject(new Error("No response from background script"));
              return;
            }
            resolve(response);
          }
        );
      });

      if (!response || !response.ok) {
        throw new Error(response?.reason || "Failed to regenerate enhancement");
      }

      // The storage listener will automatically update the UI when state is saved
      // No need to manually update the field here
    } catch (error) {
      console.error("Prompanion: regeneration failed", error);
      const errorMessage = error.message?.includes("API key") 
        ? "Please add your OpenAI API key in settings to use prompt regeneration."
        : error.message || "Failed to regenerate prompt. Please try again.";
      alert(errorMessage);
    } finally {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
  };

  // Store handler reference and attach with capture phase for maximum reliability
  document._prompanionRegenerateHandler = regenerateHandler;
  document.addEventListener("click", regenerateHandler, true);
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
 * Handles state restoration from background script
 * Excludes prompt enhancer fields to keep them clean
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} restoredState - State object from background script
 * @returns {Object} State object with prompt enhancer fields excluded
 */
export function handleStateRestore(stateRef, restoredState) {
  // Exclude prompt enhancer fields from restoration - keep them clean
  const { originalPrompt, optionA, optionB, ...otherState } = restoredState;
  
  // Update state with everything except prompt enhancer fields
  Object.assign(stateRef, otherState);
  
  // Explicitly keep prompt enhancer fields empty
  stateRef.originalPrompt = "";
  stateRef.optionA = "";
  stateRef.optionB = "";
  
  // Re-initialize prompt enhancer to ensure DOM is cleared
  initPromptEnhancer(stateRef);
  
  return otherState;
}

/**
 * Handles state updates from background script
 * Updates prompts when new enhancements are received, otherwise keeps them clean
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} newState - New state object from background script
 * @returns {Object} State object with prompt enhancer fields handled appropriately
 */
export function handleStatePush(stateRef, newState) {
  const hasPromptUpdates = newState.originalPrompt !== undefined || 
                          newState.optionA !== undefined || 
                          newState.optionB !== undefined;
  
  if (hasPromptUpdates) {
    if (newState.originalPrompt !== undefined) {
      stateRef.originalPrompt = newState.originalPrompt;
    }
    if (newState.optionA !== undefined) {
      stateRef.optionA = newState.optionA;
    }
    if (newState.optionB !== undefined) {
      stateRef.optionB = newState.optionB;
    }
    renderPrompts(stateRef);
  } else {
    stateRef.originalPrompt = "";
    stateRef.optionA = "";
    stateRef.optionB = "";
    initPromptEnhancer(stateRef);
  }
  
  const { originalPrompt, optionA, optionB, ...otherState } = newState;
  return otherState;
}

/**
 * Registers the enhance button click handler
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} dependencies - Required dependencies (renderStatus, saveState)
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


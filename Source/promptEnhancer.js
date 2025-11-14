/**
 * Prompt Enhancer Module
 * Handles all functionality related to the Prompt Enhancer section of the sidepanel
 */

/**
 * Helper function to clear a text field and dispatch input event
 * @param {HTMLElement} field - The text field element to clear
 */
function clearTextField(field) {
  if (field) {
    field.value = "";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Initializes the Prompt Enhancer section
 * Clears all prompt fields to ensure a clean working area on every load
 * @param {Object} stateRef - Reference to current state object
 */
export function initPromptEnhancer(stateRef) {
  stateRef.originalPrompt = "";
  stateRef.optionA = "";
  stateRef.optionB = "";
  
  requestAnimationFrame(() => {
    clearTextField(document.getElementById("original-prompt"));
    clearTextField(document.getElementById("option-a"));
    clearTextField(document.getElementById("option-b"));
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
 * Helper function to send messages to background script
 * @param {Object} message - Message object to send
 * @returns {Promise<Object>} Response from background script
 */
function sendChromeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("No response from background script"));
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Helper function to get user-friendly error messages
 * @param {Error} error - The error object
 * @param {string} operation - The operation that failed (e.g., "enhancement", "regeneration")
 * @returns {string} User-friendly error message
 */
function getErrorMessage(error, operation = "operation") {
  if (error.message?.includes("API key")) {
    return `Please add your OpenAI API key in settings to use prompt ${operation}.`;
  }
  return error.message || `Failed to ${operation} prompt. Please try again.`;
}

/**
 * Helper function to manage button loading state
 * @param {HTMLElement} button - The button element
 * @param {string} loadingText - Text to show while loading
 * @returns {Function} Function to restore button state
 */
function setButtonLoading(button, loadingText) {
  if (!button) return () => {};
  
  const originalText = button.textContent;
  const originalDisabled = button.disabled;
  
  button.disabled = true;
  button.textContent = loadingText;
  
  return () => {
    button.disabled = originalDisabled;
    button.textContent = originalText || "Enhance";
  };
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
  const restoreButton = setButtonLoading(enhanceButton, "Enhancing...");

  try {
    const response = await sendChromeMessage({
      type: "PROMPANION_PREPARE_ENHANCEMENT",
      prompt: basePrompt,
      openPanel: false
    });

    if (!response?.ok) {
      throw new Error(response?.reason || "Failed to generate enhancements");
    }

    // Check if API key is missing (fallback prompts were used)
    const hasApiKey = state.settings?.apiKey?.trim();
    if (!hasApiKey && (response.optionA?.includes("Refined focus:") || response.optionB?.includes("Refined focus:"))) {
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

    renderPrompts(state);
    if (renderStatus) {
      renderStatus(state);
    }
    
    if (saveState) {
      await saveState(state);
    }

    return state;
  } catch (error) {
    console.error("Prompanion: enhancement failed", error);
    alert(getErrorMessage(error, "enhancement"));
    return state;
  } finally {
    restoreButton();
  }
}

/**
 * Helper function to handle clipboard operations with button feedback
 * @param {HTMLElement} button - The button element
 * @param {string} text - Text to copy to clipboard
 * @param {string} successText - Text to show on success
 * @param {string} originalText - Original button text to restore
 */
async function handleClipboardOperation(button, text, successText, originalText) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = successText;
    setTimeout(() => {
      button.textContent = originalText;
    }, 1200);
  } catch (error) {
    console.error("Clipboard operation failed", error);
  }
}

/**
 * Registers event handlers for copy, insert, and regenerate buttons
 */
export function registerCopyHandlers() {
  // Register copy button handlers (if they exist)
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const field = document.getElementById(button.dataset.copy);
      if (field) {
        await handleClipboardOperation(button, field.value, "Copied", "Copy");
      }
    });
  });

  // Register insert button handlers using document-level event delegation
  // Remove any existing handler to prevent duplicates
  if (document._prompanionInsertHandler) {
    document.removeEventListener("click", document._prompanionInsertHandler, true);
  }

  const insertHandler = async (event) => {
    const button = event.target.closest("[data-insert]");
    if (!button || !button.closest(".prompt-preview")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const targetId = button.dataset.insert;
    if (!targetId) {
      console.error("Prompanion: Insert button missing data-insert attribute");
      return;
    }

    const field = document.getElementById(targetId);
    if (!field) {
      console.error("Prompanion: Insert target field not found:", targetId);
      return;
    }

    const textToInsert = field.value.trim();
    if (!textToInsert) {
      alert("No text to insert. Please enhance a prompt first.");
      return;
    }

    if (button.disabled) {
      return;
    }

    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = "Inserting...";

    try {
      console.log("[Prompanion Sidepanel] ========== SENDING INSERT TEXT MESSAGE ==========");
      console.log("[Prompanion Sidepanel] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
      console.log("[Prompanion Sidepanel] Text length:", textToInsert.length);
      
      const response = await sendChromeMessage({
        type: "PROMPANION_INSERT_TEXT",
        text: textToInsert
      });

      console.log("[Prompanion Sidepanel] Received response:", response);

      if (!response || !response.ok) {
        console.error("[Prompanion Sidepanel] Insert failed:", response?.reason);
        throw new Error(response?.reason || "Failed to insert text into ChatGPT");
      }

      console.log("[Prompanion Sidepanel] Insert succeeded!");
      button.textContent = "Inserted";
      setTimeout(() => {
        button.textContent = originalButtonText;
      }, 1200);
    } catch (error) {
      console.error("[Prompanion Sidepanel] Insert failed with error:", error);
      console.error("[Prompanion Sidepanel] Error message:", error.message);
      console.error("[Prompanion Sidepanel] Error stack:", error.stack);
      const errorMessage = error.message || "Failed to insert text. Please make sure ChatGPT is open and try again.";
      alert(errorMessage);
      button.textContent = originalButtonText;
    } finally {
      button.disabled = false;
    }
  };

  document._prompanionInsertHandler = insertHandler;
  document.addEventListener("click", insertHandler, true);

  // Register regenerate button handlers using document-level event delegation
  // Remove any existing handler to prevent duplicates
  if (document._prompanionRegenerateHandler) {
    document.removeEventListener("click", document._prompanionRegenerateHandler, true);
  }

  const regenerateHandler = async (event) => {
    const button = event.target.closest("[data-regenerate]");
    if (!button || !button.closest(".prompt-preview")) {
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

    if (button.disabled) {
      return;
    }

    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = "Regenerating...";

    try {
      const option = targetId === "option-a" ? "a" : targetId === "option-b" ? "b" : null;
      if (!option) {
        throw new Error(`Invalid option: ${targetId}`);
      }
      
      const response = await sendChromeMessage({
        type: "PROMPANION_REGENERATE_ENHANCEMENT",
        prompt: originalPrompt,
        option: option
      });

      if (!response || !response.ok) {
        throw new Error(response?.reason || "Failed to regenerate enhancement");
      }
    } catch (error) {
      console.error("Prompanion: regeneration failed", error);
      alert(getErrorMessage(error, "regeneration"));
    } finally {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
  };

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


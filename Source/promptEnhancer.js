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
  // Only clear if we're explicitly initializing, not if there are saved prompts
  // Check if state has prompts before clearing
  const hasPrompts = stateRef && (stateRef.originalPrompt || stateRef.optionA || stateRef.optionB);
  
  console.log("[Prompanion] initPromptEnhancer called:", {
    hasPrompts,
    hasOriginalPrompt: !!stateRef?.originalPrompt,
    hasOptionA: !!stateRef?.optionA,
    hasOptionB: !!stateRef?.optionB
  });
  
  if (!hasPrompts) {
    console.log("[Prompanion] No prompts in state, clearing fields");
    stateRef.originalPrompt = "";
    stateRef.optionA = "";
    stateRef.optionB = "";
    
    requestAnimationFrame(() => {
      clearTextField(document.getElementById("original-prompt"));
      clearTextField(document.getElementById("option-a"));
      clearTextField(document.getElementById("option-b"));
    });
  } else {
    console.log("[Prompanion] Prompts exist in state, NOT clearing - will be rendered separately");
  }
}

/**
 * Renders the prompt values into the DOM
 * @param {Object} prompts - Object containing originalPrompt, optionA, and optionB
 */
export function renderPrompts({ originalPrompt, optionA, optionB }) {
  // Wait for DOM to be ready if needed
  if (document.readyState === "loading") {
    console.log("[Prompanion] DOM not ready, waiting...");
    document.addEventListener("DOMContentLoaded", () => renderPrompts({ originalPrompt, optionA, optionB }));
    return;
  }
  
  const originalField = document.getElementById("original-prompt");
  const optionAField = document.getElementById("option-a");
  const optionBField = document.getElementById("option-b");
  
  console.log("[Prompanion] renderPrompts called with:", {
    originalPrompt: originalPrompt?.substring(0, 50) || "(empty)",
    optionA: optionA?.substring(0, 50) || "(empty)",
    optionB: optionB?.substring(0, 50) || "(empty)",
    originalPromptLength: originalPrompt?.length || 0,
    optionALength: optionA?.length || 0,
    optionBLength: optionB?.length || 0,
    hasOriginalField: !!originalField,
    hasOptionAField: !!optionAField,
    hasOptionBField: !!optionBField,
    documentReadyState: document.readyState
  });
  
  // If fields don't exist, try again after a short delay
  if (!originalField || !optionAField || !optionBField) {
    console.warn("[Prompanion] DOM fields not found, retrying in 100ms...");
    setTimeout(() => renderPrompts({ originalPrompt, optionA, optionB }), 100);
    return;
  }
  
  // DIRECT VALUE ASSIGNMENT - no complex logic
  if (originalField) {
    originalField.readOnly = false;
    originalField.value = originalPrompt || "";
    console.log("[Prompanion] Set original-prompt, value length:", originalField.value.length);
  }
  
  if (optionAField) {
    const valueToSet = optionA || "";
    optionAField.readOnly = true;
    optionAField.value = valueToSet;
    // Force multiple updates
    optionAField.setAttribute("value", valueToSet);
    if (optionAField.textContent !== undefined) {
      optionAField.textContent = valueToSet;
    }
    console.log("[Prompanion] Set option-a, value length:", valueToSet.length, "field has:", optionAField.value.length);
    // Verify it stuck
    setTimeout(() => {
      if (optionAField.value !== valueToSet) {
        console.error("[Prompanion] option-a value was lost! Re-setting...");
        optionAField.value = valueToSet;
      }
    }, 10);
  }
  
  if (optionBField) {
    const valueToSet = optionB || "";
    optionBField.readOnly = true;
    optionBField.value = valueToSet;
    // Force multiple updates
    optionBField.setAttribute("value", valueToSet);
    if (optionBField.textContent !== undefined) {
      optionBField.textContent = valueToSet;
    }
    console.log("[Prompanion] Set option-b, value length:", valueToSet.length, "field has:", optionBField.value.length);
    // Verify it stuck
    setTimeout(() => {
      if (optionBField.value !== valueToSet) {
        console.error("[Prompanion] option-b value was lost! Re-setting...");
        optionBField.value = valueToSet;
      }
    }, 10);
  }
  
  // Force a reflow to ensure values are visible
  if (originalField) void originalField.offsetHeight;
  if (optionAField) void optionAField.offsetHeight;
  if (optionBField) void optionBField.offsetHeight;
  
  // Verify the values were actually set
  setTimeout(() => {
    console.log("[Prompanion] Verification - field values:", {
      originalFieldValue: originalField?.value?.substring(0, 50),
      optionAFieldValue: optionAField?.value?.substring(0, 50),
      optionBFieldValue: optionBField?.value?.substring(0, 50)
    });
  }, 50);
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

    console.log("[Prompanion] handleEnhance received response:", {
      ok: response?.ok,
      hasOptionA: !!response?.optionA,
      hasOptionB: !!response?.optionB,
      error: response?.error,
      optionA: response?.optionA?.substring(0, 50),
      optionB: response?.optionB?.substring(0, 50)
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

    console.log("[Prompanion] handleEnhance updating state:", {
      originalPrompt: state.originalPrompt?.substring(0, 50),
      optionA: state.optionA?.substring(0, 50),
      optionB: state.optionB?.substring(0, 50),
      optionALength: state.optionA?.length,
      optionBLength: state.optionB?.length
    });

    // Ensure DOM elements exist before rendering
    const originalField = document.getElementById("original-prompt");
    const optionAField = document.getElementById("option-a");
    const optionBField = document.getElementById("option-b");
    
    console.log("[Prompanion] DOM elements found:", {
      hasOriginalField: !!originalField,
      hasOptionAField: !!optionAField,
      hasOptionBField: !!optionBField
    });

    if (!originalField || !optionAField || !optionBField) {
      console.error("[Prompanion] Missing DOM elements for prompt display!");
    }

    renderPrompts(state);
    console.log("[Prompanion] renderPrompts called, checking values:", {
      originalFieldValue: originalField?.value?.substring(0, 50),
      optionAFieldValue: optionAField?.value?.substring(0, 50),
      optionBFieldValue: optionBField?.value?.substring(0, 50)
    });
    
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
      
      // Get the current option's text to regenerate (re-word it for better clarity)
      // If the option is empty, use the original prompt as fallback
      const currentOptionField = document.getElementById(targetId);
      const currentOptionText = currentOptionField?.value?.trim();
      const promptToRegenerate = currentOptionText || originalPrompt;
      
      if (!promptToRegenerate) {
        alert("No prompt to regenerate. Please enhance a prompt first.");
        return;
      }
      
      const response = await sendChromeMessage({
        type: "PROMPANION_REGENERATE_ENHANCEMENT",
        prompt: promptToRegenerate, // Regenerate/re-word the current option's text
        option: option
      });

      if (!response || !response.ok) {
        throw new Error(response?.reason || "Failed to regenerate enhancement");
      }
      
      // The state will be updated via PROMPANION_STATE_PUSH message from background
      // No need to manually update here
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
 * Initializes tab switching functionality for Original, Option A, and Option B tabs
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
  // Check if we have actual prompt content (not just undefined check, but also not empty strings unless explicitly clearing)
  const hasPromptUpdates = (newState.originalPrompt !== undefined && newState.originalPrompt !== null) || 
                          (newState.optionA !== undefined && newState.optionA !== null) || 
                          (newState.optionB !== undefined && newState.optionB !== null);
  
  // Only update if we have actual content or if we're explicitly clearing (empty strings mean clear)
  if (hasPromptUpdates) {
    let shouldRender = false;
    
    if (newState.originalPrompt !== undefined && newState.originalPrompt !== null) {
      stateRef.originalPrompt = newState.originalPrompt;
      shouldRender = true;
    }
    if (newState.optionA !== undefined && newState.optionA !== null) {
      stateRef.optionA = newState.optionA;
      shouldRender = true;
    }
    if (newState.optionB !== undefined && newState.optionB !== null) {
      stateRef.optionB = newState.optionB;
      shouldRender = true;
    }
    
    // Only render if we actually updated something
    if (shouldRender) {
      console.log("[Prompanion] handleStatePush updating prompts:", {
        originalPrompt: stateRef.originalPrompt?.substring(0, 50),
        optionA: stateRef.optionA?.substring(0, 50),
        optionB: stateRef.optionB?.substring(0, 50)
      });
      renderPrompts(stateRef);
    }
  } else {
    // Only clear if there are no prompt fields at all in newState
    // Don't clear if we're just updating other parts of state
    const hasAnyPromptFields = 'originalPrompt' in newState || 'optionA' in newState || 'optionB' in newState;
    if (!hasAnyPromptFields) {
      stateRef.originalPrompt = "";
      stateRef.optionA = "";
      stateRef.optionB = "";
      initPromptEnhancer(stateRef);
    }
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


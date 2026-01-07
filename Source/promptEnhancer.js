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
  const hasPrompts = stateRef && (stateRef.originalPrompt || stateRef.optionA);
  
  console.log("[PromptProfile™] initPromptEnhancer called:", {
    hasPrompts,
    hasOriginalPrompt: !!stateRef?.originalPrompt,
    hasOptionA: !!stateRef?.optionA
  });
  
  if (!hasPrompts) {
    console.log("[PromptProfile™] No prompts in state, clearing fields");
    stateRef.originalPrompt = "";
    stateRef.optionA = "";
    
    requestAnimationFrame(() => {
      clearTextField(document.getElementById("original-prompt"));
      clearTextField(document.getElementById("option-a"));
    });
  } else {
    console.log("[PromptProfile™] Prompts exist in state, NOT clearing - will be rendered separately");
  }
}

/**
 * Renders the prompt values into the DOM
 * @param {Object} prompts - Object containing originalPrompt and optionA
 */
export function renderPrompts({ originalPrompt, optionA }) {
  // Wait for DOM to be ready if needed
  if (document.readyState === "loading") {
    console.log("[PromptProfile™] DOM not ready, waiting...");
    document.addEventListener("DOMContentLoaded", () => renderPrompts({ originalPrompt, optionA }));
    return;
  }
  
  const originalField = document.getElementById("original-prompt");
  const optionAField = document.getElementById("option-a");
  
  // renderPrompts called - verbose logging removed
  
  // If fields don't exist, try again after a short delay
  if (!originalField || !optionAField) {
    console.warn("[PromptProfile™] DOM fields not found, retrying in 100ms...");
    setTimeout(() => renderPrompts({ originalPrompt, optionA }), 100);
    return;
  }
  
  // DIRECT VALUE ASSIGNMENT - no complex logic
  if (originalField) {
    originalField.readOnly = false;
    originalField.value = originalPrompt || "";
  }
  
  if (optionAField) {
    const valueToSet = optionA || "";
    optionAField.readOnly = false;
    optionAField.value = valueToSet;
    // Force multiple updates
    optionAField.setAttribute("value", valueToSet);
    if (optionAField.textContent !== undefined) {
      optionAField.textContent = valueToSet;
    }
    // Verify it stuck
    setTimeout(() => {
      if (optionAField.value !== valueToSet) {
        console.error("[PromptProfile™] option-a value was lost! Re-setting...");
        optionAField.value = valueToSet;
      }
    }, 10);
  }
  
  // Force a reflow to ensure values are visible
  if (originalField) void originalField.offsetHeight;
  if (optionAField) void optionAField.offsetHeight;
  
  // Verification removed - verbose logging reduced
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

    console.log("[PromptProfile™] handleEnhance received response:", {
      ok: response?.ok,
      hasOptionA: !!response?.optionA,
      error: response?.error,
      optionA: response?.optionA?.substring(0, 50)
    });

    if (!response?.ok) {
      throw new Error(response?.reason || "Failed to generate enhancement");
    }

    // Check for authentication errors
    if (response.error === "NO_AUTH_TOKEN" || response.error === "UNAUTHORIZED") {
      alert("Please log in to your PromptProfile™ account to use AI features. Click the account button in the header to log in.");
      return state;
    }

    // Check for limit reached
    if (response.error === "LIMIT_REACHED") {
      alert("You have reached your enhancement limit. Please upgrade your plan to continue.");
      return state;
    }

    // Update state with the enhanced prompt
    state.originalPrompt = basePrompt;
    state.optionA = response.optionA || basePrompt;
    // Don't increment locally - fetch from server to get accurate count after backend increment

    console.log("[PromptProfile™] handleEnhance updating state:", {
      originalPrompt: state.originalPrompt?.substring(0, 50),
      optionA: state.optionA?.substring(0, 50),
      optionALength: state.optionA?.length
    });

    // Ensure DOM elements exist before rendering
    const originalField = document.getElementById("original-prompt");
    const optionAField = document.getElementById("option-a");
    
    console.log("[PromptProfile™] DOM elements found:", {
      hasOriginalField: !!originalField,
      hasOptionAField: !!optionAField
    });

    if (!originalField || !optionAField) {
      console.error("[PromptProfile™] Missing DOM elements for prompt display!");
    }

    renderPrompts(state);
    console.log("[PromptProfile™] renderPrompts called, checking values:", {
      originalFieldValue: originalField?.value?.substring(0, 50),
      optionAFieldValue: optionAField?.value?.substring(0, 50)
    });
    
    if (renderStatus) {
      renderStatus(state);
    }
    
    if (saveState) {
      await saveState(state);
    }

    // Update enhancements display from server after successful enhancement
    // Use count from response if available, otherwise fetch fresh data
    if (dependencies.updateEnhancementsDisplay) {
      // If the response includes updated usage data, use it directly
      if (response.enhancementsUsed !== undefined && response.enhancementsLimit !== undefined) {
        console.log("[PromptProfile™] Using usage data from enhancement response:", {
          enhancementsUsed: response.enhancementsUsed,
          enhancementsLimit: response.enhancementsLimit
        });
        // Update state and UI directly
        if (state) {
          state.enhancementsUsed = response.enhancementsUsed;
          state.enhancementsLimit = response.enhancementsLimit;
        }
        const countEl = document.getElementById("enhancements-count");
        const limitEl = document.getElementById("enhancements-limit");
        if (countEl) {
          countEl.textContent = response.enhancementsUsed;
          console.log("[PromptProfile™] Updated enhancements count to:", response.enhancementsUsed);
        }
        if (limitEl) {
          limitEl.textContent = response.enhancementsLimit;
        }
        // Also update via renderStatus to ensure consistency
        if (renderStatus) {
          renderStatus({
            ...state,
            enhancementsUsed: response.enhancementsUsed,
            enhancementsLimit: response.enhancementsLimit
          });
        }
      } else {
        // Otherwise, fetch fresh data with a delay to ensure DB update completed
        console.log("[PromptProfile™] No usage data in response, fetching fresh data...");
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for DB update
        await dependencies.updateEnhancementsDisplay();
      }
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
 * Handles saving a prompt to the library
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} dependencies - Required dependencies (renderLibrary, saveState, LIBRARY_SCHEMA_VERSION)
 * @param {string} promptText - The prompt text to save
 */
async function handleSaveToLibrary(stateRef, dependencies, promptText) {
  const { renderLibrary, saveState, LIBRARY_SCHEMA_VERSION } = dependencies;
  
  if (!promptText || !promptText.trim()) {
    alert("No prompt to save. Please enhance a prompt first.");
    return;
  }

  const dialog = document.getElementById("save-to-library-dialog");
  const form = document.getElementById("save-to-library-form");
  const folderSelect = document.getElementById("save-to-library-folder-select");
  const newFolderWrapper = document.getElementById("save-to-library-new-folder-wrapper");
  const newFolderInput = document.getElementById("save-to-library-new-folder-input");
  const messageEl = document.getElementById("save-to-library-message");
  const saveButton = form.querySelector("button[value='confirm']");
  const cancelButtons = form.querySelectorAll(".save-to-library__cancel");

  if (!dialog || !form || !folderSelect || !newFolderWrapper || !newFolderInput || !messageEl) {
    console.error("Save to Library dialog elements not found");
    return;
  }

  // Populate folder dropdown
  folderSelect.innerHTML = '<option value="">-- Select a folder --</option>';
  stateRef.library.forEach((folder, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = folder.name;
    folderSelect.appendChild(option);
  });
  const createNewOption = document.createElement("option");
  createNewOption.value = "__create_new__";
  createNewOption.textContent = "Create New Folder";
  folderSelect.appendChild(createNewOption);

  // Reset form state
  folderSelect.value = "";
  newFolderWrapper.style.display = "none";
  newFolderInput.value = "";
  messageEl.style.display = "none";
  messageEl.textContent = "";

  // Handle dropdown change
  const handleFolderSelectChange = () => {
    const selectedValue = folderSelect.value;
    if (selectedValue === "__create_new__") {
      newFolderWrapper.style.display = "block";
      newFolderInput.focus();
    } else {
      newFolderWrapper.style.display = "none";
      newFolderInput.value = "";
    }
    messageEl.style.display = "none";
    messageEl.textContent = "";
  };

  folderSelect.removeEventListener("change", handleFolderSelectChange);
  folderSelect.addEventListener("change", handleFolderSelectChange);

  // Handle cancel buttons
  const handleCancel = (event) => {
    event.preventDefault();
    dialog.close("cancel");
  };

  cancelButtons.forEach(button => {
    button.onclick = handleCancel;
  });

  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault();
    
    const selectedValue = folderSelect.value;
    
    if (!selectedValue || selectedValue === "") {
      messageEl.textContent = "Please select a folder or create a new one.";
      messageEl.style.display = "block";
      return;
    }

    if (selectedValue === "__create_new__") {
      const newFolderName = newFolderInput.value.trim();
      if (!newFolderName) {
        messageEl.textContent = "Please enter a folder name.";
        messageEl.style.display = "block";
        newFolderInput.focus();
        return;
      }

      // Check for duplicate folder names
      const folderExists = stateRef.library.some(
        folder => folder.name.toLowerCase() === newFolderName.toLowerCase()
      );
      if (folderExists) {
        messageEl.textContent = "A folder with this name already exists.";
        messageEl.style.display = "block";
        newFolderInput.focus();
        return;
      }

      // Create new folder with the prompt
      const newFolder = {
        name: newFolderName,
        prompts: [promptText.trim()]
      };
      stateRef.library.unshift(newFolder);
      stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
    } else {
      // Add to existing folder
      const folderIndex = Number.parseInt(selectedValue, 10);
      if (Number.isNaN(folderIndex) || !stateRef.library[folderIndex]) {
        messageEl.textContent = "Invalid folder selection.";
        messageEl.style.display = "block";
        return;
      }

      const folder = stateRef.library[folderIndex];
      folder.prompts.unshift(promptText.trim());
      // Limit to 200 prompts per folder
      folder.prompts = folder.prompts.slice(0, 200);
      stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
    }

    // Save state and update UI
    await saveState(stateRef);
    renderLibrary(stateRef.library);
    
    dialog.close("confirm");
  };

  saveButton.onclick = handleSubmit;

  // Show dialog
  dialog.showModal();

  // Wait for dialog to close
  return new Promise((resolve) => {
    const handleClose = () => {
      dialog.removeEventListener("close", handleClose);
      folderSelect.removeEventListener("change", handleFolderSelectChange);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", handleClose, { once: true });
  });
}

/**
 * Registers event handlers for copy, insert, regenerate, and save-to-library buttons
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} dependencies - Required dependencies (renderLibrary, saveState, LIBRARY_SCHEMA_VERSION)
 */
export function registerCopyHandlers(stateRef = null, dependencies = {}) {
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
      console.log("[PromptProfile™ Sidepanel] ========== SENDING INSERT TEXT MESSAGE ==========");
      console.log("[PromptProfile™ Sidepanel] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
      console.log("[PromptProfile™ Sidepanel] Text length:", textToInsert.length);
      
      const response = await sendChromeMessage({
        type: "PROMPANION_INSERT_TEXT",
        text: textToInsert
      });

      console.log("[PromptProfile™ Sidepanel] Received response:", response);

      if (!response || !response.ok) {
        console.error("[PromptProfile™ Sidepanel] Insert failed:", response?.reason);
        throw new Error(response?.reason || "Failed to insert text into ChatGPT");
      }

      console.log("[PromptProfile™ Sidepanel] Insert succeeded!");
      button.textContent = "Inserted";
      setTimeout(() => {
        button.textContent = originalButtonText;
      }, 1200);
    } catch (error) {
      console.error("[PromptProfile™ Sidepanel] Insert failed with error:", error);
      console.error("[PromptProfile™ Sidepanel] Error message:", error.message);
      console.error("[PromptProfile™ Sidepanel] Error stack:", error.stack);
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
      // Only option-a exists now (Option B removed)
      if (targetId !== "option-a") {
        throw new Error(`Invalid option: ${targetId}`);
      }
      
      // Get the current enhanced text to regenerate with a different approach
      const currentOptionField = document.getElementById(targetId);
      const currentEnhanced = currentOptionField?.value?.trim();
      
      if (!currentEnhanced) {
        alert("No enhanced prompt to regenerate. Please enhance a prompt first.");
        return;
      }
      
      // Regenerate with a different approach - pass current enhanced version
      const response = await sendChromeMessage({
        type: "PROMPANION_REGENERATE_ENHANCEMENT",
        prompt: currentEnhanced // Current enhanced prompt to regenerate with different approach
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

  // Register save-to-library button handler using document-level event delegation
  // Remove any existing handler to prevent duplicates
  if (document._prompanionSaveToLibraryHandler) {
    document.removeEventListener("click", document._prompanionSaveToLibraryHandler, true);
  }

  const saveToLibraryHandler = async (event) => {
    const button = event.target.closest("[data-save-to-library]");
    if (!button || !button.closest(".prompt-preview")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!stateRef || !dependencies.renderLibrary || !dependencies.saveState) {
      console.error("Save to Library: Missing stateRef or dependencies");
      alert("Unable to save to library. Please try again.");
      return;
    }

    const targetId = button.dataset.saveToLibrary || button.getAttribute("data-save-to-library");
    if (!targetId) {
      console.error("Prompanion: Save to Library button missing data-save-to-library attribute");
      return;
    }

    const field = document.getElementById(targetId);
    if (!field) {
      console.error("Prompanion: Save to Library target field not found:", targetId);
      return;
    }

    const promptText = field.value.trim();
    if (!promptText) {
      alert("No prompt to save. Please enhance a prompt first.");
      return;
    }

    if (button.disabled) {
      return;
    }

    const originalButtonText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      await handleSaveToLibrary(stateRef, dependencies, promptText);
      button.textContent = "Saved!";
      setTimeout(() => {
        button.textContent = originalButtonText;
      }, 1500);
    } catch (error) {
      console.error("Prompanion: save to library failed", error);
      alert("Failed to save prompt to library. Please try again.");
      button.textContent = originalButtonText;
    } finally {
      button.disabled = false;
    }
  };

  document._prompanionSaveToLibraryHandler = saveToLibraryHandler;
  document.addEventListener("click", saveToLibraryHandler, true);
}

/**
 * Initializes tab switching functionality for Original and Enhanced tabs
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
  const { originalPrompt, optionA, ...otherState } = restoredState;
  
  // Update state with everything except prompt enhancer fields
  Object.assign(stateRef, otherState);
  
  // Explicitly keep prompt enhancer fields empty
  stateRef.originalPrompt = "";
  stateRef.optionA = "";
  
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
                          (newState.optionA !== undefined && newState.optionA !== null);
  
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
    
    // Only render if we actually updated something
    if (shouldRender) {
      console.log("[PromptProfile™] handleStatePush updating prompts:", {
        originalPrompt: stateRef.originalPrompt?.substring(0, 50),
        optionA: stateRef.optionA?.substring(0, 50)
      });
      renderPrompts(stateRef);
    }
  } else {
    // Only clear if there are no prompt fields at all in newState
    // Don't clear if we're just updating other parts of state
    const hasAnyPromptFields = 'originalPrompt' in newState || 'optionA' in newState;
    if (!hasAnyPromptFields) {
      stateRef.originalPrompt = "";
      stateRef.optionA = "";
      initPromptEnhancer(stateRef);
    }
  }
  
  const { originalPrompt, optionA, ...otherState } = newState;
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

  let isProcessing = false; // Prevent multiple simultaneous enhancements

  enhanceButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Prevent multiple clicks while processing
    if (isProcessing) {
      console.log("[PromptProfile™] Enhancement already in progress, ignoring click");
      return;
    }
    
    isProcessing = true;
    try {
    await handleEnhance(stateRef, dependencies);
    } finally {
      // Reset flag after a short delay to prevent rapid clicks
      setTimeout(() => {
        isProcessing = false;
      }, 1000);
    }
  });
}


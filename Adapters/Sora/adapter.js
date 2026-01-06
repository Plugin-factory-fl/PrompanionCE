// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[Prompanion Sora] ========== ADAPTER.JS LOADING ==========");
console.log("[Prompanion Sora] Timestamp:", new Date().toISOString());
console.log("[Prompanion Sora] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[Prompanion Sora] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
}

const BUTTON_ID = AdapterBase.BUTTON_ID;
const BUTTON_CLASS = AdapterBase.BUTTON_CLASS;
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

console.log("[Prompanion Sora] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
let domObserverStarted = false;

let enhanceTooltipElement = null;
let enhanceTooltipTimer = null;
let enhanceTooltipDismissed = false;
let enhanceTooltipActiveTextarea = null;
let lastEnhanceTextSnapshot = "";
let enhanceTooltipResizeHandler = null;
let floatingButtonElement = null;
let floatingButtonWrapper = null;
let floatingButtonTargetContainer = null;
let floatingButtonTargetInput = null;
let enhanceActionInFlight = false;
let highlightObserver = null;

function ensureStyle() {
  // Load generic adapter styles from external CSS file
  const styleId = "prompanion-adapter-styles";
  let styleElement = document.getElementById(styleId);
  
  if (!styleElement) {
    // Load CSS file from extension
    const cssUrl = chrome.runtime.getURL("/styles/AdapterStyles.css");
    const link = document.createElement("link");
    link.id = styleId;
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = cssUrl;
    document.head.appendChild(link);
  }
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  // Sora-specific composer selectors - adjust based on actual DOM structure
  return !!(
    element.closest("textarea") ||
    element.closest("[contenteditable='true']") ||
    element.closest("form") ||
    element.closest("[role='textbox']")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

// Selection Toolbar system moved to AdapterBase
// Initialize it with Sora-specific condition functions
function initSelectionToolbar() {
  AdapterBase.initSelectionToolbar({
    shouldShowToolbar: (selection) => {
      const text = selection?.toString().trim();
      return !!(selection && !selection.isCollapsed && text && 
                !selectionWithinComposer(selection));
    },
    onAction: (text) => {
      submitSelectionToSideChat(text);
    },
    buttonText: "Elaborate",
    toolbarId: SELECTION_TOOLBAR_ID,
    visibleClass: SELECTION_TOOLBAR_VISIBLE_CLASS
  });
}

// Global click handler to ensure Refine button always works
document.addEventListener("mousedown", (e) => {
  const refineButton = e.target.closest(".prompanion-enhance-tooltip__action");
  if (refineButton && !refineButton.classList.contains("prompanion-enhance-tooltip__upgrade")) {
    console.log("[Prompanion Sora] Global capture: Refine button mousedown detected");
    // Trigger refinement on mousedown to beat any blur/render issues
    handleRefineButtonClick(e);
  }
}, true);

// Keep click listener just to prevent default actions if needed
document.addEventListener("click", (e) => {
  const refineButton = e.target.closest(".prompanion-enhance-tooltip__action");
  if (refineButton) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

async function submitSelectionToSideChat(text) {
  console.log("[Prompanion Sora] ========== submitSelectionToSideChat CALLED ==========");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[Prompanion Sora] Snippet:", snippet?.substring(0, 50));
  
  if (!snippet) {
    return;
  }

  try {
    console.log("[Prompanion Sora] ========== SENDING PROMPANION_SIDECHAT_REQUEST ==========");
    
    AdapterBase.sendMessage({ 
      type: "PROMPANION_SIDECHAT_REQUEST", 
      text: snippet,
      chatHistory: [] // Sora explore page may not have chat history
    }, (response) => {
      console.log("[Prompanion Sora] ========== PROMPANION_SIDECHAT_REQUEST RESPONSE ==========");
      console.log("[Prompanion Sora] Response:", response);
      if (!response?.ok) {
        console.warn("Prompanion: sidechat request rejected", response?.reason);
      }
    }).catch((error) => {
      console.warn("Prompanion: failed to request sidechat from selection", error);
    });
  } catch (error) {
    console.error("Prompanion: sidechat request threw synchronously", error);
  }
}

function handleSelectionChange() {
  console.log("[Prompanion Sora] handleSelectionChange fired");
  AdapterBase.requestSelectionToolbarUpdate();
}

function createIcon() {
  const icon = document.createElement("span");
  icon.className = `${BUTTON_CLASS}__icon`;
  icon.setAttribute("aria-hidden", "true");
  const assetUrl = chrome.runtime.getURL("/Assets/icons/icon48.png");
  icon.style.backgroundImage = `url('${assetUrl}')`;
  icon.dataset.iconUrl = assetUrl;
  return icon;
}

function requestPromptEnhancement(promptText) {
  return AdapterBase.sendMessage({ type: "PROMPANION_PREPARE_ENHANCEMENT", prompt: promptText, openPanel: false })
    .catch((error) => {
      const errorMessage = error?.message || "";
      if (errorMessage.includes("Extension context invalidated")) {
        console.error("[Prompanion Sora] Extension context invalidated - user should reload page");
      } else {
        console.warn("[Prompanion Sora] Enhancement request failed:", error);
      }
      return { ok: false, reason: errorMessage || "UNKNOWN_ERROR" };
    });
}

/**
 * Finds the active composer input node
 * @returns {HTMLElement|null} The composer input node or null if not found
 */
function findComposerNode() {
  // Try tracked nodes first
  let composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  if (composerNode) {
    return composerNode;
  }

  // Fallback: locate composer using selectors
  const composer = locateComposer();
  if (composer?.input) {
    return composer.input;
  }

  // Last resort: query for common selectors
  const selectors = [
    "textarea:not([readonly])",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true']",
    "input[type='text']"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      return element;
    }
  }

  return null;
}

// Generic text insertion moved to AdapterBase.setEditableElementText()
// This wrapper maintains Sora-specific logging
function setComposerText(node, text) {
  return AdapterBase.setEditableElementText(node, text, { verbose: true });
}

function showSoraTooltip(button) {
  // Custom tooltip handler for Sora - positions above the button
  AdapterBase.ensureTooltipResources(BUTTON_ID);
  const data = AdapterBase.tooltipRegistry.get(button);
  const container = document.getElementById(`${BUTTON_ID}-tooltip-layer`);
  if (!data || !container) return;
  
  let tooltip = button._prompanionTooltip;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "prompanion-tooltip";
    tooltip.setAttribute("role", "tooltip");
    const text = document.createElement("span");
    text.textContent = data.text;
    const hidden = document.createElement("span");
    hidden.className = "prompanion-visually-hidden";
    hidden.textContent = data.text;
    tooltip.append(text, hidden);
    button._prompanionTooltip = tooltip;
    container.append(tooltip);
  }
  
  // Position above the button (Sora-specific)
  const rect = button.getBoundingClientRect();
  tooltip.style.top = `${rect.top + window.scrollY - 5}px`;
  tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
  tooltip.style.transform = "translate(-50%, -100%)";
  tooltip.classList.add("is-visible");
}

function buildButton() {
  ensureStyle();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.append(createIcon());
  // Use AdapterBase for tooltip attachment, but custom show handler for positioning
  AdapterBase.attachTooltip(button, "Open Prompanion to enhance your prompts for the best response.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("Prompanion: failed to open sidebar from Sora adapter", e)));
  button.addEventListener("mouseenter", () => showSoraTooltip(button));
  button.addEventListener("focus", () => showSoraTooltip(button));
  button.addEventListener("mouseleave", () => AdapterBase.hideTooltip(button));
  button.addEventListener("blur", () => AdapterBase.hideTooltip(button));
  return button;
}

function ensureFloatingButton() {
  if (floatingButtonWrapper && floatingButtonElement) {
    floatingButtonWrapper.style.width = floatingButtonWrapper.style.height = BUTTON_SIZE.wrapper;
    floatingButtonElement.style.width = floatingButtonElement.style.height = BUTTON_SIZE.element;
    return;
  }
  ensureStyle();
  floatingButtonWrapper = document.getElementById(`${BUTTON_ID}-wrapper`);
  if (!floatingButtonWrapper) {
    floatingButtonWrapper = document.createElement("div");
    floatingButtonWrapper.id = `${BUTTON_ID}-wrapper`;
    floatingButtonWrapper.style.position = "absolute";
    floatingButtonWrapper.style.zIndex = "2147483000";
    floatingButtonWrapper.style.pointerEvents = "auto";
    floatingButtonWrapper.style.display = "flex";
    floatingButtonWrapper.style.alignItems = "center";
    floatingButtonWrapper.style.justifyContent = "center";
  }
  floatingButtonWrapper.style.width = floatingButtonWrapper.style.height = BUTTON_SIZE.wrapper;
  floatingButtonElement = document.getElementById(BUTTON_ID) ?? buildButton();
  floatingButtonElement.style.width = floatingButtonElement.style.height = BUTTON_SIZE.element;
  if (!floatingButtonElement.isConnected) floatingButtonWrapper.append(floatingButtonElement);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  if (!floatingButtonElement) return;
  
  // Use XPath to find the target container (parent of reference element)
  // Reference element: /html/body/main/div[3]/div[2]/div/div/div/div/div/div[3]/div[2]/div[2]
  let targetContainer = null;
  let referenceElement = null;
  
  try {
    // Find the reference element first
    const xpathResult = document.evaluate(
      '/html/body/main/div[3]/div[2]/div/div/div/div/div/div[3]/div[2]/div[2]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    referenceElement = xpathResult.singleNodeValue;
    
    if (referenceElement && referenceElement instanceof HTMLElement) {
      // Use parent as container
      targetContainer = referenceElement.parentElement;
    }
  } catch (error) {
    console.warn("[Prompanion Sora] XPath error:", error);
  }
  
  if (!targetContainer || !referenceElement) {
    console.warn("[Prompanion Sora] Target container or reference element not found, will retry...");
    if (inputNode && floatingButtonElement) {
      setTimeout(() => {
        positionFloatingButton(inputNode, null);
      }, 100);
    }
    return;
  }
  
  // Ensure container has relative positioning
  const containerStyle = getComputedStyle(targetContainer);
  if (containerStyle.position === "static") {
    targetContainer.style.position = "relative";
  }
  
  // Calculate spacing - position 10px to the left of the reference element
  let spacing = 8; // Default 8px from right edge
  
  if (referenceElement && referenceElement.offsetParent) {
    const referenceRect = referenceElement.getBoundingClientRect();
    const containerRect = targetContainer.getBoundingClientRect();
    
    // Calculate reference element's left edge relative to container's right edge
    const referenceLeftFromContainer = containerRect.right - referenceRect.left;
    const spacingBetween = 5; // 5px spacing to the left of reference element
    
    // To place our button 10px to the left of reference element's left edge:
    // Our button's RIGHT edge should be at: referenceLeftFromContainer + spacingBetween
    spacing = referenceLeftFromContainer + spacingBetween;
    
    // Ensure spacing is at least 8px from right edge
    if (spacing < 8) {
      spacing = 8;
    }
  }
  
  // Get reference element's vertical center for alignment
  let topOffset = "50%";
  if (referenceElement && referenceElement.offsetParent) {
    const referenceRect = referenceElement.getBoundingClientRect();
    const containerRect = targetContainer.getBoundingClientRect();
    const referenceCenter = referenceRect.top + referenceRect.height / 2;
    const containerTop = containerRect.top;
    topOffset = `${referenceCenter - containerTop}px`;
  }
  
  ensureFloatingButton();
  
  // Move wrapper to container
  if (floatingButtonWrapper.parentElement !== targetContainer) {
    if (floatingButtonWrapper.parentElement) {
      floatingButtonWrapper.parentElement.removeChild(floatingButtonWrapper);
    }
    targetContainer.appendChild(floatingButtonWrapper);
  }
  
  // Apply positioning styles
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = topOffset;
  floatingButtonWrapper.style.right = `${spacing}px`;
  floatingButtonWrapper.style.transform = "translateY(-50%)";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.display = "flex";
  
  // Also schedule for next frame to override any code that runs after this
  requestAnimationFrame(() => {
    if (!floatingButtonWrapper || !targetContainer) return;
    
    // Force move again in case something moved it
    if (floatingButtonWrapper.parentElement !== targetContainer) {
      targetContainer.appendChild(floatingButtonWrapper);
    }
    
    // Force apply styles again to override anything that changed them
    floatingButtonWrapper.style.position = "absolute";
    floatingButtonWrapper.style.top = topOffset;
    floatingButtonWrapper.style.right = `${spacing}px`;
    floatingButtonWrapper.style.transform = "translateY(-50%)";
    floatingButtonWrapper.style.left = "auto";
    floatingButtonWrapper.style.bottom = "auto";
    floatingButtonWrapper.style.margin = "0";
  });
}

function refreshFloatingButtonPosition() {
  // Refresh button position
  positionFloatingButton(floatingButtonTargetInput, null);
}

function placeButton(targetContainer, inputNode) {
  // For Sora, we don't need the inputNode for button placement
  // The button goes in the settings container, not near the input
  ensureFloatingButton();
  floatingButtonTargetInput = inputNode; // Keep for text insertion purposes
  positionFloatingButton(inputNode, null);
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  let observerTimeout = null;
  const observer = new MutationObserver(() => {
    if (observerTimeout) clearTimeout(observerTimeout);
    observerTimeout = setTimeout(() => {
      if (document.hidden) return;
      
      const composer = locateComposer();
      if (composer) {
        setupEnhanceTooltip(composer.input, composer.container);
      }
      // Sticky button doesn't need placement or position refresh
    }, 500); // Slower debounce to prevent UI lag
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  console.log("[Prompanion Sora] locateComposer called");
  
  // Sora-specific selectors - adjust based on actual DOM structure
  const selectors = [
    "textarea:not([readonly])",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true']",
    "input[type='text']"
  ];

  let input = null;
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      input = element;
      console.log("[Prompanion Sora] Found input with selector:", selector);
      break;
    }
  }

  if (!input) {
    console.warn("[Prompanion Sora] No input found in locateComposer");
    return null;
  }

  const container = input.closest("form") || 
                    input.closest("div") || 
                    input.parentElement || 
                    document.body;
  
  console.log("[Prompanion Sora] Composer located:", { input, container });
  return { input, container };
}

function init() {
  console.log("[Prompanion Sora] init() called");
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  AdapterBase.requestSelectionToolbarUpdate();
  
  if (composer) {
    console.log("[Prompanion Sora] Composer found, setting up enhance tooltip");
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[Prompanion Sora] Composer not found in init()");
  ensureDomObserver();
  return false;
}

/**
 * Handles insert text message from background script
 * @param {Object} message - Message object with text property
 * @param {Object} sender - Message sender
 * @param {Function} sendResponse - Response callback
 */
function handleInsertTextMessage(message, sender, sendResponse) {
  try {
    const textToInsert = typeof message.text === "string" ? message.text.trim() : "";
    console.log("[Prompanion Sora] ========== INSERT TEXT REQUEST ==========");
    console.log("[Prompanion Sora] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    
    if (!textToInsert) {
      console.log("[Prompanion Sora] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false;
    }

    console.log("[Prompanion Sora] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[Prompanion Sora] Composer node found:", !!composerNode);
    
    if (!composerNode) {
      console.log("[Prompanion Sora] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false;
    }

    console.log("[Prompanion Sora] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[Prompanion Sora] setComposerText returned:", success);
    
    // Verify insertion
    const currentValue = composerNode.value || composerNode.textContent || "";
    const textInserted = currentValue.includes(textToInsert.substring(0, Math.min(20, textToInsert.length)));
    console.log("[Prompanion Sora] Verification - text appears in node:", textInserted);
    
    if (success && textInserted) {
      console.log("[Prompanion Sora] Insert succeeded!");
      sendResponse({ ok: true });
    } else if (success && !textInserted) {
      console.warn("[Prompanion Sora] setComposerText returned true but text not verified in node");
      sendResponse({ ok: false, reason: "INSERTION_NOT_VERIFIED" });
    } else {
      console.log("[Prompanion Sora] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false;
  } catch (error) {
    console.error("[Prompanion Sora] Insert text handler failed", error);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false;
  }
}

// Register message handler using AdapterBase
console.log("[Prompanion Sora] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

function bootstrap() {
  initSelectionToolbar(); // Initialize the selection toolbar system
  if (!init()) {
    const observer = new MutationObserver(() => {
      if (init()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function setupEnhanceTooltip(input, container) {
  if (!input) return;
  // Only setup if the input has changed
  if (enhanceTooltipActiveTextarea !== input) {
    teardownEnhanceTooltip();
    enhanceTooltipActiveTextarea = input;
    enhanceTooltipDismissed = false;
    lastEnhanceTextSnapshot = "";
    ensureEnhanceTooltipElement();
    bindInputEvents(input);
  } else if (!enhanceTooltipElement || !enhanceTooltipElement.isConnected) {
    // Just ensure the element exists and is connected
    ensureEnhanceTooltipElement();
  }
}

function teardownEnhanceTooltip() {
  if (enhanceTooltipActiveTextarea) {
    enhanceTooltipActiveTextarea.removeEventListener("input", handleInputChange);
    enhanceTooltipActiveTextarea.removeEventListener("keyup", handleInputChange);
    enhanceTooltipActiveTextarea.removeEventListener("focus", handleInputChange);
    enhanceTooltipActiveTextarea.removeEventListener("blur", handleInputBlur);
  }

  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = null;
  enhanceTooltipActiveTextarea = null;
  detachTooltipResizeHandler();
}

function ensureEnhanceTooltipElement() {
  if (enhanceTooltipElement) {
    if (!enhanceTooltipElement.isConnected) {
      document.body.append(enhanceTooltipElement);
    }
    return;
  }

  console.log("[Prompanion Sora] Creating enhance tooltip element");
  enhanceTooltipElement = document.createElement("div");
  enhanceTooltipElement.className = "prompanion-enhance-tooltip";
  
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "prompanion-enhance-tooltip__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss prompt enhancement suggestion");
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enhanceTooltipDismissed = true;
    hideEnhanceTooltip();
  });

  const action = document.createElement("button");
  action.type = "button";
  action.className = "prompanion-enhance-tooltip__action";
  AdapterBase.setButtonTextContent(action, "Refine");
  
  // Handled via global mousedown listener for reliability
  
  enhanceTooltipElement.append(dismiss, action);
  document.body.append(enhanceTooltipElement);
}

async function handleRefineButtonClick(e) {
  console.log("[Prompanion Sora] ========== REFINE BUTTON HANDLER STARTING ==========");
  
  if (e && e.preventDefault) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
  }

  if (enhanceActionInFlight) {
    console.log("[Prompanion Sora] Refine ignored: Action already in flight");
    return false;
  }

  // Force a re-locate of the composer right now
  const composer = locateComposer();
  let composerNode = composer?.input || enhanceTooltipActiveTextarea || floatingButtonTargetInput;
  
  if (!composerNode) {
    console.error("[Prompanion Sora] Refine failed: No composer node found");
    return false;
  }

  const promptText = (composerNode.value || composerNode.textContent || "").trim();
  if (!promptText) {
    console.warn("[Prompanion Sora] Refine ignored: Text is empty");
    return false;
  }

  console.log("[Prompanion Sora] Text to refine:", promptText.substring(0, 50));
  enhanceActionInFlight = true;
  
  // Update UI immediately
  const actionButton = enhanceTooltipElement?.querySelector(".prompanion-enhance-tooltip__action");
  if (actionButton) {
    actionButton.disabled = true;
    AdapterBase.setButtonTextContent(actionButton, "Refining...");
    enhanceTooltipElement.classList.add("is-loading");
  }

  try {
    const result = await requestPromptEnhancement(promptText);
    console.log("[Prompanion Sora] Enhancement result received:", result);

    if (result && result.ok) {
      const refinedText = (result.optionA && typeof result.optionA === "string") ? result.optionA.trim() : promptText;
      
      // Reset flag before insertion
      enhanceActionInFlight = false;
      
      const success = setComposerText(composerNode, refinedText);
      console.log("[Prompanion Sora] Insertion success:", success);
      
      hideEnhanceTooltip();
      enhanceTooltipDismissed = true;

      setTimeout(() => {
        composerNode.focus();
        composerNode.dispatchEvent(new Event("input", { bubbles: true }));
        composerNode.dispatchEvent(new Event("change", { bubbles: true }));
      }, 50);
    } else {
      console.error("[Prompanion Sora] Enhancement failed:", result?.reason || "Unknown error");
      enhanceActionInFlight = false;
      if (result?.error === "LIMIT_REACHED") {
        showUpgradeButtonInTooltip();
      } else if (actionButton) {
        actionButton.disabled = false;
        AdapterBase.setButtonTextContent(actionButton, "Retry Refine");
      }
    }
  } catch (err) {
    console.error("[Prompanion Sora] Refine process error:", err);
    enhanceActionInFlight = false;
    if (actionButton) {
      actionButton.disabled = false;
      AdapterBase.setButtonTextContent(actionButton, "Refine (Error)");
    }
  } finally {
    enhanceTooltipElement?.classList.remove("is-loading");
  }
}

function bindInputEvents(input) {
  input.removeEventListener("input", handleInputChange);
  input.removeEventListener("keyup", handleInputChange);
  input.removeEventListener("focus", handleInputChange);
  input.removeEventListener("blur", handleInputBlur);
  input.addEventListener("input", handleInputChange);
  input.addEventListener("keyup", handleInputChange);
  input.addEventListener("focus", handleInputChange);
  input.addEventListener("blur", handleInputBlur);
  handleInputChange();
}

function extractInputText() {
  if (!enhanceTooltipActiveTextarea) return "";
  return "value" in enhanceTooltipActiveTextarea
    ? enhanceTooltipActiveTextarea.value
    : enhanceTooltipActiveTextarea.textContent ?? "";
}

function handleInputChange() {
  if (!enhanceTooltipActiveTextarea) return;
  
  const rawText = extractInputText();
  const text = rawText.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // If text hasn't changed from our last snapshot, ignore
  if (text === lastEnhanceTextSnapshot) return;
  lastEnhanceTextSnapshot = text;

  if (wordCount < 3) {
    hideEnhanceTooltip();
    enhanceTooltipDismissed = false;
    clearTimeout(enhanceTooltipTimer);
    enhanceTooltipTimer = null;
    return;
  }

  if (enhanceTooltipDismissed) return;

  scheduleEnhanceTooltip();
  if (enhanceTooltipElement?.classList.contains("is-visible") && !tooltipClickInProgress) {
    positionEnhanceTooltip();
  }
}

function handleInputBlur() {
  // If an action is in flight, don't hide the tooltip
  if (enhanceActionInFlight) {
    console.log("[Prompanion Sora] handleInputBlur: ignoring due to action in flight");
    return;
  }
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = null;
  hideEnhanceTooltip();
}

function scheduleEnhanceTooltip() {
  clearTimeout(enhanceTooltipTimer);
  console.log("[Prompanion Sora] scheduleEnhanceTooltip: setting timeout");
  enhanceTooltipTimer = window.setTimeout(() => {
    if (!enhanceTooltipActiveTextarea) {
      console.log("[Prompanion Sora] scheduleEnhanceTooltip: timeout fired but no active textarea");
      return;
    }
    const wordCount = extractInputText().trim().split(/\s+/).filter(Boolean).length;
    console.log("[Prompanion Sora] scheduleEnhanceTooltip: timeout fired, word count:", wordCount, "dismissed:", enhanceTooltipDismissed);
    if (wordCount >= 3 && !enhanceTooltipDismissed) {
      console.log("[Prompanion Sora] scheduleEnhanceTooltip: calling showEnhanceTooltip");
      showEnhanceTooltip();
    }
  }, 1000);
}

function showEnhanceTooltip() {
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
    if (!enhanceTooltipElement) return;
  }

  // If already visible, don't do anything
  if (enhanceTooltipElement.classList.contains("is-visible")) {
    return;
  }

  console.log("[Prompanion Sora] Showing enhance tooltip");
  positionEnhanceTooltip();
  enhanceTooltipElement.classList.add("is-visible");
  attachTooltipResizeHandler();
}

function hideEnhanceTooltip() {
  if (!enhanceTooltipElement) return;
  if (enhanceTooltipElement.classList.contains("show-upgrade")) {
    return;
  }
  enhanceTooltipElement.classList.remove("is-visible");
  detachTooltipResizeHandler();
}

function showUpgradeButtonInTooltip() {
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
  }
  if (!enhanceTooltipElement) {
    console.error("[Prompanion Sora] Cannot show upgrade button - tooltip element not found");
    return;
  }
  
  if (!enhanceTooltipElement.classList.contains("is-visible")) {
    enhanceTooltipElement.classList.add("is-visible");
    positionEnhanceTooltip();
    attachTooltipResizeHandler();
  }
  
  const oldDismiss = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__dismiss");
  if (oldDismiss) {
    oldDismiss.remove();
  }
  
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "prompanion-enhance-tooltip__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss upgrade prompt");
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enhanceTooltipDismissed = true;
    enhanceTooltipElement.classList.remove("show-upgrade");
    hideEnhanceTooltip();
  });
  
  const action = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__action");
  if (action) {
    const newAction = action.cloneNode(true);
    action.replaceWith(newAction);
    newAction.className = "prompanion-enhance-tooltip__action prompanion-enhance-tooltip__upgrade";
    AdapterBase.setButtonTextContent(newAction, "Upgrade for more uses!");
    newAction.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[Prompanion Sora] Upgrade button clicked - placeholder for Stripe integration");
    });
    newAction.parentNode.insertBefore(dismiss, newAction);
  } else {
    enhanceTooltipElement.appendChild(dismiss);
  }
  
  enhanceTooltipElement.classList.add("show-upgrade");
  enhanceTooltipDismissed = false;
}

function positionEnhanceTooltip() {
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) return;
  const rect = enhanceTooltipActiveTextarea.getBoundingClientRect();
  enhanceTooltipElement.style.top = `${rect.top - 8}px`;
  enhanceTooltipElement.style.left = `${rect.left + rect.width * 0.5}px`;
  enhanceTooltipElement.style.transform = "translate(-50%, -100%)";
}

function attachTooltipResizeHandler() {
  if (enhanceTooltipResizeHandler) return;
  enhanceTooltipResizeHandler = () => positionEnhanceTooltip();
  window.addEventListener("resize", enhanceTooltipResizeHandler);
  window.addEventListener("scroll", enhanceTooltipResizeHandler, true);
}

function detachTooltipResizeHandler() {
  if (!enhanceTooltipResizeHandler) return;
  window.removeEventListener("resize", enhanceTooltipResizeHandler);
  window.removeEventListener("scroll", enhanceTooltipResizeHandler, true);
  enhanceTooltipResizeHandler = null;
}

// Backup message listener registration (IIFE to ensure it runs immediately)
(function registerInsertTextListener() {
  console.log("[Prompanion Sora] ========== BACKUP MESSAGE LISTENER REGISTRATION ==========");
  
  if (typeof chrome === "undefined") {
    console.error("[Prompanion Sora] chrome is undefined in backup registration");
    return;
  }
  
  if (!chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[Prompanion Sora] chrome.runtime.onMessage not available in backup registration");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message && message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[Prompanion Sora] BACKUP LISTENER: PROMPANION_INSERT_TEXT received!");
        if (typeof handleInsertTextMessage === "function") {
          handleInsertTextMessage(message, sender, sendResponse);
        } else {
          console.error("[Prompanion Sora] handleInsertTextMessage is not a function!");
          sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        }
        return true;
      }
      return false;
    });
    console.log("[Prompanion Sora] ✓ Backup listener registered successfully");
  } catch (error) {
    console.error("[Prompanion Sora] ✗ Backup listener registration failed:", error);
  }
})();

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}

console.log("[Prompanion Sora] Registering selection change event listeners");
document.addEventListener("selectionchange", handleSelectionChange);
window.addEventListener("scroll", handleSelectionChange, true);
window.addEventListener("resize", handleSelectionChange);
console.log("[Prompanion Sora] Selection change event listeners registered");

// Verify message listener is registered
console.log("[Prompanion Sora] ========== VERIFYING MESSAGE LISTENER ==========");
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  console.log("[Prompanion Sora] chrome.runtime.onMessage is available");
} else {
  console.error("[Prompanion Sora] chrome.runtime.onMessage is NOT available at this point!");
}

window.addEventListener("prompanion-panel-resize", () => {
  refreshFloatingButtonPosition();
});

window.addEventListener("resize", () => {
  if (floatingButtonTargetInput) {
    refreshFloatingButtonPosition();
  }
});


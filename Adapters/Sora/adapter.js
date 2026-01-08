// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™ Sora] ========== ADAPTER.JS LOADING ==========");
console.log("[PromptProfile™ Sora] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™ Sora] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[PromptProfile™ Sora] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
}

// Evaluation module loaded via script tag, available on window.PromptEvaluator
let PromptEvaluator = null;

function loadEvaluationModule() {
  // Since promptEvaluator.js is now loaded as a content script in manifest.json,
  // it should be available on window.PromptEvaluator immediately
  if (PromptEvaluator || (typeof window !== 'undefined' && window.PromptEvaluator && 
      typeof window.PromptEvaluator.evaluatePrompt === 'function')) {
    PromptEvaluator = window.PromptEvaluator;
    console.log("[PromptProfile™] Evaluation module already loaded");
    return Promise.resolve();
  }
  
  // If not immediately available, wait a bit for it to load
  return new Promise((resolve, reject) => {
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      if (typeof window !== 'undefined' && window.PromptEvaluator && 
          typeof window.PromptEvaluator.evaluatePrompt === 'function') {
        clearInterval(checkInterval);
        PromptEvaluator = window.PromptEvaluator;
        console.log("[PromptProfile™] ✓ PromptEvaluator loaded successfully");
        console.log("[PromptProfile™] PromptEvaluator functions:", {
          evaluatePrompt: typeof PromptEvaluator.evaluatePrompt,
          getScoreColorClass: typeof PromptEvaluator.getScoreColorClass,
          getScoreLabel: typeof PromptEvaluator.getScoreLabel
        });
        resolve();
      } else if (checkCount > 50) { // Wait up to 5 seconds
        clearInterval(checkInterval);
        console.warn("[PromptProfile™] PromptEvaluator not found after waiting");
        reject(new Error("PromptEvaluator not found"));
      }
    }, 100);
  });
}

const BUTTON_ID = AdapterBase.BUTTON_ID;
const BUTTON_CLASS = AdapterBase.BUTTON_CLASS;
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

console.log("[PromptProfile™ Sora] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
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

// Evaluation variables
let realTimeEvaluationEnabled = false;

function ensureStyle() {
  // Load generic adapter styles from external CSS file
  const styleId = "promptprofile-adapter-styles";
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
  const refineButton = e.target.closest(".promptprofile-enhance-tooltip__action");
  if (refineButton && !refineButton.classList.contains("promptprofile-enhance-tooltip__upgrade")) {
    console.log("[PromptProfile™ Sora] Global capture: Refine button mousedown detected");
    // Trigger refinement on mousedown to beat any blur/render issues
    handleRefineButtonClick(e);
  }
}, true);

// Keep click listener just to prevent default actions if needed
document.addEventListener("click", (e) => {
  const refineButton = e.target.closest(".promptprofile-enhance-tooltip__action");
  if (refineButton) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

async function submitSelectionToSideChat(text) {
  console.log("[PromptProfile™ Sora] ========== submitSelectionToSideChat CALLED ==========");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[PromptProfile™ Sora] Snippet:", snippet?.substring(0, 50));
  
  if (!snippet) {
    return;
  }

  try {
    console.log("[PromptProfile™ Sora] ========== SENDING PROMPANION_SIDECHAT_REQUEST ==========");
    
    AdapterBase.sendMessage({ 
      type: "PROMPANION_SIDECHAT_REQUEST", 
      text: snippet,
      chatHistory: [] // Sora explore page may not have chat history
    }, (response) => {
      console.log("[PromptProfile™ Sora] ========== PROMPANION_SIDECHAT_REQUEST RESPONSE ==========");
      console.log("[PromptProfile™ Sora] Response:", response);
      if (!response?.ok) {
        console.warn("PromptProfile™: sidechat request rejected", response?.reason);
      }
    }).catch((error) => {
      console.warn("PromptProfile™: failed to request sidechat from selection", error);
    });
  } catch (error) {
    console.error("PromptProfile™: sidechat request threw synchronously", error);
  }
}

function handleSelectionChange() {
  console.log("[PromptProfile™ Sora] handleSelectionChange fired");
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
        console.error("[PromptProfile™ Sora] Extension context invalidated - user should reload page");
      } else {
        console.warn("[PromptProfile™ Sora] Enhancement request failed:", error);
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
  
  let tooltip = button._promptprofileTooltip;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "promptprofile-tooltip";
    tooltip.setAttribute("role", "tooltip");
    const text = document.createElement("span");
    text.textContent = data.text;
    const hidden = document.createElement("span");
    hidden.className = "promptprofile-visually-hidden";
    hidden.textContent = data.text;
    tooltip.append(text, hidden);
    button._promptprofileTooltip = tooltip;
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
  AdapterBase.attachTooltip(button, "Open PromptProfile™ to enhance your prompts for the best response.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("PromptProfile™: failed to open sidebar from Sora adapter", e)));
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
    console.warn("[PromptProfile™ Sora] XPath error:", error);
  }
  
  if (!targetContainer || !referenceElement) {
    console.warn("[PromptProfile™ Sora] Target container or reference element not found, will retry...");
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
  console.log("[PromptProfile™ Sora] locateComposer called");
  
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
      console.log("[PromptProfile™ Sora] Found input with selector:", selector);
      break;
    }
  }

  if (!input) {
    console.warn("[PromptProfile™ Sora] No input found in locateComposer");
    return null;
  }

  const container = input.closest("form") || 
                    input.closest("div") || 
                    input.parentElement || 
                    document.body;
  
  console.log("[PromptProfile™ Sora] Composer located:", { input, container });
  return { input, container };
}

function init() {
  console.log("[PromptProfile™ Sora] init() called");
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  AdapterBase.requestSelectionToolbarUpdate();
  
  if (composer) {
    console.log("[PromptProfile™ Sora] Composer found, setting up enhance tooltip");
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[PromptProfile™ Sora] Composer not found in init()");
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
    console.log("[PromptProfile™ Sora] ========== INSERT TEXT REQUEST ==========");
    console.log("[PromptProfile™ Sora] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    
    if (!textToInsert) {
      console.log("[PromptProfile™ Sora] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false;
    }

    console.log("[PromptProfile™ Sora] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[PromptProfile™ Sora] Composer node found:", !!composerNode);
    
    if (!composerNode) {
      console.log("[PromptProfile™ Sora] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false;
    }

    console.log("[PromptProfile™ Sora] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[PromptProfile™ Sora] setComposerText returned:", success);
    
    // Verify insertion
    const currentValue = composerNode.value || composerNode.textContent || "";
    const textInserted = currentValue.includes(textToInsert.substring(0, Math.min(20, textToInsert.length)));
    console.log("[PromptProfile™ Sora] Verification - text appears in node:", textInserted);
    
    if (success && textInserted) {
      console.log("[PromptProfile™ Sora] Insert succeeded!");
      sendResponse({ ok: true });
    } else if (success && !textInserted) {
      console.warn("[PromptProfile™ Sora] setComposerText returned true but text not verified in node");
      sendResponse({ ok: false, reason: "INSERTION_NOT_VERIFIED" });
    } else {
      console.log("[PromptProfile™ Sora] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false;
  } catch (error) {
    console.error("[PromptProfile™ Sora] Insert text handler failed", error);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false;
  }
}

// Register message handler using AdapterBase
console.log("[PromptProfile™ Sora] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
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

async function setupEnhanceTooltip(input, container) {
  if (!input) return;
  // Only setup if the input has changed
  if (enhanceTooltipActiveTextarea !== input) {
    teardownEnhanceTooltip();
    enhanceTooltipActiveTextarea = input;
    enhanceTooltipDismissed = false;
    lastEnhanceTextSnapshot = "";
    // Load evaluation setting
    await AdapterBase.loadEvaluationSetting();
    realTimeEvaluationEnabled = AdapterBase.realTimeEvaluationEnabled;
    console.log("[PromptProfile™] Evaluation enabled in setupEnhanceTooltip:", realTimeEvaluationEnabled);
    // Load evaluation module
    loadEvaluationModule().then(() => {
      // Check window.PromptEvaluator directly after load
      if (window.PromptEvaluator && !PromptEvaluator) {
        PromptEvaluator = window.PromptEvaluator;
        console.log("[PromptProfile™] PromptEvaluator assigned from window after module load");
      }
    }).catch(err => {
      console.warn("[PromptProfile™] Could not load evaluation module:", err);
    });
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

  console.log("[PromptProfile™ Sora] Creating enhance tooltip element");
  enhanceTooltipElement = document.createElement("div");
  enhanceTooltipElement.className = "promptprofile-enhance-tooltip";
  
  // Evaluation score bar section
  const evaluationSection = document.createElement("div");
  evaluationSection.className = "enhance-tooltip__evaluation";
  
  // Title for evaluation section
  const evaluationTitle = document.createElement("div");
  evaluationTitle.className = "evaluation-score-bar__title";
  evaluationTitle.textContent = "Your Prompt Score:";
  evaluationSection.appendChild(evaluationTitle);
  
  const scoreBar = document.createElement("div");
  scoreBar.className = "evaluation-score-bar";
  const scoreBarFill = document.createElement("div");
  scoreBarFill.className = "evaluation-score-bar__fill";
  scoreBarFill.style.width = "0%";
  const scoreBarLabel = document.createElement("span");
  scoreBarLabel.className = "evaluation-score-bar__label evaluating";
  scoreBarLabel.textContent = "Evaluating...";
  scoreBar.appendChild(scoreBarFill);
  scoreBar.appendChild(scoreBarLabel);
  const scoreBarBlurb = document.createElement("div");
  scoreBarBlurb.className = "evaluation-score-bar__blurb";
  scoreBarBlurb.textContent = "";
  evaluationSection.appendChild(scoreBar);
  evaluationSection.appendChild(scoreBarBlurb);
  
  // Buttons row
  const buttonRow = document.createElement("div");
  buttonRow.className = "promptprofile-enhance-tooltip__row";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "promptprofile-enhance-tooltip__dismiss";
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
  action.className = "promptprofile-enhance-tooltip__action";
  AdapterBase.setButtonTextContent(action, "Refine");
  
  // Handled via global mousedown listener for reliability
  
  buttonRow.append(dismiss, action);
  enhanceTooltipElement.append(evaluationSection, buttonRow);
  document.body.append(enhanceTooltipElement);
}

async function handleRefineButtonClick(e) {
  console.log("[PromptProfile™ Sora] ========== REFINE BUTTON HANDLER STARTING ==========");
  
  if (e && e.preventDefault) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") {
      e.stopImmediatePropagation();
    }
  }

  if (enhanceActionInFlight) {
    console.log("[PromptProfile™ Sora] Refine ignored: Action already in flight");
    return false;
  }

  // Force a re-locate of the composer right now
  const composer = locateComposer();
  let composerNode = composer?.input || enhanceTooltipActiveTextarea || floatingButtonTargetInput;
  
  if (!composerNode) {
    console.error("[PromptProfile™ Sora] Refine failed: No composer node found");
    return false;
  }

  const promptText = (composerNode.value || composerNode.textContent || "").trim();
  if (!promptText) {
    console.warn("[PromptProfile™ Sora] Refine ignored: Text is empty");
    return false;
  }

  // Save current prompt version before refining
  AdapterBase.savePromptVersion(composerNode, promptText);

  console.log("[PromptProfile™ Sora] Text to refine:", promptText.substring(0, 50));
  enhanceActionInFlight = true;
  
  // Update UI immediately
  const actionButton = enhanceTooltipElement?.querySelector(".promptprofile-enhance-tooltip__action");
  if (actionButton) {
    actionButton.disabled = true;
    AdapterBase.setButtonTextContent(actionButton, "Refining...");
    enhanceTooltipElement.classList.add("is-loading");
  }

  try {
    const result = await requestPromptEnhancement(promptText);
    console.log("[PromptProfile™ Sora] Enhancement result received:", result);

    if (result && result.ok) {
      const refinedText = (result.optionA && typeof result.optionA === "string") ? result.optionA.trim() : promptText;
      
      // Reset flag before insertion
      enhanceActionInFlight = false;
      
      const success = setComposerText(composerNode, refinedText);
      console.log("[PromptProfile™ Sora] Insertion success:", success);
      
      // Show undo button after successful refinement
      AdapterBase.showUndoButton(composerNode);
      
      hideEnhanceTooltip();
      enhanceTooltipDismissed = true;

      setTimeout(() => {
        composerNode.focus();
        composerNode.dispatchEvent(new Event("input", { bubbles: true }));
        composerNode.dispatchEvent(new Event("change", { bubbles: true }));
      }, 50);
    } else {
      console.error("[PromptProfile™ Sora] Enhancement failed:", result?.reason || "Unknown error");
      enhanceActionInFlight = false;
      if (result?.error === "LIMIT_REACHED") {
        showUpgradeButtonInTooltip();
      } else if (actionButton) {
        actionButton.disabled = false;
        AdapterBase.setButtonTextContent(actionButton, "Retry Refine");
      }
    }
  } catch (err) {
    console.error("[PromptProfile™ Sora] Refine process error:", err);
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
    console.log("[PromptProfile™ Sora] handleInputBlur: ignoring due to action in flight");
    return;
  }
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = null;
  hideEnhanceTooltip();
}

function scheduleEnhanceTooltip() {
  clearTimeout(enhanceTooltipTimer);
  console.log("[PromptProfile™ Sora] scheduleEnhanceTooltip: setting timeout");
  enhanceTooltipTimer = window.setTimeout(() => {
    if (!enhanceTooltipActiveTextarea) {
      console.log("[PromptProfile™ Sora] scheduleEnhanceTooltip: timeout fired but no active textarea");
      return;
    }
    const wordCount = extractInputText().trim().split(/\s+/).filter(Boolean).length;
    console.log("[PromptProfile™ Sora] scheduleEnhanceTooltip: timeout fired, word count:", wordCount, "dismissed:", enhanceTooltipDismissed);
    if (wordCount >= 3 && !enhanceTooltipDismissed) {
      console.log("[PromptProfile™ Sora] scheduleEnhanceTooltip: calling showEnhanceTooltip");
      showEnhanceTooltip();
      // Trigger evaluation when tooltip appears
      // Re-check evaluation setting in case it changed
      if (AdapterBase.realTimeEvaluationEnabled !== undefined) {
        realTimeEvaluationEnabled = AdapterBase.realTimeEvaluationEnabled;
      }
      console.log("[PromptProfile™] Scheduling evaluation, enabled:", realTimeEvaluationEnabled);
      if (realTimeEvaluationEnabled) {
        // Small delay to ensure tooltip is fully rendered
        setTimeout(() => {
          updateTooltipEvaluation();
        }, 50);
      }
    }
  }, 1000);
}

function showEnhanceTooltip() {
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
    if (!enhanceTooltipElement) {
      console.error("[PromptProfile™] Cannot show tooltip - element not found");
      return;
    }
  }

  // If already visible, don't do anything
  if (enhanceTooltipElement.classList.contains("is-visible")) {
    return;
  }

  // Ensure button row is always visible
  const buttonRow = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__row");
  if (buttonRow) {
    buttonRow.style.display = "flex";
  }
  
  // Show/hide evaluation section based on setting
  const evaluationSection = enhanceTooltipElement.querySelector(".enhance-tooltip__evaluation");
  if (evaluationSection) {
    if (realTimeEvaluationEnabled) {
      evaluationSection.classList.add("is-visible");
      enhanceTooltipElement.classList.remove("no-evaluation"); // Remove class if evaluation is visible
    } else {
      evaluationSection.classList.remove("is-visible");
      enhanceTooltipElement.classList.add("no-evaluation"); // Add class if evaluation is hidden
    }
  }

  console.log("[PromptProfile™ Sora] Showing enhance tooltip");
  positionEnhanceTooltip();
  enhanceTooltipElement.classList.add("is-visible");
  attachTooltipResizeHandler();
  
  console.log("[PromptProfile™] Tooltip shown, button row:", buttonRow, "evaluation section:", evaluationSection);
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
    console.error("[PromptProfile™ Sora] Cannot show upgrade button - tooltip element not found");
    return;
  }
  
  if (!enhanceTooltipElement.classList.contains("is-visible")) {
    enhanceTooltipElement.classList.add("is-visible");
    positionEnhanceTooltip();
    attachTooltipResizeHandler();
  }
  
  const oldDismiss = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__dismiss");
  if (oldDismiss) {
    oldDismiss.remove();
  }
  
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "promptprofile-enhance-tooltip__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss upgrade prompt");
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enhanceTooltipDismissed = true;
    enhanceTooltipElement.classList.remove("show-upgrade");
    hideEnhanceTooltip();
  });
  
  const action = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__action");
  if (action) {
    const newAction = action.cloneNode(true);
    action.replaceWith(newAction);
    newAction.className = "promptprofile-enhance-tooltip__action promptprofile-enhance-tooltip__upgrade";
    AdapterBase.setButtonTextContent(newAction, "Upgrade for more uses!");
    newAction.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await AdapterBase.handleStripeCheckout(newAction);
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

/**
 * Updates the evaluation score bar in the refine tooltip
 */
function updateTooltipEvaluation() {
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) return;
  if (!realTimeEvaluationEnabled) {
    console.log("[PromptProfile™] Evaluation disabled, skipping");
    return;
  }
  
  const promptText = extractInputText().trim();
  if (promptText.length < 3) return;
  
  // Get score bar elements
  const scoreBarFill = enhanceTooltipElement.querySelector(".evaluation-score-bar__fill");
  const scoreBarLabel = enhanceTooltipElement.querySelector(".evaluation-score-bar__label");
  const scoreBarBlurb = enhanceTooltipElement.querySelector(".evaluation-score-bar__blurb");
  
  if (!scoreBarFill || !scoreBarLabel) {
    console.warn("[PromptProfile™] Score bar elements not found");
    return;
  }
  
  // Show "Evaluating..." state
  scoreBarLabel.textContent = "Evaluating...";
  scoreBarLabel.classList.add("evaluating");
  scoreBarFill.style.width = "0%";
  if (scoreBarBlurb) {
    scoreBarBlurb.textContent = "";
  }
  
  // Always check window.PromptEvaluator directly - it's the source of truth
  console.log("[PromptProfile™] Checking for PromptEvaluator...");
  console.log("[PromptProfile™] window.PromptEvaluator:", window.PromptEvaluator);
  console.log("[PromptProfile™] typeof window.PromptEvaluator:", typeof window.PromptEvaluator);
  if (window.PromptEvaluator) {
    console.log("[PromptProfile™] window.PromptEvaluator.evaluatePrompt:", typeof window.PromptEvaluator.evaluatePrompt);
  }
  
  // Check window first (most reliable source)
  if (typeof window !== 'undefined' && window.PromptEvaluator && 
      typeof window.PromptEvaluator.evaluatePrompt === 'function') {
    PromptEvaluator = window.PromptEvaluator;
    console.log("[PromptProfile™] ✓ Found PromptEvaluator on window, using it");
    performTooltipEvaluation(promptText, scoreBarFill, scoreBarLabel, scoreBarBlurb, window.PromptEvaluator);
    return;
  } 
  // Fallback to local variable
  else if (PromptEvaluator && typeof PromptEvaluator.evaluatePrompt === 'function') {
    console.log("[PromptProfile™] Using local PromptEvaluator");
    performTooltipEvaluation(promptText, scoreBarFill, scoreBarLabel, scoreBarBlurb, PromptEvaluator);
    return;
  }
  
  // If not available, wait a bit and check again (script might still be loading)
  console.log("[PromptProfile™] PromptEvaluator not immediately available, waiting...");
  let checkCount = 0;
  const checkInterval = setInterval(() => {
    checkCount++;
    console.log(`[PromptProfile™] Check ${checkCount}: window.PromptEvaluator =`, window.PromptEvaluator);
    if (typeof window !== 'undefined' && window.PromptEvaluator && 
        typeof window.PromptEvaluator.evaluatePrompt === 'function') {
      clearInterval(checkInterval);
      PromptEvaluator = window.PromptEvaluator;
      console.log("[PromptProfile™] ✓ Found PromptEvaluator after waiting");
      performTooltipEvaluation(promptText, scoreBarFill, scoreBarLabel, scoreBarBlurb, window.PromptEvaluator);
    } else if (checkCount > 30) { // Wait up to 3 seconds
      clearInterval(checkInterval);
      console.warn("[PromptProfile™] ✗ PromptEvaluator not found after waiting 3 seconds");
      console.warn("[PromptProfile™] Final check - window.PromptEvaluator:", window.PromptEvaluator);
      scoreBarLabel.textContent = "Evaluation unavailable";
      scoreBarLabel.classList.remove("evaluating");
      if (scoreBarBlurb) {
        scoreBarBlurb.textContent = "";
      }
    }
  }, 100);
}

/**
 * Performs evaluation and updates score bar
 */
function performTooltipEvaluation(promptText, scoreBarFill, scoreBarLabel, scoreBarBlurb, evaluator = null) {
  const eval = evaluator || PromptEvaluator || window.PromptEvaluator;
  
  if (!eval || typeof eval.evaluatePrompt !== 'function') {
    console.error("[PromptProfile™] No valid evaluator provided");
    scoreBarLabel.textContent = "Evaluation unavailable";
    scoreBarLabel.classList.remove("evaluating");
    if (scoreBarBlurb) {
      scoreBarBlurb.textContent = "";
    }
    return;
  }
  
  try {
    const result = eval.evaluatePrompt(promptText);
    console.log("[PromptProfile™] Evaluation result:", result);
    
    // Update score bar
    const score = result.score;
    const scoreClass = (eval.getScoreColorClass && typeof eval.getScoreColorClass === 'function')
      ? eval.getScoreColorClass(score) 
      : (score >= 80 ? 'score-excellent' : score >= 60 ? 'score-good' : score >= 40 ? 'score-fair' : 'score-poor');
    const scoreLabel = (eval.getScoreLabel && typeof eval.getScoreLabel === 'function')
      ? eval.getScoreLabel(score)
      : (score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Improvement');
    
    // Update fill bar
    scoreBarFill.style.width = `${score}%`;
    scoreBarFill.className = `evaluation-score-bar__fill ${scoreClass}`;
    
    // Update label
    scoreBarLabel.textContent = `${score} - ${scoreLabel}`;
    scoreBarLabel.classList.remove("evaluating");
    
    // Update blurb
    const blurb = (eval.getScoreBlurb && typeof eval.getScoreBlurb === 'function')
      ? eval.getScoreBlurb(score)
      : (score >= 80 ? 'Absolutely acceptable!' : score >= 50 ? 'It might work...' : 'Not well engineered.');
    if (scoreBarBlurb) {
      scoreBarBlurb.textContent = blurb;
    }
    
    console.log("[PromptProfile™] Score bar updated:", score, scoreLabel, blurb);
    
  } catch (error) {
    console.error("[PromptProfile™] Evaluation error:", error);
    scoreBarLabel.textContent = "Evaluation error";
    scoreBarLabel.classList.remove("evaluating");
    if (scoreBarBlurb) {
      scoreBarBlurb.textContent = "";
    }
  }
}

// Backup message listener registration (IIFE to ensure it runs immediately)
(function registerInsertTextListener() {
  console.log("[PromptProfile™ Sora] ========== BACKUP MESSAGE LISTENER REGISTRATION ==========");
  
  if (typeof chrome === "undefined") {
    console.error("[PromptProfile™ Sora] chrome is undefined in backup registration");
    return;
  }
  
  if (!chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[PromptProfile™ Sora] chrome.runtime.onMessage not available in backup registration");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message && message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[PromptProfile™ Sora] BACKUP LISTENER: PROMPANION_INSERT_TEXT received!");
        if (typeof handleInsertTextMessage === "function") {
          handleInsertTextMessage(message, sender, sendResponse);
        } else {
          console.error("[PromptProfile™ Sora] handleInsertTextMessage is not a function!");
          sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        }
        return true;
      }
      return false;
    });
    console.log("[PromptProfile™ Sora] ✓ Backup listener registered successfully");
  } catch (error) {
    console.error("[PromptProfile™ Sora] ✗ Backup listener registration failed:", error);
  }
})();

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}

console.log("[PromptProfile™ Sora] Registering selection change event listeners");
document.addEventListener("selectionchange", handleSelectionChange);
window.addEventListener("scroll", handleSelectionChange, true);
window.addEventListener("resize", handleSelectionChange);
console.log("[PromptProfile™ Sora] Selection change event listeners registered");

// Verify message listener is registered
console.log("[PromptProfile™ Sora] ========== VERIFYING MESSAGE LISTENER ==========");
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  console.log("[PromptProfile™ Sora] chrome.runtime.onMessage is available");
} else {
  console.error("[PromptProfile™ Sora] chrome.runtime.onMessage is NOT available at this point!");
}

window.addEventListener("promptprofile-panel-resize", () => {
  refreshFloatingButtonPosition();
});

window.addEventListener("resize", () => {
  if (floatingButtonTargetInput) {
    refreshFloatingButtonPosition();
  }
});


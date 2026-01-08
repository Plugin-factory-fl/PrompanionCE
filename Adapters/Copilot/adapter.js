// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™] ========== MICROSOFT COPILOT ADAPTER LOADING ==========");
console.log("[PromptProfile™] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[PromptProfile™] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
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
const HIGHLIGHT_BUTTON_SELECTORS = AdapterBase.HIGHLIGHT_BUTTON_SELECTORS;
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

console.log("[PromptProfile™] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
let domObserverStarted = false;

let enhanceTooltipElement = null;
let enhanceTooltipTimer = null;
let enhanceTooltipDismissed = false;
let enhanceTooltipActiveTextarea = null;
let lastEnhanceTextSnapshot = "";
let enhanceTooltipResizeHandler = null;
let floatingButtonTargetInput = null;
let enhanceActionInFlight = false;
let selectionAskInFlight = false;
let tooltipClickInProgress = false;
let highlightObserver = null;

// Evaluation variables
let realTimeEvaluationEnabled = false;

// Generic styles moved to styles/AdapterStyles.css
// Styles are loaded via ensureStyle() function

function ensureStyle() {
  AdapterBase.ensureStyle();
}

function getHighlightButton() {
  for (const selector of HIGHLIGHT_BUTTON_SELECTORS) {
    const button = document.querySelector(selector);
    if (button instanceof HTMLButtonElement && button.offsetParent) {
      return button;
    }
  }
  return null;
}

function nodeInAssistantMessage(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  // Microsoft Copilot-specific selectors for assistant messages
  return !!(
    element.closest("[data-author-role='bot']") ||
    element.closest("[data-author='bot']") ||
    element.closest(".response-message") ||
    element.closest(".ac-textBlock") ||
    element.closest("[class*='bot-message']") ||
    element.closest("[class*='assistant']") ||
    element.closest("cib-message")?.getAttribute("type") === "bot"
  );
}

function selectionTargetsAssistant(selection) {
  if (!selection) return false;
  if (nodeInAssistantMessage(selection.anchorNode) || nodeInAssistantMessage(selection.focusNode)) {
    return true;
  }
  try {
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    return range ? nodeInAssistantMessage(range.commonAncestorContainer) : false;
  } catch {
    return false;
  }
}

function ensureHighlightObserver() {
  if (highlightObserver || !document.body) return;
  highlightObserver = new MutationObserver(() => {
    if (getHighlightButton()) AdapterBase.requestSelectionToolbarUpdate();
  });
  highlightObserver.observe(document.body, { childList: true, subtree: true });
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  // Microsoft Copilot-specific selectors for composer/input area
  return !!(
    element.closest("#searchbox") ||
    element.closest("cib-text-input") ||
    element.closest("textarea") ||
    element.closest("[contenteditable='true']")?.closest("cib-serp") ||
    element.closest("[role='textbox']")?.closest("cib-serp") ||
    element.closest(".ac-textInput")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

// Selection Toolbar system moved to AdapterBase
// Initialize it with Microsoft Copilot-specific condition functions
function initSelectionToolbar() {
  AdapterBase.initSelectionToolbar({
    shouldShowToolbar: (selection) => {
      const text = selection?.toString().trim();
      return !!(selection && !selection.isCollapsed && text && 
                !selectionWithinComposer(selection) && 
                selectionTargetsAssistant(selection));
    },
    onAction: (text) => {
      submitSelectionToSideChat(text);
    },
    buttonText: "Elaborate",
    toolbarId: SELECTION_TOOLBAR_ID,
    visibleClass: SELECTION_TOOLBAR_VISIBLE_CLASS
  });
}

function captureCopilotChatHistory(maxMessages = 20) {
  console.log("%c[PromptProfile™ Copilot] ========== captureCopilotChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[PromptProfile™ Copilot] Current URL:", window.location.href);
  
  const messages = [];
  
  try {
    // Microsoft Copilot-specific selectors
    const assistantSelectors = [
      "[data-author-role='bot']",
      "[data-author='bot']",
      "cib-message[type='bot']",
      ".response-message",
      ".ac-textBlock[data-author='bot']",
      "[class*='bot-message']",
      "[class*='assistant']"
    ];
    
    const userSelectors = [
      "[data-author-role='user']",
      "[data-author='user']",
      "cib-message[type='user']",
      ".user-message",
      ".ac-textBlock[data-author='user']",
      "[class*='user-message']"
    ];
    
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Copilot] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break;
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Copilot] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Copilot] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break;
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Copilot] Selector failed: ${selector}`, e);
      }
    }
    
    // Helper function to get element position
    function getElementPosition(el) {
      let pos = 0;
      while (el) {
        pos += el.offsetTop;
        el = el.offsetParent;
      }
      return pos;
    }
    
    // Combine and sort by DOM position
    const allElements = [];
    assistantElements.forEach(el => {
      if (el && el.isConnected) {
        allElements.push({ el, role: 'assistant', position: getElementPosition(el) });
      }
    });
    userElements.forEach(el => {
      if (el && el.isConnected) {
        allElements.push({ el, role: 'user', position: getElementPosition(el) });
      }
    });
    
    allElements.sort((a, b) => a.position - b.position);
    
    for (const { el, role } of allElements) {
      if (messages.length >= maxMessages) break;
      
      const content = (el.innerText || el.textContent || "").trim();
      if (content && content.length > 10) {
        messages.push({ role, content });
        console.log(`[PromptProfile™ Copilot] Added ${role} message: ${content.substring(0, 50)}...`);
      }
    }
    
    console.log(`[PromptProfile™ Copilot] Captured ${messages.length} messages`);
    return messages;
  } catch (error) {
    console.error("[PromptProfile™ Copilot] Error capturing chat history:", error);
    return [];
  }
}

function submitSelectionToSideChat(text) {
  if (selectionAskInFlight) {
    console.log("[PromptProfile™ Copilot] Selection ask already in flight, ignoring");
    return;
  }
  
  if (!text || !text.trim()) {
    console.warn("[PromptProfile™ Copilot] Empty text selected, cannot submit");
    return;
  }
  
  selectionAskInFlight = true;
  console.log("[PromptProfile™ Copilot] Submitting selection to side chat:", text.substring(0, 50));
  
  const chatHistory = captureCopilotChatHistory(20);
  
  AdapterBase.sendMessage({
    type: "PROMPANION_SIDECHAT_REQUEST",
    text: text.trim(),
    chatHistory: chatHistory,
    source: "microsoft-copilot"
  })
    .then((response) => {
      selectionAskInFlight = false;
      if (response?.ok) {
        console.log("[PromptProfile™ Copilot] Side chat request successful");
      } else {
        console.warn("[PromptProfile™ Copilot] Side chat request failed:", response?.reason);
      }
    })
    .catch((error) => {
      selectionAskInFlight = false;
      console.error("[PromptProfile™ Copilot] Side chat request error:", error);
    });
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
    }, 500);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  console.log("[PromptProfile™ Copilot] locateComposer called");
  
  // Microsoft Copilot-specific selectors
  const selectors = [
    "#searchbox",
    "cib-text-input textarea",
    "cib-text-input [contenteditable='true']",
    "textarea:not([readonly])",
    "[contenteditable='true'][role='textbox']",
    ".ac-textInput",
    "[contenteditable='true']"
  ];

  let input = null;
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      input = element;
      console.log("[PromptProfile™ Copilot] Found input with selector:", selector);
      break;
    }
  }

  if (!input) {
    console.warn("[PromptProfile™ Copilot] No input found in locateComposer");
    return null;
  }

  const container = input.closest("cib-text-input") || 
                    input.closest("cib-serp") ||
                    input.closest("form") || 
                    input.closest("div") || 
                    input.parentElement || 
                    document.body;
  
  console.log("[PromptProfile™ Copilot] Composer located:", { input, container });
  return { input, container };
}

function init() {
  console.log("[PromptProfile™ Copilot] init() called");
  // Initialize sticky button
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  AdapterBase.requestSelectionToolbarUpdate();
  
  if (composer) {
    console.log("[PromptProfile™ Copilot] Composer found, setting up enhance tooltip");
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[PromptProfile™ Copilot] Composer not found in init()");
  ensureDomObserver();
  return false;
}

function findComposerNode() {
  // Try tracked nodes first
  let composerNode = enhanceTooltipActiveTextarea;
  if (composerNode) {
    return composerNode;
  }

  // Fallback: locate composer using locateComposer
  const composer = locateComposer();
  if (composer?.input) {
    return composer.input;
  }

  // Last resort: query for common selectors
  const selectors = [
    "#searchbox",
    "cib-text-input textarea",
    "cib-text-input [contenteditable='true']",
    "textarea:not([readonly])",
    "[contenteditable='true'][role='textbox']"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      return element;
    }
  }

  return null;
}

function setComposerText(node, text) {
  if (!node) return false;
  return AdapterBase.setEditableElementText(node, text);
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
    console.log("[PromptProfile™ Copilot] ========== INSERT TEXT REQUEST ==========");
    console.log("[PromptProfile™ Copilot] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    
    if (!textToInsert) {
      console.log("[PromptProfile™ Copilot] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false;
    }

    console.log("[PromptProfile™ Copilot] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[PromptProfile™ Copilot] Composer node found:", !!composerNode);
    
    if (!composerNode) {
      console.log("[PromptProfile™ Copilot] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false;
    }

    console.log("[PromptProfile™ Copilot] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[PromptProfile™ Copilot] setComposerText returned:", success);
    
    if (success) {
      console.log("[PromptProfile™ Copilot] Insert succeeded!");
      sendResponse({ ok: true });
    } else {
      console.log("[PromptProfile™ Copilot] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false;
  } catch (error) {
    console.error("[PromptProfile™ Copilot] Insert text handler failed", error);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false;
  }
}

// Register message handler using AdapterBase
console.log("[PromptProfile™ Copilot] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

async function setupEnhanceTooltip(input, container) {
  if (!input || enhanceTooltipActiveTextarea === input) return;
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
}

function ensureEnhanceTooltipElement() {
  if (!enhanceTooltipElement) {
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
    
    const buttonRow = document.createElement("div");
    buttonRow.className = "promptprofile-enhance-tooltip__row";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "promptprofile-enhance-tooltip__dismiss";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss prompt enhancement suggestion");
    dismiss.addEventListener("click", () => {
      enhanceTooltipDismissed = true;
      hideEnhanceTooltip();
    });
    const action = document.createElement("button");
    action.type = "button";
    action.className = "promptprofile-enhance-tooltip__action";
    AdapterBase.setButtonTextContent(action, "Refine");
    action.addEventListener("click", handleRefineButtonClick);
    buttonRow.append(dismiss, action);
    
    enhanceTooltipElement.append(evaluationSection, buttonRow);
  }
  if (!enhanceTooltipElement.isConnected) {
    document.body.append(enhanceTooltipElement);
  }
  hideEnhanceTooltip();
}

function handleRefineButtonClick(e) {
  e.preventDefault();
  e.stopPropagation();
  if (enhanceActionInFlight) {
    return;
  }
  const composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  if (!composerNode) {
    console.error("[PromptProfile™ Copilot] No composer node found!");
    return;
  }
  const promptText = extractInputText().trim();
  if (!promptText) {
    return;
  }
  
  // Save current prompt version before refining
  AdapterBase.savePromptVersion(composerNode, promptText);
  
  enhanceActionInFlight = true;
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        enhanceTooltipDismissed = true;
        hideEnhanceTooltip();
        return;
      }
      enhanceTooltipDismissed = true;
      hideEnhanceTooltip();
      const refinedText = result.optionA && typeof result.optionA === "string" && result.optionA.trim() 
        ? result.optionA.trim() 
        : promptText;
      setComposerText(composerNode, refinedText);
      
      // Show undo button after successful refinement
      AdapterBase.showUndoButton(composerNode);
      
      enhanceActionInFlight = false;
    })
    .catch((error) => {
      console.error("PromptProfile™ Copilot: refine request threw", error);
      enhanceActionInFlight = false;
      enhanceTooltipDismissed = true;
      hideEnhanceTooltip();
    });
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
  if (wordCount < 3) {
    hideEnhanceTooltip();
    enhanceTooltipDismissed = false;
    clearTimeout(enhanceTooltipTimer);
    enhanceTooltipTimer = null;
    lastEnhanceTextSnapshot = "";
    return;
  }
  if (enhanceTooltipDismissed && text === lastEnhanceTextSnapshot) return;
  lastEnhanceTextSnapshot = text;
  enhanceTooltipDismissed = false;
  scheduleEnhanceTooltip();
  if (enhanceTooltipElement?.classList.contains("is-visible")) {
    positionEnhanceTooltip();
  }
}

function handleInputBlur() {
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = null;
  hideEnhanceTooltip();
}

function scheduleEnhanceTooltip() {
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = setTimeout(() => {
    if (!enhanceTooltipActiveTextarea) return;
    const wordCount = extractInputText().trim().split(/\s+/).filter(Boolean).length;
    if (wordCount >= 3 && !enhanceTooltipDismissed) {
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
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) return;
  if (enhanceTooltipDismissed) return;
  
  ensureStyle();
  ensureEnhanceTooltipElement();
  
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
  
  positionEnhanceTooltip();
  enhanceTooltipElement.classList.add("is-visible");
  
  console.log("[PromptProfile™] Tooltip shown, button row:", buttonRow, "evaluation section:", evaluationSection);
}

function hideEnhanceTooltip() {
  if (enhanceTooltipElement) {
    enhanceTooltipElement.classList.remove("is-visible");
  }
}

function positionEnhanceTooltip() {
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) return;
  
  const rect = enhanceTooltipActiveTextarea.getBoundingClientRect();
  const tooltipRect = enhanceTooltipElement.getBoundingClientRect();
  
  const top = rect.bottom + 8;
  const left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
  
  enhanceTooltipElement.style.top = `${top + window.scrollY}px`;
  enhanceTooltipElement.style.left = `${Math.max(8, left + window.scrollX)}px`;
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

function requestPromptEnhancement(promptText) {
  return AdapterBase.sendMessage({
    type: "PROMPANION_ENHANCE_REQUEST",
    prompt: promptText,
    source: "microsoft-copilot"
  });
}

function bootstrap() {
  ensureHighlightObserver();
  initSelectionToolbar();
  if (!init()) {
    const observer = new MutationObserver(() => {
      if (init()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}


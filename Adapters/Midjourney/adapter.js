// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™] ========== MIDJOURNEY ADAPTER LOADING ==========");
console.log("[PromptProfile™] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[PromptProfile™] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
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

function ensureStyle() {
  AdapterBase.ensureStyle();
}

function getHighlightButton() {
  // Midjourney may not have highlight buttons, but we still check
  for (const selector of HIGHLIGHT_BUTTON_SELECTORS) {
    const button = document.querySelector(selector);
    if (button instanceof HTMLButtonElement && button.offsetParent) {
      return button;
    }
  }
  return null;
}

function nodeInAssistantMessage(node) {
  // Midjourney is primarily image generation - may not have assistant messages
  // If they have image descriptions or results, we can detect those
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  // Midjourney-specific selectors for generated content/results
  return !!(
    element.closest("[class*='generated-image']") ||
    element.closest("[class*='result']") ||
    element.closest("[class*='image-result']") ||
    element.closest("img[alt*='generated']")?.parentElement
  );
}

function selectionTargetsAssistant(selection) {
  // Midjourney may not have assistant messages, so this might always return false
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
  // Midjourney-specific selectors for prompt input field
  return !!(
    element.closest("textarea") ||
    element.closest("input[type='text']") ||
    element.closest("[contenteditable='true']")?.closest("form") ||
    element.closest("[role='textbox']")?.closest("form") ||
    element.closest("[class*='prompt-input']") ||
    element.closest("[class*='input']")?.closest("form") ||
    element.closest("[id*='prompt']") ||
    element.closest("[id*='input']")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

function initSelectionToolbar() {
  // Midjourney may not have assistant messages, so toolbar might not show
  // But we initialize it anyway in case they add features
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

function captureMidjourneyChatHistory(maxMessages = 20) {
  // Midjourney is primarily image generation - may not have chat history
  // Return empty array if no chat interface exists
  console.log("%c[PromptProfile™ Midjourney] ========== captureMidjourneyChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[PromptProfile™ Midjourney] Current URL:", window.location.href);
  
  // For now, return empty array since Midjourney is image-focused
  // If they add chat features in the future, we can add selectors here
  console.log("[PromptProfile™ Midjourney] Midjourney is image-focused, no chat history available");
  return [];
}

function submitSelectionToSideChat(text) {
  if (selectionAskInFlight) {
    console.log("[PromptProfile™ Midjourney] Selection ask already in flight, ignoring");
    return;
  }
  
  if (!text || !text.trim()) {
    console.warn("[PromptProfile™ Midjourney] Empty text selected, cannot submit");
    return;
  }
  
  selectionAskInFlight = true;
  console.log("[PromptProfile™ Midjourney] Submitting selection to side chat:", text.substring(0, 50));
  
  const chatHistory = captureMidjourneyChatHistory(20);
  
  AdapterBase.sendMessage({
    type: "PROMPANION_SIDECHAT_REQUEST",
    text: text.trim(),
    chatHistory: chatHistory,
    source: "midjourney"
  })
    .then((response) => {
      selectionAskInFlight = false;
      if (response?.ok) {
        console.log("[PromptProfile™ Midjourney] Side chat request successful");
      } else {
        console.warn("[PromptProfile™ Midjourney] Side chat request failed:", response?.reason);
      }
    })
    .catch((error) => {
      selectionAskInFlight = false;
      console.error("[PromptProfile™ Midjourney] Side chat request error:", error);
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
  console.log("[PromptProfile™ Midjourney] locateComposer called");
  
  // Midjourney-specific selectors for prompt input
  const selectors = [
    "textarea:not([readonly])",
    "input[type='text']",
    "[contenteditable='true'][role='textbox']",
    "[class*='prompt-input']",
    "[class*='input'] textarea",
    "[id*='prompt']",
    "[id*='input']",
    "[contenteditable='true']"
  ];

  let input = null;
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      input = element;
      console.log("[PromptProfile™ Midjourney] Found input with selector:", selector);
      break;
    }
  }

  if (!input) {
    console.warn("[PromptProfile™ Midjourney] No input found in locateComposer");
    return null;
  }

  const container = input.closest("form") || 
                    input.closest("div[class*='input']") ||
                    input.closest("div[class*='prompt']") ||
                    input.parentElement || 
                    document.body;
  
  console.log("[PromptProfile™ Midjourney] Composer located:", { input, container });
  return { input, container };
}

function init() {
  console.log("[PromptProfile™ Midjourney] init() called");
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  AdapterBase.requestSelectionToolbarUpdate();
  
  if (composer) {
    console.log("[PromptProfile™ Midjourney] Composer found, setting up enhance tooltip");
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[PromptProfile™ Midjourney] Composer not found in init()");
  ensureDomObserver();
  return false;
}

function findComposerNode() {
  let composerNode = enhanceTooltipActiveTextarea;
  if (composerNode) {
    return composerNode;
  }

  const composer = locateComposer();
  if (composer?.input) {
    return composer.input;
  }

  const selectors = [
    "textarea:not([readonly])",
    "input[type='text']",
    "[contenteditable='true'][role='textbox']",
    "[class*='prompt-input']",
    "[id*='prompt']",
    "[id*='input']",
    "[contenteditable='true']"
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

function handleInsertTextMessage(message, sender, sendResponse) {
  try {
    const textToInsert = typeof message.text === "string" ? message.text.trim() : "";
    console.log("[PromptProfile™ Midjourney] ========== INSERT TEXT REQUEST ==========");
    console.log("[PromptProfile™ Midjourney] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    
    if (!textToInsert) {
      console.log("[PromptProfile™ Midjourney] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false;
    }

    console.log("[PromptProfile™ Midjourney] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[PromptProfile™ Midjourney] Composer node found:", !!composerNode);
    
    if (!composerNode) {
      console.log("[PromptProfile™ Midjourney] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false;
    }

    console.log("[PromptProfile™ Midjourney] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[PromptProfile™ Midjourney] setComposerText returned:", success);
    
    if (success) {
      console.log("[PromptProfile™ Midjourney] Insert succeeded!");
      sendResponse({ ok: true });
    } else {
      console.log("[PromptProfile™ Midjourney] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false;
  } catch (error) {
    console.error("[PromptProfile™ Midjourney] Insert text handler failed", error);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false;
  }
}

console.log("[PromptProfile™ Midjourney] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

async function setupEnhanceTooltip(input, container) {
  if (!input || enhanceTooltipActiveTextarea === input) return;
  teardownEnhanceTooltip();
  enhanceTooltipActiveTextarea = input;
  enhanceTooltipDismissed = false;
  lastEnhanceTextSnapshot = "";
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
    
    enhanceTooltipElement.append(buttonRow);
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
    console.error("[PromptProfile™ Midjourney] No composer node found!");
    return;
  }
  const promptText = extractInputText().trim();
  if (!promptText) {
    return;
  }
  
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
      
      AdapterBase.showUndoButton(composerNode);
      
      enhanceActionInFlight = false;
    })
    .catch((error) => {
      console.error("PromptProfile™ Midjourney: refine request threw", error);
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
    showEnhanceTooltip();
  }, 500);
}

function showEnhanceTooltip() {
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) return;
  if (enhanceTooltipDismissed) return;
  
  ensureStyle();
  ensureEnhanceTooltipElement();
  positionEnhanceTooltip();
  enhanceTooltipElement.classList.add("is-visible");
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

function requestPromptEnhancement(promptText) {
  return AdapterBase.sendMessage({
    type: "PROMPANION_ENHANCE_REQUEST",
    prompt: promptText,
    source: "midjourney",
    outputType: "Image" // Midjourney is for image generation
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}


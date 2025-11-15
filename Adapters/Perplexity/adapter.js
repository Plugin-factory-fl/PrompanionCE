// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[Prompanion] ========== PERPLEXITY ADAPTER LOADING ==========");
console.log("[Prompanion] Timestamp:", new Date().toISOString());
console.log("[Prompanion] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[Prompanion] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
}

const BUTTON_ID = "prompanion-perplexity-trigger";
const BUTTON_CLASS = "prompanion-perplexity-trigger";
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const HIGHLIGHT_BUTTON_SELECTORS = [
  // Perplexity-specific selectors for highlight/select buttons (if they exist)
  "button[aria-label*='Ask']",
  "button[aria-label*='ask']",
  "button[aria-label*='Perplexity']"
];
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

console.log("[Prompanion] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
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
let selectionAskInFlight = false;
let tooltipClickInProgress = false;
let selectionToolbarElement = null;
let selectionToolbarButton = null;
let selectionToolbarText = "";
let selectionUpdateRaf = null;
let highlightObserver = null;

// Generic styles moved to styles/AdapterStyles.css
// Styles are loaded via ensureStyle() function

// Generic DOM utilities have been moved to AdapterBase
// Use AdapterBase.injectStyle(), AdapterBase.getElementFromNode(), etc.

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
  
  // Add Perplexity-specific button styles
  const buttonStyleId = `${BUTTON_ID}-style`;
  let buttonStyleElement = document.getElementById(buttonStyleId);
  
  if (!buttonStyleElement) {
    buttonStyleElement = document.createElement("style");
    buttonStyleElement.id = buttonStyleId;
    buttonStyleElement.textContent = `
      .${BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        width: ${BUTTON_SIZE.wrapper};
        height: ${BUTTON_SIZE.wrapper};
        padding: 0;
        background: linear-gradient(135deg, #10152b, #1f2a44);
        box-shadow: 0 6px 16px rgba(31, 42, 68, 0.25);
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }

      .${BUTTON_CLASS}:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(31, 42, 68, 0.3);
      }

      .${BUTTON_CLASS}:focus-visible {
        outline: 2px solid #246bff;
        outline-offset: 2px;
      }

      .${BUTTON_CLASS}__icon {
        width: ${BUTTON_SIZE.icon};
        height: ${BUTTON_SIZE.icon};
        border-radius: 50%;
        display: block;
        background-color: #162036;
        background-position: center;
        background-repeat: no-repeat;
        background-size: cover;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
      }
    `;
    document.head.appendChild(buttonStyleElement);
  }
}

// Generic DOM utilities removed - use AdapterBase.getElementFromNode(), etc.

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
  
  // Perplexity-specific selectors for assistant messages
  // Perplexity uses various patterns - need to check multiple possibilities
  // Strategy: Check for assistant-related attributes, classes, or structural patterns
  
  // Method 1: Check for explicit role/type attributes
  if (element.closest("[data-role='assistant']") ||
      element.closest("[data-message-role='assistant']") ||
      element.closest("[role='assistant']") ||
      element.closest("[data-type='assistant']") ||
      element.closest("[data-message-type='assistant']")) {
    return true;
  }
  
  // Method 2: Check if element itself has assistant attributes
  if (element.getAttribute("data-role") === "assistant" ||
      element.getAttribute("data-message-role") === "assistant" ||
      element.getAttribute("role") === "assistant" ||
      element.getAttribute("data-type") === "assistant") {
    return true;
  }
  
  // Method 3: Check parent elements for assistant indicators
  let current = element.parentElement;
  let depth = 0;
  while (current && depth < 15) {
    // Check for assistant-related attributes
    if (current.getAttribute("data-role") === "assistant" ||
        current.getAttribute("data-message-role") === "assistant" ||
        current.getAttribute("role") === "assistant" ||
        current.getAttribute("data-type") === "assistant" ||
        current.getAttribute("data-message-type") === "assistant") {
      return true;
    }
    
    // Check for assistant-related classes (common patterns)
    const className = current.className || "";
    if (typeof className === "string") {
      if (className.includes("assistant") ||
          className.includes("response") ||
          className.includes("answer") ||
          className.includes("bot-message") ||
          className.includes("ai-message")) {
        // Make sure it's not a user message
        if (!className.includes("user") && !className.includes("human")) {
          return true;
        }
      }
    }
    
    // Check for specific Perplexity patterns
    // Perplexity might structure messages in specific containers
    if (current.tagName === "ARTICLE" || current.tagName === "SECTION") {
      // Articles/sections often contain assistant responses
      // Check if it doesn't contain user input markers
      const hasUserInput = current.querySelector("[data-role='user']") ||
                          current.querySelector("[data-message-role='user']") ||
                          current.querySelector("[role='user']");
      if (!hasUserInput) {
        // Likely an assistant message
        return true;
      }
    }
    
    current = current.parentElement;
    depth++;
  }
  
  // Method 4: Check for message containers that are not the input area
  // If we're in a message container and not in the composer, it's likely an assistant message
  const isInComposer = nodeInComposer(node);
  if (!isInComposer) {
    // Check if we're explicitly in a user message (if so, return false)
    if (element.closest("[data-role='user']") ||
        element.closest("[data-message-role='user']") ||
        element.closest("[role='user']") ||
        element.closest("[data-type='user']") ||
        element.closest("[data-message-type='user']")) {
      return false;
    }
    
    // Check if element or parent has user-related classes
    let checkElement = element;
    for (let i = 0; i < 10 && checkElement; i++) {
      const className = checkElement.className || "";
      if (typeof className === "string" && 
          (className.includes("user-message") || 
           className.includes("human-message") ||
           className.includes("question"))) {
        // Make sure it's not also an assistant message
        if (!className.includes("assistant") && !className.includes("response")) {
          return false;
        }
      }
      checkElement = checkElement.parentElement;
    }
    
    // Check if we're in what looks like a message/response area
    const messageContainer = element.closest("div[class*='message']") ||
                            element.closest("div[class*='response']") ||
                            element.closest("div[class*='answer']") ||
                            element.closest("article") ||
                            element.closest("section") ||
                            element.closest("main") ||
                            element.closest("[class*='chat']") ||
                            element.closest("[class*='conversation']");
    
    if (messageContainer) {
      // Make sure it's not near the input (if input exists)
      const input = document.querySelector("#ask-input");
      if (input && input.isConnected) {
        const inputRect = input.getBoundingClientRect();
        const containerRect = messageContainer.getBoundingClientRect();
        // If message container is above the input, it's likely an assistant message
        if (containerRect.bottom < inputRect.top) {
          console.log("[Prompanion] nodeInAssistantMessage: detected assistant message (above input)");
          return true;
        }
      } else {
        // No input found or input not visible, assume it's an assistant message if in message container
        console.log("[Prompanion] nodeInAssistantMessage: detected assistant message (no input found)");
        return true;
      }
    }
    
    // Method 5: Fallback - if not in composer and not explicitly user, assume assistant
    // This is a more aggressive approach for Perplexity where structure might be unclear
    // Only do this if we're in the main content area (not in header, footer, etc.)
    const bodyRect = document.body.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Check if element is in the visible content area (rough heuristic)
    if (elementRect.top > 100 && elementRect.bottom < bodyRect.bottom - 100) {
      // Not in header/footer area, and not in composer
      // Check if it's in main content
      const mainContent = element.closest("main") || 
                         element.closest("[role='main']") ||
                         element.closest("[class*='content']") ||
                         element.closest("[class*='chat']");
      
      if (mainContent && !isInComposer) {
        console.log("[Prompanion] nodeInAssistantMessage: detected assistant message (fallback - in main content)");
        return true;
      }
    }
  }
  
  return false;
}

function selectionTargetsAssistant(selection) {
  if (!selection) return false;
  
  // Check anchor and focus nodes
  const anchorInAssistant = nodeInAssistantMessage(selection.anchorNode);
  const focusInAssistant = nodeInAssistantMessage(selection.focusNode);
  
  if (anchorInAssistant || focusInAssistant) {
    console.log("[Prompanion] selectionTargetsAssistant: true (anchor or focus in assistant)", {
      anchorInAssistant,
      focusInAssistant
    });
    return true;
  }
  
  // Check common ancestor container
  try {
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      const containerInAssistant = nodeInAssistantMessage(range.commonAncestorContainer);
      if (containerInAssistant) {
        console.log("[Prompanion] selectionTargetsAssistant: true (container in assistant)");
        return true;
      }
    }
  } catch (e) {
    console.log("[Prompanion] selectionTargetsAssistant: error checking range", e);
  }
  
  // Additional check: if selection is not in composer and has text, assume assistant
  // This is a more aggressive fallback for Perplexity
  const anchorInComposer = nodeInComposer(selection.anchorNode);
  const focusInComposer = nodeInComposer(selection.focusNode);
  const text = selection.toString().trim();
  
  if (!anchorInComposer && !focusInComposer && text) {
    // Not in composer, has text - likely an assistant message
    // But double-check we're not in a user message container
    const anchorElement = AdapterBase.getElementFromNode(selection.anchorNode);
    const focusElement = AdapterBase.getElementFromNode(selection.focusNode);
    
    const isInUserMessage = (anchorElement && (
      anchorElement.closest("[data-role='user']") ||
      anchorElement.closest("[data-message-role='user']") ||
      anchorElement.closest("[role='user']")
    )) || (focusElement && (
      focusElement.closest("[data-role='user']") ||
      focusElement.closest("[data-message-role='user']") ||
      focusElement.closest("[role='user']")
    ));
    
    if (!isInUserMessage) {
      console.log("[Prompanion] selectionTargetsAssistant: true (fallback - not in composer, not user)");
      return true;
    }
  }
  
  console.log("[Prompanion] selectionTargetsAssistant: false");
  return false;
}

function ensureHighlightObserver() {
  if (highlightObserver || !document.body) return;
  highlightObserver = new MutationObserver(() => {
    if (getHighlightButton()) requestSelectionToolbarUpdate();
  });
  highlightObserver.observe(document.body, { childList: true, subtree: true });
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  // Perplexity-specific selectors for composer/input field
  // PRIMARY: check for #ask-input ID
  return !!(
    element.id === "ask-input" ||
    element.closest("#ask-input") ||
    element.closest("textarea[placeholder*='Ask']") ||
    element.closest("textarea[placeholder*='ask']") ||
    element.closest("[contenteditable='true'][role='textbox'][id='ask-input']") ||
    element.closest("[contenteditable='true'][role='textbox'][data-lexical-editor='true']") ||
    element.closest("[contenteditable='true'][role='textbox']") ||
    element.closest("div[contenteditable='true']")?.closest("form") ||
    element.closest("[data-testid='chat-input']") ||
    element.closest("[data-testid='composer']") ||
    element.closest("form")?.querySelector("textarea, [contenteditable='true']")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

function ensureSelectionToolbar() {
  if (selectionToolbarElement) return selectionToolbarElement;
  
  // CRITICAL: Ensure styles are injected before creating the toolbar element
  ensureStyle();
  
  const toolbar = document.createElement("div");
  toolbar.id = SELECTION_TOOLBAR_ID;
  
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "prompanion-selection-toolbar__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideSelectionToolbar();
  });
  
  const button = document.createElement("button");
  button.type = "button";
  button.className = "prompanion-selection-toolbar__button";
  button.textContent = "Elaborate";
  button.addEventListener("pointerdown", (e) => e.preventDefault());
  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", handleSelectionToolbarAction);
  
  toolbar.append(dismiss, button);
  
  // Verify document.body exists before appending
  if (!document.body) {
    console.error("[Prompanion] Cannot create selection toolbar: document.body not available");
    return null;
  }
  
  document.body.append(toolbar);
  selectionToolbarElement = toolbar;
  selectionToolbarButton = button;
  return toolbar;
}

function hideSelectionToolbar() {
  if (selectionToolbarElement) {
    selectionToolbarElement.classList.remove(SELECTION_TOOLBAR_VISIBLE_CLASS);
    // Clear inline styles that might interfere
    selectionToolbarElement.style.opacity = "";
    selectionToolbarElement.style.pointerEvents = "";
  }
  selectionToolbarText = "";
}

// Generic getSelectionRect removed - use AdapterBase.getSelectionRect()

function requestSelectionToolbarUpdate() {
  if (selectionUpdateRaf !== null) {
    return;
  }
  selectionUpdateRaf = window.requestAnimationFrame(() => {
    selectionUpdateRaf = null;
    updateSelectionToolbar();
  });
}

function updateSelectionToolbar() {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  
  const inComposer = selection ? selectionWithinComposer(selection) : false;
  const targetsAssistant = selection ? selectionTargetsAssistant(selection) : false;
  
  console.log("[Prompanion] updateSelectionToolbar called", {
    hasSelection: !!selection,
    isCollapsed: selection?.isCollapsed,
    textLength: text?.length,
    textPreview: text?.substring(0, 30),
    inComposer,
    targetsAssistant,
    anchorNode: selection?.anchorNode?.nodeName,
    focusNode: selection?.focusNode?.nodeName,
    anchorElement: selection?.anchorNode?.parentElement?.tagName,
    focusElement: selection?.focusNode?.parentElement?.tagName
  });
  
  // Debug: Log element details for selection
  if (selection && !selection.isCollapsed && text) {
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element = AdapterBase.getElementFromNode(container);
      if (element) {
        console.log("[Prompanion] Selection container details:", {
          tagName: element.tagName,
          className: element.className,
          id: element.id,
          dataRole: element.getAttribute("data-role"),
          dataMessageRole: element.getAttribute("data-message-role"),
          role: element.getAttribute("role"),
          closestAssistant: !!element.closest("[data-role='assistant']"),
          closestUser: !!element.closest("[data-role='user']"),
          isInComposer: nodeInComposer(container),
          isInAssistant: nodeInAssistantMessage(container)
        });
      }
    } catch (e) {
      console.log("[Prompanion] Error getting selection details:", e);
    }
  }
  
  if (!selection || selection.isCollapsed || !text || inComposer || !targetsAssistant) {
    console.log("[Prompanion] Hiding toolbar - conditions not met", {
      noSelection: !selection,
      isCollapsed: selection?.isCollapsed,
      noText: !text,
      inComposer,
      notAssistant: !targetsAssistant
    });
    hideSelectionToolbar();
    return;
  }
  
  console.log("[Prompanion] Showing toolbar - all conditions met");
  const rangeRect = AdapterBase.getSelectionRect(selection);
  if (!rangeRect) {
    hideSelectionToolbar();
    return;
  }

  const toolbar = ensureSelectionToolbar();
  if (!toolbar) {
    console.error("[Prompanion] Failed to create selection toolbar");
    return;
  }
  selectionToolbarText = text;
  
  // Position tooltip BELOW the selection to avoid conflict with Perplexity's native UI
  // Measure toolbar dimensions by temporarily positioning offscreen (but keep opacity 0 via class)
  toolbar.classList.remove(SELECTION_TOOLBAR_VISIBLE_CLASS);
  toolbar.style.position = "fixed";
  toolbar.style.left = "-9999px";
  toolbar.style.top = "0";
  toolbar.style.transform = "translate(-50%, 0)";
  toolbar.style.opacity = "0";
  toolbar.style.pointerEvents = "none";
  toolbar.style.display = "flex"; // Ensure display is set for accurate measurement
  
  // Force multiple reflows to ensure styles are fully applied before measuring
  void toolbar.offsetWidth; // Force layout recalculation
  void toolbar.offsetHeight; // Force another reflow to ensure styles applied
  
  let w = toolbar.offsetWidth;
  let h = toolbar.offsetHeight;
  
  // Verify we got valid dimensions
  if (!w || !h) {
    console.warn("[Prompanion] Toolbar has invalid dimensions:", { w, h }, "retrying...");
    // Force another reflow and remeasure
    void toolbar.offsetWidth;
    w = toolbar.offsetWidth;
    h = toolbar.offsetHeight;
    if (!w || !h) {
      console.error("[Prompanion] Toolbar dimensions still invalid, cannot position tooltip");
      return;
    }
  }
  
  const { clientWidth: vw, clientHeight: vh } = document.documentElement;
  const selectionCenterX = rangeRect.left + rangeRect.width / 2;
  const selectionBottom = rangeRect.bottom;
  
  // Calculate horizontal position (centered on selection, constrained to viewport)
  let left = Math.max(w / 2 + 8, Math.min(vw - w / 2 - 8, selectionCenterX));
  
  // Calculate vertical position (BELOW selection with 8px gap)
  let top = selectionBottom + 8;
  
  // Ensure tooltip doesn't go below viewport (with 8px margin)
  const maxTop = vh - h - 8;
  if (top > maxTop) {
    // If it would go below viewport, position it above instead (but this should be rare)
    top = Math.max(8, rangeRect.top - h - 8);
    toolbar.style.transform = "translate(-50%, -100%)";
  } else {
    toolbar.style.transform = "translate(-50%, 0)";
  }
  
  // Apply final positioning
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  
  // Show the tooltip with opacity transition
  toolbar.style.opacity = "";
  toolbar.style.pointerEvents = "";
  toolbar.classList.add(SELECTION_TOOLBAR_VISIBLE_CLASS);
}

function submitSelectionToSideChat(text) {
  const snippet = typeof text === "string" ? text.trim() : "";
  if (!snippet || selectionAskInFlight) return;
  selectionAskInFlight = true;
  try {
    AdapterBase.sendMessage({ type: "PROMPANION_SIDECHAT_REQUEST", text: snippet }, (response) => {
      if (!response?.ok) {
        console.warn("Prompanion: sidechat request rejected", response?.reason);
      }
      selectionAskInFlight = false;
    }).catch((error) => {
      console.warn("Prompanion: failed to request sidechat from selection", error);
      selectionAskInFlight = false;
    });
  } catch (error) {
    console.error("Prompanion: sidechat request threw synchronously", error);
    selectionAskInFlight = false;
  }
}

function handleSelectionToolbarAction(event) {
  event.preventDefault();
  event.stopPropagation();
  const text = selectionToolbarText;
  hideSelectionToolbar();
  submitSelectionToSideChat(text);
}

function handleSelectionChange() {
  console.log("[Prompanion] handleSelectionChange fired");
  requestSelectionToolbarUpdate();
}

// Generic setButtonTextContent removed - use AdapterBase.setButtonTextContent()

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
      console.warn("Prompanion: enhancement request failed", error);
      return { ok: false };
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

  // Last resort: query for common selectors (prioritize Perplexity-specific)
  const selectors = [
    "#ask-input",
    "[contenteditable='true'][role='textbox'][id='ask-input']",
    "[contenteditable='true'][role='textbox'][data-lexical-editor='true']",
    "[contenteditable='true'][role='textbox']",
    "textarea[placeholder*='Ask']",
    "textarea[placeholder*='ask']",
    "[data-testid='chat-input'][contenteditable='true']",
    "[data-testid='composer'][contenteditable='true']",
    "div[contenteditable='true']",
    "textarea:not([readonly])"
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
// This wrapper maintains Perplexity-specific logging
function setComposerText(node, text) {
  return AdapterBase.setEditableElementText(node, text, { verbose: true });
}

function buildButton() {
  ensureStyle();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.append(createIcon());
  // Use AdapterBase for generic hover tooltip
  AdapterBase.attachTooltip(button, "Open Prompanion to enhance your prompts for the best response.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("Prompanion: failed to open sidebar from Perplexity adapter", e)));
  button.addEventListener("mouseenter", () => AdapterBase.showTooltip(button, BUTTON_ID));
  button.addEventListener("focus", () => AdapterBase.showTooltip(button, BUTTON_ID));
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

function placeButton(targetContainer, inputNode, buttonTargetElement = null) {
  if (!inputNode) {
    console.log("[Prompanion] placeButton: no inputNode provided");
    return;
  }
  
  console.log("[Prompanion] placeButton: called with", {
    inputNode: inputNode.id || inputNode.className,
    targetContainer: targetContainer?.tagName || targetContainer?.className,
    buttonTargetElement: buttonTargetElement?.tagName || buttonTargetElement?.className
  });
  
  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  floatingButtonTargetInput = inputNode;
  positionFloatingButton(inputNode, floatingButtonTargetContainer, buttonTargetElement);
  
  console.log("[Prompanion] placeButton: button placed", {
    wrapper: floatingButtonWrapper?.id,
    button: floatingButtonElement?.id,
    container: floatingButtonTargetContainer?.tagName
  });
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer, buttonTargetElement = null) {
  if (!floatingButtonWrapper) {
    console.log("[Prompanion] positionFloatingButton: no wrapper");
    return;
  }
  
  // Try to find the target element if not provided
  if (!buttonTargetElement) {
    const targetXPath = "//*[@id='root']/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[2]";
    buttonTargetElement = findElementByXPath(targetXPath);
  }
  
  const target = containerNode ?? inputNode;
  if (!target) {
    console.log("[Prompanion] positionFloatingButton: no target");
    return;
  }
  
  console.log("[Prompanion] positionFloatingButton: positioning button", {
    target: target.tagName,
    targetClass: target.className,
    wrapperId: floatingButtonWrapper.id,
    buttonTargetElement: buttonTargetElement?.tagName || buttonTargetElement?.className
  });
  
  // Ensure target has position: relative for absolute positioning
  const targetStyle = getComputedStyle(target);
  if (targetStyle.position === "static") {
    target.style.position = "relative";
    console.log("[Prompanion] positionFloatingButton: set target position to relative");
  }
  
  // Append wrapper to target if not already there
  if (floatingButtonWrapper.parentElement !== target) {
    console.log("[Prompanion] positionFloatingButton: appending wrapper to target");
    target.append(floatingButtonWrapper);
  }
  
  // Position button to the RIGHT of the target element (if found) or use default positioning
  if (buttonTargetElement && buttonTargetElement.isConnected) {
    // Calculate position relative to the target element
    const targetRect = buttonTargetElement.getBoundingClientRect();
    const containerRect = target.getBoundingClientRect();
    
    // Position to the right of the target element
    // Calculate the left position relative to the container
    const buttonWidth = BUTTON_SIZE.wrapper ? parseInt(BUTTON_SIZE.wrapper.replace("px", "")) : 44;
    const gap = 12; // Gap between button and target element
    
    // Calculate relative position within the container
    // We want the button to be to the right of the target element
    const relativeLeft = targetRect.right - containerRect.left + gap;
    const relativeTop = targetRect.top - containerRect.top + (targetRect.height / 2);
    
    // Ensure the button doesn't go off the right edge of the container
    const containerWidth = containerRect.width;
    const maxLeft = containerWidth - buttonWidth - 8; // Leave 8px margin from right edge
    const finalLeft = Math.min(maxLeft, relativeLeft);
    
    floatingButtonWrapper.style.left = `${finalLeft}px`;
    floatingButtonWrapper.style.top = `${relativeTop}px`;
    floatingButtonWrapper.style.right = "auto";
    floatingButtonWrapper.style.transform = "translateY(-50%)";
    
    console.log("[Prompanion] positionFloatingButton: button positioned to the RIGHT of target element", {
      targetRect: { left: targetRect.left, right: targetRect.right, top: targetRect.top, width: targetRect.width, height: targetRect.height },
      containerRect: { left: containerRect.left, right: containerRect.right, top: containerRect.top, width: containerRect.width, height: containerRect.height },
      relativeLeft,
      finalLeft,
      relativeTop,
      buttonWidth,
      gap,
      containerWidth,
      maxLeft,
      targetElement: buttonTargetElement.tagName,
      targetClass: buttonTargetElement.className
    });
  } else {
    // Fallback: position on the right side of container, vertically centered
    floatingButtonWrapper.style.left = "auto";
    floatingButtonWrapper.style.right = "12px";
    floatingButtonWrapper.style.top = "50%";
    floatingButtonWrapper.style.transform = "translateY(-50%)";
    
    console.log("[Prompanion] positionFloatingButton: button positioned on right (fallback - target element not found)");
  }
  
  // Ensure button is visible
  floatingButtonWrapper.style.display = "flex";
  floatingButtonWrapper.style.visibility = "visible";
  floatingButtonWrapper.style.opacity = "1";
  
  console.log("[Prompanion] positionFloatingButton: button positioned", {
    left: floatingButtonWrapper.style.left,
    top: floatingButtonWrapper.style.top,
    right: floatingButtonWrapper.style.right,
    transform: floatingButtonWrapper.style.transform,
    isConnected: floatingButtonWrapper.isConnected,
    parent: floatingButtonWrapper.parentElement?.tagName
  });
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    // Try to find the target element again (in case DOM changed)
    const targetXPath = "//*[@id='root']/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[2]";
    const buttonTargetElement = findElementByXPath(targetXPath);
    positionFloatingButton(floatingButtonTargetInput, floatingButtonTargetContainer, buttonTargetElement);
  }
}

/**
 * Finds an element using XPath
 * @param {string} xpath - The XPath expression
 * @returns {HTMLElement|null} The found element or null
 */
function findElementByXPath(xpath) {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue instanceof HTMLElement ? result.singleNodeValue : null;
  } catch (e) {
    console.error("[Prompanion] XPath evaluation failed:", e);
    return null;
  }
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  const observer = new MutationObserver(() => {
    requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
      placeButton(composer.container, composer.input, composer.buttonTargetElement);
      setupEnhanceTooltip(composer.input, composer.container);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  // Perplexity-specific selectors for composer based on actual DOM structure
  // PRIMARY selector: #ask-input (the actual input field ID from Perplexity.ai)
  let input = document.querySelector("#ask-input");
  
  // If #ask-input not found, try other selectors as fallback
  if (!input) {
    input = document.querySelector("[contenteditable='true'][role='textbox'][id='ask-input']") ??
            document.querySelector("[contenteditable='true'][role='textbox'][data-lexical-editor='true']") ??
            document.querySelector("[contenteditable='true'][role='textbox']") ??
            document.querySelector("textarea[placeholder*='Ask']") ??
            document.querySelector("textarea[placeholder*='ask']") ??
            document.querySelector("[data-testid='chat-input'][contenteditable='true']");
  }
  
  // If still not found, try finding via form wrapper
  if (!input) {
    const form = document.querySelector("form");
    if (form) {
      input = form.querySelector("#ask-input") ??
              form.querySelector("[contenteditable='true'][role='textbox']") ??
              form.querySelector("div[contenteditable='true']") ??
              form.querySelector("textarea:not([readonly])");
    }
  }
  
  // Last resort: try direct queries with broader selectors
  if (!input) {
    const directSelectors = [
      "#ask-input",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true'][data-lexical-editor='true']",
      "textarea[placeholder*='Ask']",
      "textarea[placeholder*='ask']",
      "[data-testid='chat-input']",
      "div[contenteditable='true']",
      "textarea:not([readonly])"
    ];
    
    for (const selector of directSelectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement && (element instanceof HTMLTextAreaElement || element.isContentEditable)) {
        input = element;
        break;
      }
    }
  }
  
  if (!input) {
    console.log("[Prompanion] locateComposer: input not found");
    return null;
  }
  
  console.log("[Prompanion] locateComposer: found input", input.id, input.className);
  
  // Find target element for button placement using XPath
  // Target: //*[@id="root"]/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[2]
  const targetXPath = "//*[@id='root']/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[2]";
  let buttonTargetElement = findElementByXPath(targetXPath);
  
  console.log("[Prompanion] locateComposer: button target element", buttonTargetElement);
  
  // Find container for button placement
  // Use the target element's parent or a suitable container
  let container = null;
  
  if (buttonTargetElement) {
    // Find a suitable parent container for the button
    // Walk up to find a container with relative positioning or suitable layout
    let current = buttonTargetElement.parentElement;
    let depth = 0;
    while (current && depth < 10) {
      const style = getComputedStyle(current);
      const hasRelativePosition = style.position === "relative" || style.position === "absolute";
      const hasFlex = style.display === "flex" || style.display === "grid";
      
      if (hasRelativePosition || hasFlex || current.classList.contains("relative") || current.classList.contains("flex")) {
        container = current;
        console.log("[Prompanion] locateComposer: found container from target element", container.tagName, container.className);
        break;
      }
      current = current.parentElement;
      depth++;
    }
    
    // If no suitable container found, use the target element's parent
    if (!container) {
      container = buttonTargetElement.parentElement;
      console.log("[Prompanion] locateComposer: using target element's parent as container", container?.tagName);
    }
  }
  
  // Fallback: use the old method if target element not found
  if (!container) {
    console.log("[Prompanion] locateComposer: target element not found, using fallback");
    let current = input.parentElement;
    let depth = 0;
    while (current && depth < 10) {
      const style = getComputedStyle(current);
      const hasRelativePosition = style.position === "relative";
      const hasWFullClass = current.classList.contains("w-full");
      const hasRelativeClass = current.classList.contains("relative");
      
      if (hasRelativePosition || hasWFullClass || hasRelativeClass) {
        container = current;
        console.log("[Prompanion] locateComposer: found container (fallback)", container.className);
        break;
      }
      current = current.parentElement;
      depth++;
    }
    
    // Final fallback
    if (!container) {
      container = input.closest("div[class*='relative']") ??
                  input.closest("div[class*='w-full']") ??
                  input.closest("form") ??
                  input.parentElement ??
                  document.body;
    }
  }
  
  // Ensure container has position: relative for absolute positioning of button
  if (container && container !== document.body) {
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === "static") {
      container.style.position = "relative";
      console.log("[Prompanion] locateComposer: set container position to relative");
    }
  }
  
  return { input, container, buttonTargetElement };
}

function init() {
  const composer = locateComposer();
  requestSelectionToolbarUpdate();
  if (composer) {
    placeButton(composer.container, composer.input, composer.buttonTargetElement);
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
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
    console.log("[Prompanion] ========== INSERT TEXT REQUEST ==========");
    console.log("[Prompanion] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    console.log("[Prompanion] Text length:", textToInsert.length);
    
    if (!textToInsert) {
      console.log("[Prompanion] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[Prompanion] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[Prompanion] Composer node found:", composerNode);
    console.log("[Prompanion] Node type:", composerNode?.constructor?.name);
    console.log("[Prompanion] Node isContentEditable:", composerNode?.isContentEditable);
    console.log("[Prompanion] Node tagName:", composerNode?.tagName);
    console.log("[Prompanion] Node className:", composerNode?.className);
    console.log("[Prompanion] Node visible:", composerNode ? (composerNode.offsetParent !== null) : false);
    console.log("[Prompanion] Node current value:", composerNode ? (composerNode.value || composerNode.textContent || "").substring(0, 50) : "");
    
    if (!composerNode) {
      console.log("[Prompanion] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[Prompanion] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[Prompanion] setComposerText returned:", success);
    
    // Verify insertion
    const currentValue = composerNode.value || composerNode.textContent || "";
    const textInserted = currentValue.includes(textToInsert.substring(0, Math.min(20, textToInsert.length)));
    console.log("[Prompanion] Verification - text appears in node:", textInserted);
    console.log("[Prompanion] Current node value:", currentValue.substring(0, 100));
    
    if (success && textInserted) {
      console.log("[Prompanion] Insert succeeded!");
      sendResponse({ ok: true });
    } else if (success && !textInserted) {
      console.warn("[Prompanion] setComposerText returned true but text not verified in node");
      sendResponse({ ok: false, reason: "INSERTION_NOT_VERIFIED" });
    } else {
      console.log("[Prompanion] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false; // sendResponse called synchronously, close channel
  } catch (error) {
    console.error("[Prompanion] Insert text handler failed", error);
    console.error("[Prompanion] Error stack:", error.stack);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false; // sendResponse called synchronously, close channel
  }
}

// Register message handler using AdapterBase (must be after handleInsertTextMessage is defined)
console.log("[Prompanion] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

function bootstrap() {
  ensureHighlightObserver();
  if (!init()) {
    const observer = new MutationObserver(() => {
      if (init()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

// Generic tooltip functions have been moved to AdapterBase
// Use AdapterBase.attachTooltip(), AdapterBase.showTooltip(), etc.

function setupEnhanceTooltip(input, container) {
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
  detachTooltipResizeHandler();
}

function ensureEnhanceTooltipElement() {
  if (!enhanceTooltipElement) {
    console.log("[Prompanion] Creating enhance tooltip element");
    enhanceTooltipElement = document.createElement("div");
    enhanceTooltipElement.className = "prompanion-enhance-tooltip";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "prompanion-enhance-tooltip__dismiss";
    dismiss.textContent = "×";
    dismiss.setAttribute("aria-label", "Dismiss prompt enhancement suggestion");
    dismiss.addEventListener("click", () => {
      enhanceTooltipDismissed = true;
      hideEnhanceTooltip();
    });
    const action = document.createElement("button");
    action.type = "button";
    action.className = "prompanion-enhance-tooltip__action";
    AdapterBase.setButtonTextContent(action, "Refine");
    console.log("[Prompanion] Attaching click handler to Refine button");
    console.log("[Prompanion] handleRefineButtonClick function exists:", typeof handleRefineButtonClick);
    action.addEventListener("click", handleRefineButtonClick);
    console.log("[Prompanion] Click handler attached, button:", action);
    enhanceTooltipElement.append(dismiss, action);
    console.log("[Prompanion] Enhance tooltip element created");
  }
  if (!enhanceTooltipElement.isConnected) {
    console.log("[Prompanion] Appending enhance tooltip to body");
    document.body.append(enhanceTooltipElement);
  }
  hideEnhanceTooltip();
}

function handleRefineButtonClick(e) {
  console.log("[Prompanion] ========== REFINE BUTTON HANDLER FIRED ==========");
  console.log("[Prompanion] Event type:", e.type);
  console.log("[Prompanion] Event target:", e.target);
  e.preventDefault();
  e.stopPropagation();
  if (enhanceActionInFlight) {
    return;
  }
  const composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  console.log("[Prompanion] Composer node:", composerNode);
  if (!composerNode) {
    console.error("[Prompanion] No composer node found!");
    return;
  }
  const promptText = extractInputText().trim();
  console.log("[Prompanion] Prompt text:", promptText);
  if (!promptText) {
    return;
  }
  enhanceActionInFlight = true;
  enhanceTooltipDismissed = true;
  hideEnhanceTooltip();
  console.log("[Prompanion] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        return;
      }
      const refinedText = result.optionA && typeof result.optionA === "string" && result.optionA.trim()
        ? result.optionA.trim() 
        : promptText;
      setComposerText(composerNode, refinedText);
      enhanceActionInFlight = false;
    })
    .catch((error) => {
      console.error("Prompanion: refine request threw", error);
      enhanceActionInFlight = false;
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
  // Filter out any Perplexity-specific debug text or artifacts
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
  if (enhanceTooltipElement?.classList.contains("is-visible") && !tooltipClickInProgress) {
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
  enhanceTooltipTimer = window.setTimeout(() => {
    if (!enhanceTooltipActiveTextarea) return;
    const wordCount = extractInputText().trim().split(/\s+/).filter(Boolean).length;
    if (wordCount >= 3 && !enhanceTooltipDismissed) showEnhanceTooltip();
  }, 1000);
}

function showEnhanceTooltip() {
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
    if (!enhanceTooltipElement) return;
  }
  positionEnhanceTooltip();
  enhanceTooltipElement.classList.add("is-visible");
  attachTooltipResizeHandler();
}

function hideEnhanceTooltip() {
  if (!enhanceTooltipElement) return;
  enhanceTooltipElement.classList.remove("is-visible");
  detachTooltipResizeHandler();
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
  console.log("[Prompanion] ========== BACKUP MESSAGE LISTENER REGISTRATION ==========");
  console.log("[Prompanion] Current time:", new Date().toISOString());
  
  if (typeof chrome === "undefined") {
    console.error("[Prompanion] chrome is undefined in backup registration");
    return;
  }
  
  if (!chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[Prompanion] chrome.runtime.onMessage not available in backup registration");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message && message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[Prompanion] BACKUP LISTENER: PROMPANION_INSERT_TEXT received!");
        if (typeof handleInsertTextMessage === "function") {
          handleInsertTextMessage(message, sender, sendResponse);
        } else {
          console.error("[Prompanion] handleInsertTextMessage is not a function!");
          sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        }
        return true;
      }
      return false;
    });
    console.log("[Prompanion] ✓ Backup listener registered successfully");
  } catch (error) {
    console.error("[Prompanion] ✗ Backup listener registration failed:", error);
  }
})();

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}

console.log("[Prompanion] Registering selection change event listeners");
document.addEventListener("selectionchange", handleSelectionChange);
window.addEventListener("scroll", handleSelectionChange, true);
window.addEventListener("resize", handleSelectionChange);
console.log("[Prompanion] Selection change event listeners registered");

// Verify message listener is registered
console.log("[Prompanion] ========== VERIFYING MESSAGE LISTENER ==========");
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  console.log("[Prompanion] chrome.runtime.onMessage is available");
  console.log("[Prompanion] chrome.runtime.id:", chrome.runtime.id);
  console.log("[Prompanion] chrome.runtime.getURL:", typeof chrome.runtime.getURL);
} else {
  console.error("[Prompanion] chrome.runtime.onMessage is NOT available at this point!");
}

window.addEventListener("prompanion-panel-resize", () => {
  refreshFloatingButtonPosition();
});

document.addEventListener("mousedown", (e) => {
  if (enhanceTooltipElement?.classList.contains("is-visible")) {
    const button = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__action");
    const clickedButton = e.target.closest(".prompanion-enhance-tooltip__action");
    if (clickedButton || button === e.target) {
      console.log("[Prompanion] ========== MOUSEDOWN DETECTED ON BUTTON ==========");
      console.log("[Prompanion] Setting tooltipClickInProgress flag");
      tooltipClickInProgress = true;
      const buttonRef = button;
      const mousedownTime = Date.now();
      
      const clickHandler = (clickEvent) => {
        const timeSinceMousedown = Date.now() - mousedownTime;
        console.log("[Prompanion] ========== CLICK AFTER MOUSEDOWN (direct handler) ==========");
        console.log("[Prompanion] Time since mousedown:", timeSinceMousedown, "ms");
        console.log("[Prompanion] Click target:", clickEvent.target);
        if (typeof handleRefineButtonClick === "function") {
          handleRefineButtonClick(clickEvent);
        }
        document.removeEventListener("click", clickHandler, true);
      };
      
      document.addEventListener("click", clickHandler, true);
      
      setTimeout(() => {
        tooltipClickInProgress = false;
        console.log("[Prompanion] tooltipClickInProgress flag cleared");
        document.removeEventListener("click", clickHandler, true);
      }, 300);
    }
  }
}, true);


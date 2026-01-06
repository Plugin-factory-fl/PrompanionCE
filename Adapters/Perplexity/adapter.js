// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™] ========== PERPLEXITY ADAPTER LOADING ==========");
console.log("[PromptProfile™] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[PromptProfile™] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
}

const BUTTON_ID = "promptprofile-perplexity-trigger";
const BUTTON_CLASS = "promptprofile-perplexity-trigger";
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const HIGHLIGHT_BUTTON_SELECTORS = [
  // Perplexity-specific selectors for highlight/select buttons (if they exist)
  "button[aria-label*='Ask']",
  "button[aria-label*='ask']",
  "button[aria-label*='Perplexity']"
];
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

console.log("[PromptProfile™] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
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
let positionRetryCount = 0;
const MAX_POSITION_RETRIES = 5;

// Generic styles moved to styles/AdapterStyles.css
// Styles are loaded via ensureStyle() function

// Generic DOM utilities have been moved to AdapterBase
// Use AdapterBase.injectStyle(), AdapterBase.getElementFromNode(), etc.

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
          console.log("[PromptProfile™] nodeInAssistantMessage: detected assistant message (above input)");
          return true;
        }
      } else {
        // No input found or input not visible, assume it's an assistant message if in message container
        console.log("[PromptProfile™] nodeInAssistantMessage: detected assistant message (no input found)");
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
        console.log("[PromptProfile™] nodeInAssistantMessage: detected assistant message (fallback - in main content)");
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
    console.log("[PromptProfile™] selectionTargetsAssistant: true (anchor or focus in assistant)", {
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
        console.log("[PromptProfile™] selectionTargetsAssistant: true (container in assistant)");
        return true;
      }
    }
  } catch (e) {
    console.log("[PromptProfile™] selectionTargetsAssistant: error checking range", e);
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
      console.log("[PromptProfile™] selectionTargetsAssistant: true (fallback - not in composer, not user)");
      return true;
    }
  }
  
  console.log("[PromptProfile™] selectionTargetsAssistant: false");
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
  dismiss.className = "promptprofile-selection-toolbar__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideSelectionToolbar();
  });
  
  const button = document.createElement("button");
  button.type = "button";
  button.className = "promptprofile-selection-toolbar__button";
  button.textContent = "Elaborate";
  button.addEventListener("pointerdown", (e) => e.preventDefault());
  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", handleSelectionToolbarAction);
  
  toolbar.append(dismiss, button);
  
  // Verify document.body exists before appending
  if (!document.body) {
    console.error("[PromptProfile™] Cannot create selection toolbar: document.body not available");
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
  
  console.log("[PromptProfile™] updateSelectionToolbar called", {
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
        console.log("[PromptProfile™] Selection container details:", {
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
      console.log("[PromptProfile™] Error getting selection details:", e);
    }
  }
  
  if (!selection || selection.isCollapsed || !text || inComposer || !targetsAssistant) {
    console.log("[PromptProfile™] Hiding toolbar - conditions not met", {
      noSelection: !selection,
      isCollapsed: selection?.isCollapsed,
      noText: !text,
      inComposer,
      notAssistant: !targetsAssistant
    });
    hideSelectionToolbar();
    return;
  }
  
  console.log("[PromptProfile™] Showing toolbar - all conditions met");
  const rangeRect = AdapterBase.getSelectionRect(selection);
  if (!rangeRect) {
    hideSelectionToolbar();
    return;
  }

  const toolbar = ensureSelectionToolbar();
  if (!toolbar) {
    console.error("[PromptProfile™] Failed to create selection toolbar");
    return;
  }
  selectionToolbarText = text;
  console.log("[PromptProfile™ Perplexity] Selection toolbar text updated:", {
    textLength: text?.length || 0,
    textPreview: text?.substring(0, 50) || "EMPTY"
  });
  
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
    console.warn("[PromptProfile™] Toolbar has invalid dimensions:", { w, h }, "retrying...");
    // Force another reflow and remeasure
    void toolbar.offsetWidth;
    w = toolbar.offsetWidth;
    h = toolbar.offsetHeight;
    if (!w || !h) {
      console.error("[PromptProfile™] Toolbar dimensions still invalid, cannot position tooltip");
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

function capturePerplexityChatHistory(maxMessages = 20) {
  // Make these logs VERY visible
  console.log("%c[PromptProfile™ Perplexity] ========== capturePerplexityChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Perplexity] ========== capturePerplexityChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Perplexity] ========== capturePerplexityChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[PromptProfile™ Perplexity] Current URL:", window.location.href);
  console.log("[PromptProfile™ Perplexity] Document ready state:", document.readyState);
  console.log("[PromptProfile™ Perplexity] Timestamp:", new Date().toISOString());
  
  // Check if we're on a conversation page
  const isConversationPage = window.location.href.includes("/search") || 
                            window.location.href.includes("/chat") ||
                            document.querySelector("main, [role='main']");
  console.log("[PromptProfile™ Perplexity] Is conversation page:", isConversationPage);
  
  const messages = [];
  
  try {
    // First, try to find the main conversation container
    const mainContainer = document.querySelector("main, [role='main']");
    console.log("[PromptProfile™ Perplexity] Main container found:", !!mainContainer);
    
    // Determine the best search root - prefer main container, then document
    let searchRoot = document;
    if (mainContainer) {
      searchRoot = mainContainer;
      console.log("[PromptProfile™ Perplexity] Using main container as search root");
      console.log("[PromptProfile™ Perplexity] Main container details:", {
        tagName: mainContainer.tagName,
        className: mainContainer.className,
        childCount: mainContainer.children.length,
        innerHTMLLength: mainContainer.innerHTML.length,
        hasText: (mainContainer.innerText || mainContainer.textContent || "").trim().length > 0
      });
    } else {
      console.warn("[PromptProfile™ Perplexity] ⚠️ Main container not found - searching entire document");
    }
    
    // Perplexity-specific selectors - try multiple patterns to handle DOM changes
    const assistantSelectors = [
      "[data-role='assistant']",
      "[data-message-role='assistant']",
      "[data-message-type='assistant']",
      "[role='assistant']",
      "[data-type='assistant']",
      "div[data-role='assistant']",
      "article[data-role='assistant']",
      "[class*='assistant'][class*='message']",
      "[class*='assistant'][class*='turn']",
      "div[class*='assistant-message']",
      "div[class*='assistant-turn']"
    ];
    
    const userSelectors = [
      "[data-role='user']",
      "[data-message-role='user']",
      "[data-message-type='user']",
      "[role='user']",
      "[data-type='user']",
      "div[data-role='user']",
      "article[data-role='user']",
      "[class*='user'][class*='message']",
      "[class*='user'][class*='turn']",
      "div[class*='user-message']",
      "div[class*='user-turn']"
    ];
    
    console.log("[PromptProfile™ Perplexity] Searching for messages with multiple selector strategies");
    
    // Try each selector pattern and combine results
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Perplexity] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Perplexity] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Perplexity] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Perplexity] Selector failed: ${selector}`, e);
      }
    }
    
    console.log("[PromptProfile™ Perplexity] Final element counts after standard selectors:", {
      assistantCount: assistantElements.length,
      userCount: userElements.length,
      totalElements: assistantElements.length + userElements.length
    });
    
    // If no elements found with standard selectors, try searching within main container
    if (assistantElements.length === 0 && userElements.length === 0 && mainContainer) {
      console.warn("[PromptProfile™ Perplexity] ⚠️ No messages found with standard selectors, searching within main container...");
      
      // Look for all divs within main that might be messages
      const allDivsInMain = mainContainer.querySelectorAll("div");
      console.log(`[PromptProfile™ Perplexity] Found ${allDivsInMain.length} divs within main container`);
      
      // Look for message-like structures - Perplexity messages are typically in nested divs
      const potentialMessages = Array.from(allDivsInMain).filter(div => {
        const text = (div.innerText || div.textContent || "").trim();
        // Look for divs with substantial text (likely messages) but not UI elements
        return text.length > 20 && text.length < 50000 && 
               !div.closest("button") && 
               !div.closest("nav") && 
               !div.closest("header") &&
               !div.closest("footer") &&
               !div.closest("aside") &&
               !div.closest("form") &&
               div.children.length > 0;
      });
      
      console.log(`[PromptProfile™ Perplexity] Found ${potentialMessages.length} potential message divs in main`);
      
      // Sort potential messages by their position in the DOM (top to bottom)
      const sortedMessages = potentialMessages.sort((a, b) => {
        const posA = getElementPosition(a);
        const posB = getElementPosition(b);
        return posA - posB;
      });
      
      // Use alternating pattern: Perplexity typically starts with user, then assistant, etc.
      // First message in conversation is usually user
      for (let i = 0; i < sortedMessages.length && (assistantElements.length + userElements.length) < maxMessages * 2; i++) {
        const msg = sortedMessages[i];
        const text = (msg.innerText || msg.textContent || "").trim();
        
        if (text.length > 20) {
          // Check for explicit markers first
          const hasAssistantMarker = msg.querySelector("[class*='assistant']") || 
                                   msg.getAttribute("data-author") === "assistant" ||
                                   msg.closest("[data-message-role='assistant']") ||
                                   msg.className?.includes("assistant") ||
                                   msg.getAttribute("data-role") === "assistant" ||
                                   msg.querySelector("[data-message-role='assistant']");
          
          const hasUserMarker = msg.querySelector("[class*='user']") || 
                              msg.getAttribute("data-author") === "user" ||
                              msg.closest("[data-message-role='user']") ||
                              msg.className?.includes("user") ||
                              msg.getAttribute("data-role") === "user" ||
                              msg.querySelector("[data-message-role='user']");
          
          // If we have clear markers, use them
          if (hasAssistantMarker && assistantElements.length < maxMessages) {
            assistantElements.push(msg);
            console.log(`[PromptProfile™ Perplexity] Added assistant message from main search (${text.substring(0, 50)}...)`);
          } else if (hasUserMarker && userElements.length < maxMessages) {
            userElements.push(msg);
            console.log(`[PromptProfile™ Perplexity] Added user message from main search (${text.substring(0, 50)}...)`);
          } else {
            // No clear markers - use alternating pattern
            // Perplexity conversations typically start with user, then assistant, then user, etc.
            const totalFound = assistantElements.length + userElements.length;
            if (totalFound % 2 === 0 && userElements.length < maxMessages) {
              // Even index (0, 2, 4...) = user message
              userElements.push(msg);
              console.log(`[PromptProfile™ Perplexity] Added user message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            } else if (assistantElements.length < maxMessages) {
              // Odd index (1, 3, 5...) = assistant message
              assistantElements.push(msg);
              console.log(`[PromptProfile™ Perplexity] Added assistant message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            }
          }
        }
      }
      
      console.log(`[PromptProfile™ Perplexity] After main search: ${assistantElements.length} assistant, ${userElements.length} user messages`);
    }
    
    // If still no elements found, try alternative approach with other containers
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[PromptProfile™ Perplexity] ⚠️ Still no messages found, trying broader search...");
      
      // Try finding messages by looking for conversation containers
      const conversationContainers = document.querySelectorAll("main, [role='main'], [class*='conversation'], [class*='chat'], [id*='conversation'], [id*='chat']");
      console.log("[PromptProfile™ Perplexity] Found conversation containers:", conversationContainers.length);
      
      // Log container structure for debugging
      if (conversationContainers.length > 0) {
        const firstContainer = conversationContainers[0];
        console.log("[PromptProfile™ Perplexity] First container structure:", {
          tagName: firstContainer.tagName,
          className: firstContainer.className,
          id: firstContainer.id,
          childCount: firstContainer.children.length,
          innerHTMLPreview: firstContainer.innerHTML.substring(0, 200)
        });
      }
      
      // Look for message-like structures within containers
      for (const container of conversationContainers) {
        const potentialMessages = container.querySelectorAll("div[class*='message'], div[class*='turn'], article, [class*='group'], [class*='item']");
        console.log(`[PromptProfile™ Perplexity] Found ${potentialMessages.length} potential message elements in container`);
        
        // Try to identify role by looking for common patterns
        for (const msg of potentialMessages) {
          const text = (msg.innerText || msg.textContent || "").trim();
          if (text.length > 10) {
            // Heuristic: if it contains common assistant patterns, it's likely assistant
            const isLikelyAssistant = msg.querySelector("[class*='assistant']") || 
                                     msg.getAttribute("data-author") === "assistant" ||
                                     msg.closest("[data-message-role='assistant']") ||
                                     msg.className?.includes("assistant") ||
                                     msg.getAttribute("data-role") === "assistant";
            
            if (isLikelyAssistant && assistantElements.length < maxMessages) {
              assistantElements.push(msg);
              console.log(`[PromptProfile™ Perplexity] Added assistant element from fallback search`);
            } else if (!isLikelyAssistant && userElements.length < maxMessages) {
              userElements.push(msg);
              console.log(`[PromptProfile™ Perplexity] Added user element from fallback search`);
            }
          }
        }
      }
    }
    
    // Last resort: search for any divs with substantial text that might be messages
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[PromptProfile™ Perplexity] ⚠️ Still no messages found, trying last-resort search...");
      const allDivs = document.querySelectorAll("div");
      let foundCount = 0;
      for (const div of allDivs) {
        const text = (div.innerText || div.textContent || "").trim();
        // Look for divs with substantial text (likely messages) but not UI elements
        if (text.length > 50 && text.length < 5000 && 
            !div.closest("button") && 
            !div.closest("nav") && 
            !div.closest("header") &&
            !div.closest("footer") &&
            !div.closest("form") &&
            div.children.length > 0) {
          // Try to determine role from context
          const parent = div.parentElement;
          const hasAssistantMarker = div.className?.includes("assistant") || 
                                    parent?.className?.includes("assistant") ||
                                    div.getAttribute("data-author") === "assistant";
          
          if (hasAssistantMarker && assistantElements.length < maxMessages) {
            assistantElements.push(div);
            foundCount++;
          } else if (userElements.length < maxMessages) {
            userElements.push(div);
            foundCount++;
          }
          
          if (foundCount >= maxMessages * 2) break;
        }
      }
      console.log(`[PromptProfile™ Perplexity] Last-resort search found ${foundCount} potential messages`);
    }
    
    // Combine and sort by DOM position (maintain conversation order)
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
    
    // Sort by position in document (top to bottom)
    allElements.sort((a, b) => a.position - b.position);
    
    console.log("[PromptProfile™ Perplexity] Processing", allElements.length, "message elements");
    
    for (const { el, role } of allElements) {
      if (messages.length >= maxMessages) break;
      
      // Extract content using multiple strategies
      const contentSelectors = [
        "[data-message-content]",
        "[data-testid='message-content']",
        ".markdown",
        ".prose",
        "[class*='markdown']",
        "[class*='prose']",
        "div[class*='text']",
        "div[class*='content']",
        "div[role='textbox']",
        "div[contenteditable='false']"
      ];
      
      let content = null;
      for (const selector of contentSelectors) {
        const contentEl = el.querySelector(selector);
        if (contentEl) {
          const extracted = (contentEl.innerText || contentEl.textContent)?.trim();
          if (extracted && extracted.length > 0) {
            content = extracted;
            console.log(`[PromptProfile™ Perplexity] Extracted content using selector "${selector}": ${content.substring(0, 50)}...`);
            break;
          }
        }
      }
      
      // Fallback: get text from element itself, but filter out UI elements
      if (!content) {
        const textNodes = [];
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (parent && (
                parent.tagName === "BUTTON" ||
                parent.tagName === "INPUT" ||
                parent.closest("button") ||
                parent.closest("input")
              )) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            textNodes.push(text);
          }
        }
        
        if (textNodes.length > 0) {
          content = textNodes.join(" ").trim();
        }
      }
      
      // Final fallback
      if (!content) {
        content = (el.innerText || el.textContent)?.trim();
      }
      
      // Clean and validate content
      if (content) {
        content = content.replace(/\s+/g, " ").trim();
        
        // Filter out very short or UI-only content
        if (content.length > 3 && !/^(copy|regenerate|thumbs up|thumbs down|share|attach)$/i.test(content)) {
          messages.push({
            role: role === 'assistant' ? 'assistant' : 'user',
            content: content,
            timestamp: Date.now()
          });
          console.log(`[PromptProfile™ Perplexity] Added ${role} message (${content.length} chars): ${content.substring(0, 50)}...`);
        } else {
          console.log(`[PromptProfile™ Perplexity] Skipped ${role} message - too short or UI-only: "${content.substring(0, 30)}"`);
        }
      } else {
        console.warn(`[PromptProfile™ Perplexity] Could not extract content from ${role} message element:`, {
          tagName: el.tagName,
          className: el.className,
          hasChildren: el.children.length > 0,
          innerTextLength: (el.innerText || "").length,
          textContentLength: (el.textContent || "").length
        });
      }
    }
    
    console.log(`[PromptProfile™ Perplexity] ✓ Captured ${messages.length} messages from Perplexity conversation`);
    if (messages.length === 0) {
      console.warn("[PromptProfile™ Perplexity] ⚠️ No messages captured - check if conversation elements exist in DOM");
      console.warn("[PromptProfile™ Perplexity] DOM Diagnostic Info:", {
        bodyChildren: document.body?.children?.length || 0,
        mainElements: document.querySelectorAll("main").length,
        articles: document.querySelectorAll("article").length,
        divsWithDataRole: document.querySelectorAll("div[data-role], div[data-author], div[data-message-role]").length,
        allDivs: document.querySelectorAll("div").length,
        sampleDivClasses: Array.from(document.querySelectorAll("div")).slice(0, 10).map(d => d.className).filter(c => c),
        url: window.location.href
      });
      
      // Try one more aggressive search: look for any divs with substantial text that might be messages
      console.warn("[PromptProfile™ Perplexity] Attempting final aggressive search for message-like content...");
      const allTextDivs = Array.from(document.querySelectorAll("div")).filter(div => {
        const text = (div.innerText || div.textContent || "").trim();
        return text.length > 20 && text.length < 10000 && 
               !div.closest("button") && 
               !div.closest("nav") && 
               !div.closest("header") &&
               !div.closest("footer") &&
               !div.closest("aside") &&
               !div.closest("form") &&
               div.children.length > 0;
      });
      
      console.warn(`[PromptProfile™ Perplexity] Found ${allTextDivs.length} potential message divs in final search`);
      if (allTextDivs.length > 0) {
        console.warn("[PromptProfile™ Perplexity] Sample divs found:", allTextDivs.slice(0, 5).map(div => ({
          className: div.className,
          id: div.id,
          textPreview: (div.innerText || div.textContent || "").substring(0, 100),
          dataAttributes: Array.from(div.attributes).filter(attr => attr.name.startsWith("data-")).map(attr => `${attr.name}="${attr.value}"`)
        })));
      }
    }
    return messages;
  } catch (error) {
    console.error("[PromptProfile™ Perplexity] ✗ Error capturing Perplexity chat history:", error);
    console.error("[PromptProfile™ Perplexity] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return [];
  }
}

function getElementPosition(element) {
  let position = 0;
  let node = element;
  while (node) {
    position += node.offsetTop || 0;
    node = node.offsetParent;
  }
  return position;
}

async function submitSelectionToSideChat(text) {
  // Make these logs VERY visible
  console.log("%c[PromptProfile™ Perplexity] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Perplexity] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Perplexity] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[PromptProfile™ Perplexity] Snippet:", snippet?.substring(0, 50));
  console.log("[PromptProfile™ Perplexity] selectionAskInFlight:", selectionAskInFlight);
  
  if (!snippet || selectionAskInFlight) {
    console.log("[PromptProfile™ Perplexity] Exiting early - snippet:", !!snippet, "inFlight:", selectionAskInFlight);
    return;
  }
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from Perplexity conversation for context
    let chatHistory = [];
    console.log("%c[PromptProfile™ Perplexity] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = capturePerplexityChatHistory(20);
      console.log(`%c[PromptProfile™ Perplexity] ✓ Captured ${chatHistory.length} messages from conversation for SideChat context`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      
      // Log sample of captured history for debugging
      if (chatHistory.length > 0) {
        console.log("[PromptProfile™ Perplexity] Sample captured messages:", {
          firstMessage: {
            role: chatHistory[0].role,
            contentPreview: chatHistory[0].content?.substring(0, 50) + "..."
          },
          lastMessage: {
            role: chatHistory[chatHistory.length - 1].role,
            contentPreview: chatHistory[chatHistory.length - 1].content?.substring(0, 50) + "..."
          },
          totalMessages: chatHistory.length
        });
      } else {
        console.warn("[PromptProfile™ Perplexity] ⚠️ capturePerplexityChatHistory returned empty array - no messages found in DOM");
      }
    } catch (error) {
      console.error("[PromptProfile™ Perplexity] ✗ Failed to capture chat history:", error);
      console.error("[PromptProfile™ Perplexity] Error stack:", error.stack);
      // Continue with empty array - better than failing completely
      chatHistory = [];
    }
    
    console.log("[PromptProfile™ Perplexity] ========== SENDING PROMPANION_SIDECHAT_REQUEST ==========");
    console.log("[PromptProfile™ Perplexity] Sending PROMPANION_SIDECHAT_REQUEST with:", {
      textLength: snippet.length,
      textPreview: snippet.substring(0, 50),
      chatHistoryLength: chatHistory.length,
      hasChatHistory: chatHistory.length > 0,
      chatHistorySample: chatHistory.length > 0 ? {
        firstMessage: {
          role: chatHistory[0].role,
          contentPreview: chatHistory[0].content?.substring(0, 50)
        },
        lastMessage: {
          role: chatHistory[chatHistory.length - 1].role,
          contentPreview: chatHistory[chatHistory.length - 1].content?.substring(0, 50)
        }
      } : null
    });

    AdapterBase.sendMessage({ 
      type: "PROMPANION_SIDECHAT_REQUEST", 
      text: snippet,
      chatHistory: chatHistory 
    }, (response) => {
      console.log("[PromptProfile™ Perplexity] ========== PROMPANION_SIDECHAT_REQUEST RESPONSE ==========");
      console.log("[PromptProfile™ Perplexity] Response:", response);
      if (!response?.ok) {
        console.warn("PromptProfile™: sidechat request rejected", response?.reason);
      }
      selectionAskInFlight = false;
    }).catch((error) => {
      console.warn("PromptProfile™: failed to request sidechat from selection", error);
      selectionAskInFlight = false;
    });
  } catch (error) {
    console.error("PromptProfile™ Perplexity: sidechat request threw synchronously", error);
    selectionAskInFlight = false;
  }
}

function handleSelectionToolbarAction(event) {
  event.preventDefault();
  event.stopPropagation();
  const text = selectionToolbarText;
  console.log("%c[PromptProfile™ Perplexity] ========== ELABORATE BUTTON CLICKED ==========", "color: green; font-size: 16px; font-weight: bold;");
  console.log("[PromptProfile™ Perplexity] Selection toolbar text:", {
    textLength: text?.length || 0,
    textPreview: text?.substring(0, 100) || "EMPTY",
    hasText: !!text && text.trim().length > 0
  });
  
  if (!text || !text.trim()) {
    console.error("[PromptProfile™ Perplexity] ERROR: No text selected! Cannot elaborate.");
    return;
  }
  
  hideSelectionToolbar();
  submitSelectionToSideChat(text);
}

// Selection change is now handled by AdapterBase.initSelectionToolbar()
// No need for a separate handler - removed to avoid duplicate listeners

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
      console.warn("PromptProfile™: enhancement request failed", error);
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
  AdapterBase.attachTooltip(button, "Open PromptProfile™ to enhance your prompts for the best response.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("PromptProfile™: failed to open sidebar from Perplexity adapter", e)));
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
  if (!inputNode) return;
  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  floatingButtonTargetInput = inputNode;
  // CRITICAL: Always call positionFloatingButton which will find the correct container
  // Ignore the targetContainer parameter - positionFloatingButton will find the input bar container
  positionFloatingButton(inputNode, null);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer, buttonTargetElement = null) {
  if (!floatingButtonWrapper) {
    console.log("[PromptProfile™ Perplexity] positionFloatingButton: no wrapper");
    return;
  }
  
  // Find the target element using the provided XPath
  const targetXPath = "//*[@id='root']/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[3]";
  let targetElement = buttonTargetElement || findElementByXPath(targetXPath);
  
  // If XPath doesn't work, try alternative strategies
  if (!targetElement && inputNode) {
    // Strategy 1: Walk up from input to find sibling elements that might be the target
    let current = inputNode.parentElement;
    let depth = 0;
    while (current && depth < 15) {
      // Look for div[3] in the structure - the target is typically a sibling or nearby
      const siblings = Array.from(current.children || []);
      // The target might be the 3rd child of a parent div
      if (siblings.length >= 3) {
        const potentialTarget = siblings[2]; // 0-indexed, so [2] is the 3rd child
        if (potentialTarget && potentialTarget.offsetParent) {
          targetElement = potentialTarget;
          console.log("[PromptProfile™ Perplexity] Found target element via sibling search");
          break;
        }
      }
      current = current.parentElement;
      depth++;
    }
  }
  
  // Strategy 2: Try to find elements near the input that match the pattern
  if (!targetElement && inputNode) {
    // Look for elements in the same container as the input
    const inputContainer = inputNode.closest("div[class*='relative'], div[class*='flex'], form");
    if (inputContainer) {
      // Look for div elements that are likely the target (3rd child of a span/div structure)
      const allDivs = inputContainer.querySelectorAll("div");
      for (const div of allDivs) {
        const parent = div.parentElement;
        if (parent && parent.children.length >= 3 && parent.children[2] === div) {
          // This might be div[3] - check if it's positioned to the right of input
          const divRect = div.getBoundingClientRect();
          const inputRect = inputNode.getBoundingClientRect();
          if (divRect.left > inputRect.right && div.offsetParent) {
            targetElement = div;
            console.log("[PromptProfile™ Perplexity] Found target element via pattern matching");
            break;
          }
        }
      }
    }
  }
  
  if (!targetElement) {
    // Check retry count to prevent infinite loops
    if (positionRetryCount >= MAX_POSITION_RETRIES) {
      console.warn("[PromptProfile™ Perplexity] Target element not found after max retries, using fallback positioning");
      positionRetryCount = 0; // Reset for next attempt
      // Use fallback: position relative to input container
      if (inputNode) {
        const container = containerNode && containerNode !== document.body ? containerNode : inputNode.parentElement;
        if (container) {
          const containerStyle = getComputedStyle(container);
          if (containerStyle.position === "static") {
            container.style.position = "relative";
          }
          if (floatingButtonWrapper.parentElement !== container) {
            container.append(floatingButtonWrapper);
          }
          floatingButtonWrapper.style.position = "absolute";
          floatingButtonWrapper.style.top = "50%";
          floatingButtonWrapper.style.right = "12px";
          floatingButtonWrapper.style.transform = "translateY(-50%)";
          floatingButtonWrapper.style.left = "auto";
          floatingButtonWrapper.style.display = "flex";
        }
      }
      return;
    }
    
    positionRetryCount++;
    console.warn(`[PromptProfile™ Perplexity] Target element not found, retrying (${positionRetryCount}/${MAX_POSITION_RETRIES})...`);
    // Retry after a short delay
    if (inputNode && floatingButtonWrapper) {
      setTimeout(() => {
        positionFloatingButton(inputNode, containerNode, null);
      }, 300);
    }
    return;
  }
  
  // Reset retry count on success
  positionRetryCount = 0;
  
  console.log("[PromptProfile™ Perplexity] positionFloatingButton: found target element", {
    tagName: targetElement.tagName,
    className: targetElement.className,
    id: targetElement.id
  });
  
  // Find the input bar container - the one that contains both input and buttons
  // This should be a relatively small container, not the entire chat window
  let inputBarContainer = null;
  
  // Strategy 1: Walk up from target element to find the container that also contains the input
  let current = targetElement.parentElement;
  let depth = 0;
  while (current && depth < 15) {
    // Check if this container contains both the target element and the input
    const containsTarget = current.contains(targetElement);
    const containsInput = inputNode && current.contains(inputNode);
    
    if (containsTarget && containsInput) {
      // This is likely the input bar container
      const style = getComputedStyle(current);
      const hasRelativePosition = style.position === "relative" || style.position === "absolute";
      const hasFlex = style.display === "flex" || style.display === "grid";
      
      if (hasRelativePosition || hasFlex || 
          current.classList.contains("relative") || 
          current.classList.contains("flex")) {
        inputBarContainer = current;
        console.log("[PromptProfile™ Perplexity] Found input bar container via target element walk");
        break;
      }
    }
    current = current.parentElement;
    depth++;
  }
  
  // Strategy 2: Walk up from input to find container that contains buttons
  if (!inputBarContainer && inputNode) {
    current = inputNode.parentElement;
    depth = 0;
    while (current && depth < 15) {
      // Check if this container has buttons (send button, etc.)
      const hasButtons = current.querySelectorAll("button").length > 0;
      const containsInput = current.contains(inputNode);
      
      if (hasButtons && containsInput) {
        const style = getComputedStyle(current);
        const hasRelativePosition = style.position === "relative" || style.position === "absolute";
        const hasFlex = style.display === "flex" || style.display === "grid";
        
        if (hasRelativePosition || hasFlex || 
            current.classList.contains("relative") || 
            current.classList.contains("flex")) {
          inputBarContainer = current;
          console.log("[PromptProfile™ Perplexity] Found input bar container via input walk");
          break;
        }
      }
      current = current.parentElement;
      depth++;
    }
  }
  
  // Fallback: use target element's parent if it's relatively small
  if (!inputBarContainer) {
    const targetParent = targetElement.parentElement;
    if (targetParent) {
      const parentRect = targetParent.getBoundingClientRect();
      // If parent is reasonably sized (not the entire window), use it
      if (parentRect.height < 200 && parentRect.width < 2000) {
        inputBarContainer = targetParent;
        console.log("[PromptProfile™ Perplexity] Using target parent as container (fallback)");
      }
    }
  }
  
  // Final fallback
  if (!inputBarContainer) {
    inputBarContainer = targetElement.parentElement || containerNode || inputNode?.parentElement;
  }
  
  if (!inputBarContainer) {
    console.warn("[PromptProfile™ Perplexity] No container found");
    return;
  }
  
  // Ensure container has relative positioning
  const containerStyle = getComputedStyle(inputBarContainer);
  if (containerStyle.position === "static") {
    inputBarContainer.style.position = "relative";
  }
  
  // Get bounding rects
  const targetRect = targetElement.getBoundingClientRect();
  const containerRect = inputBarContainer.getBoundingClientRect();
  
  // Find the browser button container - it should be the element that contains the target element
  // The target element is div[3], so we want to position 8px to the left of its left edge
  const browserButtonContainer = targetElement;
  const browserContainerRect = browserButtonContainer.getBoundingClientRect();
  
  // Calculate position: 8px to the left of the browser button container's left edge
  const buttonWidth = BUTTON_SIZE.wrapper ? parseInt(BUTTON_SIZE.wrapper.replace("px", "")) : 44;
  const spacingFromBrowserButton = 8; // 8px spacing to the left of browser button
  
  // Calculate the right position: browser button's left edge relative to container's right edge + spacing
  const browserLeftFromContainer = browserContainerRect.left - containerRect.left;
  const rightPosition = containerRect.width - browserLeftFromContainer + spacingFromBrowserButton;
  
  // Calculate vertical alignment: align with the target element's center, not container's center
  const targetCenterY = targetRect.top - containerRect.top + (targetRect.height / 2);
  const buttonHeight = buttonWidth; // Button is square
  const topPosition = targetCenterY - (buttonHeight / 2);
  
  // Move button to container
  if (floatingButtonWrapper.parentElement !== inputBarContainer) {
    inputBarContainer.append(floatingButtonWrapper);
  }
  
  // Apply positioning styles - use top instead of 50% to align with target element
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = `${topPosition}px`;
  floatingButtonWrapper.style.right = `${rightPosition}px`;
  floatingButtonWrapper.style.transform = "none"; // No transform needed since we're using exact top position
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.margin = "0";
  floatingButtonWrapper.style.display = "flex";
  floatingButtonWrapper.style.visibility = "visible";
  floatingButtonWrapper.style.opacity = "1";
  
  // Also schedule for next frame to ensure positioning persists
  requestAnimationFrame(() => {
    if (!floatingButtonWrapper || !inputBarContainer || !targetElement) return;
    
    // Force move again in case something moved it
    if (floatingButtonWrapper.parentElement !== inputBarContainer) {
      inputBarContainer.append(floatingButtonWrapper);
    }
    
    // Recalculate in case container moved
    const targetRect2 = targetElement.getBoundingClientRect();
    const containerRect2 = inputBarContainer.getBoundingClientRect();
    const browserContainerRect2 = browserButtonContainer.getBoundingClientRect();
    const browserLeftFromContainer2 = browserContainerRect2.left - containerRect2.left;
    const rightPosition2 = containerRect2.width - browserLeftFromContainer2 + spacingFromBrowserButton;
    const targetCenterY2 = targetRect2.top - containerRect2.top + (targetRect2.height / 2);
    const topPosition2 = targetCenterY2 - (buttonHeight / 2);
    
    // Force apply styles again
    floatingButtonWrapper.style.position = "absolute";
    floatingButtonWrapper.style.top = `${topPosition2}px`;
    floatingButtonWrapper.style.right = `${rightPosition2}px`;
    floatingButtonWrapper.style.transform = "none";
    floatingButtonWrapper.style.left = "auto";
    floatingButtonWrapper.style.bottom = "auto";
    floatingButtonWrapper.style.margin = "0";
  });
  
  console.log("[PromptProfile™ Perplexity] Button positioned 8px to the left of browser button:", {
    targetRect: { left: targetRect.left, right: targetRect.right, top: targetRect.top, width: targetRect.width, height: targetRect.height },
    browserContainerRect: { left: browserContainerRect.left, right: browserContainerRect.right, top: browserContainerRect.top, width: browserContainerRect.width, height: browserContainerRect.height },
    containerRect: { left: containerRect.left, right: containerRect.right, top: containerRect.top, width: containerRect.width, height: containerRect.height },
    browserLeftFromContainer,
    rightPosition,
    spacingFromBrowserButton,
    buttonWidth,
    topPosition
  });
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    // Find the target element again using XPath
    positionFloatingButton(floatingButtonTargetInput, null, null);
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
    console.error("[PromptProfile™] XPath evaluation failed:", e);
    return null;
  }
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  const observer = new MutationObserver(() => {
    requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
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
    console.log("[PromptProfile™] locateComposer: input not found");
    return null;
  }
  
  console.log("[PromptProfile™] locateComposer: found input", input.id, input.className);
  
  // Find target element for button placement using XPath
  // Target: //*[@id="root"]/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[3]
  const targetXPath = "//*[@id='root']/div[1]/div/div/div[2]/div/div[1]/div[1]/div/div[3]/div/div/div[2]/div/div/div/span/div/div[1]/div/div[3]";
  let buttonTargetElement = findElementByXPath(targetXPath);
  
  console.log("[PromptProfile™] locateComposer: button target element", buttonTargetElement);
  
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
        console.log("[PromptProfile™] locateComposer: found container from target element", container.tagName, container.className);
        break;
      }
      current = current.parentElement;
      depth++;
    }
    
    // If no suitable container found, use the target element's parent
    if (!container) {
      container = buttonTargetElement.parentElement;
      console.log("[PromptProfile™] locateComposer: using target element's parent as container", container?.tagName);
    }
  }
  
  // Fallback: use the old method if target element not found
  if (!container) {
    console.log("[PromptProfile™] locateComposer: target element not found, using fallback");
    let current = input.parentElement;
    let depth = 0;
    while (current && depth < 10) {
      const style = getComputedStyle(current);
      const hasRelativePosition = style.position === "relative";
      const hasWFullClass = current.classList.contains("w-full");
      const hasRelativeClass = current.classList.contains("relative");
      
      if (hasRelativePosition || hasWFullClass || hasRelativeClass) {
        container = current;
        console.log("[PromptProfile™] locateComposer: found container (fallback)", container.className);
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
      console.log("[PromptProfile™] locateComposer: set container position to relative");
    }
  }
  
  return { input, container, buttonTargetElement };
}

function init() {
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  requestSelectionToolbarUpdate();
  if (composer) {
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
    console.log("[PromptProfile™] ========== INSERT TEXT REQUEST ==========");
    console.log("[PromptProfile™] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    console.log("[PromptProfile™] Text length:", textToInsert.length);
    
    if (!textToInsert) {
      console.log("[PromptProfile™] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[PromptProfile™] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[PromptProfile™] Composer node found:", composerNode);
    console.log("[PromptProfile™] Node type:", composerNode?.constructor?.name);
    console.log("[PromptProfile™] Node isContentEditable:", composerNode?.isContentEditable);
    console.log("[PromptProfile™] Node tagName:", composerNode?.tagName);
    console.log("[PromptProfile™] Node className:", composerNode?.className);
    console.log("[PromptProfile™] Node visible:", composerNode ? (composerNode.offsetParent !== null) : false);
    console.log("[PromptProfile™] Node current value:", composerNode ? (composerNode.value || composerNode.textContent || "").substring(0, 50) : "");
    
    if (!composerNode) {
      console.log("[PromptProfile™] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[PromptProfile™] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[PromptProfile™] setComposerText returned:", success);
    
    // Verify insertion
    const currentValue = composerNode.value || composerNode.textContent || "";
    const textInserted = currentValue.includes(textToInsert.substring(0, Math.min(20, textToInsert.length)));
    console.log("[PromptProfile™] Verification - text appears in node:", textInserted);
    console.log("[PromptProfile™] Current node value:", currentValue.substring(0, 100));
    
    if (success && textInserted) {
      console.log("[PromptProfile™] Insert succeeded!");
      sendResponse({ ok: true });
    } else if (success && !textInserted) {
      console.warn("[PromptProfile™] setComposerText returned true but text not verified in node");
      sendResponse({ ok: false, reason: "INSERTION_NOT_VERIFIED" });
    } else {
      console.log("[PromptProfile™] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false; // sendResponse called synchronously, close channel
  } catch (error) {
    console.error("[PromptProfile™] Insert text handler failed", error);
    console.error("[PromptProfile™] Error stack:", error.stack);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false; // sendResponse called synchronously, close channel
  }
}

// Register message handler using AdapterBase (must be after handleInsertTextMessage is defined)
console.log("[PromptProfile™] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
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
    console.log("[PromptProfile™] Creating enhance tooltip element");
    enhanceTooltipElement = document.createElement("div");
    enhanceTooltipElement.className = "promptprofile-enhance-tooltip";
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
    console.log("[PromptProfile™] Attaching click handler to Refine button");
    console.log("[PromptProfile™] handleRefineButtonClick function exists:", typeof handleRefineButtonClick);
    action.addEventListener("click", handleRefineButtonClick);
    console.log("[PromptProfile™] Click handler attached, button:", action);
    enhanceTooltipElement.append(dismiss, action);
    console.log("[PromptProfile™] Enhance tooltip element created");
  }
  if (!enhanceTooltipElement.isConnected) {
    console.log("[PromptProfile™] Appending enhance tooltip to body");
    document.body.append(enhanceTooltipElement);
  }
  hideEnhanceTooltip();
}

function handleRefineButtonClick(e) {
  console.log("[PromptProfile™] ========== REFINE BUTTON HANDLER FIRED ==========");
  console.log("[PromptProfile™] Event type:", e.type);
  console.log("[PromptProfile™] Event target:", e.target);
  e.preventDefault();
  e.stopPropagation();
  if (enhanceActionInFlight) {
    return;
  }
  const composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  console.log("[PromptProfile™] Composer node:", composerNode);
  if (!composerNode) {
    console.error("[PromptProfile™] No composer node found!");
    return;
  }
  const promptText = extractInputText().trim();
  console.log("[PromptProfile™] Prompt text:", promptText);
  if (!promptText) {
    return;
  }
  enhanceActionInFlight = true;
  enhanceTooltipDismissed = true;
  hideEnhanceTooltip();
  console.log("[PromptProfile™] Requesting prompt enhancement...");
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
      console.error("PromptProfile™: refine request threw", error);
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
  console.log("[PromptProfile™] ========== BACKUP MESSAGE LISTENER REGISTRATION ==========");
  console.log("[PromptProfile™] Current time:", new Date().toISOString());
  
  if (typeof chrome === "undefined") {
    console.error("[PromptProfile™] chrome is undefined in backup registration");
    return;
  }
  
  if (!chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[PromptProfile™] chrome.runtime.onMessage not available in backup registration");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message && message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[PromptProfile™] BACKUP LISTENER: PROMPANION_INSERT_TEXT received!");
        if (typeof handleInsertTextMessage === "function") {
          handleInsertTextMessage(message, sender, sendResponse);
        } else {
          console.error("[PromptProfile™] handleInsertTextMessage is not a function!");
          sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        }
        return true;
      }
      return false;
    });
    console.log("[PromptProfile™] ✓ Backup listener registered successfully");
  } catch (error) {
    console.error("[PromptProfile™] ✗ Backup listener registration failed:", error);
  }
})();

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}

// Selection change is handled by AdapterBase.initSelectionToolbar()
// Scroll and resize listeners removed to avoid performance issues
// AdapterBase will handle selection changes efficiently

// Verify message listener is registered
console.log("[PromptProfile™] ========== VERIFYING MESSAGE LISTENER ==========");
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  console.log("[PromptProfile™] chrome.runtime.onMessage is available");
  console.log("[PromptProfile™] chrome.runtime.id:", chrome.runtime.id);
  console.log("[PromptProfile™] chrome.runtime.getURL:", typeof chrome.runtime.getURL);
} else {
  console.error("[PromptProfile™] chrome.runtime.onMessage is NOT available at this point!");
}

window.addEventListener("promptprofile-panel-resize", () => {
  refreshFloatingButtonPosition();
});

document.addEventListener("mousedown", (e) => {
  if (enhanceTooltipElement?.classList.contains("is-visible")) {
    const button = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__action");
    const clickedButton = e.target.closest(".promptprofile-enhance-tooltip__action");
    if (clickedButton || button === e.target) {
      console.log("[PromptProfile™] ========== MOUSEDOWN DETECTED ON BUTTON ==========");
      console.log("[PromptProfile™] Setting tooltipClickInProgress flag");
      tooltipClickInProgress = true;
      const buttonRef = button;
      const mousedownTime = Date.now();
      
      const clickHandler = (clickEvent) => {
        const timeSinceMousedown = Date.now() - mousedownTime;
        console.log("[PromptProfile™] ========== CLICK AFTER MOUSEDOWN (direct handler) ==========");
        console.log("[PromptProfile™] Time since mousedown:", timeSinceMousedown, "ms");
        console.log("[PromptProfile™] Click target:", clickEvent.target);
        if (typeof handleRefineButtonClick === "function") {
          handleRefineButtonClick(clickEvent);
        }
        document.removeEventListener("click", clickHandler, true);
      };
      
      document.addEventListener("click", clickHandler, true);
      
      setTimeout(() => {
        tooltipClickInProgress = false;
        console.log("[PromptProfile™] tooltipClickInProgress flag cleared");
        document.removeEventListener("click", clickHandler, true);
      }, 300);
    }
  }
}, true);


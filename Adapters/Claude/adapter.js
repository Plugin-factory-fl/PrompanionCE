// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™] ========== CLAUDE ADAPTER LOADING ==========");
console.log("[PromptProfile™] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™] Location:", window.location.href);

// CRITICAL: Fix Claude's accessibility bug IMMEDIATELY, before anything else runs
// This must run before Claude's code can set aria-hidden on fieldsets
(function() {
  const originalSetAttribute = Element.prototype.setAttribute;
  const originalSetAttributeNode = Element.prototype.setAttributeNode;
  
  // Intercept setAttribute
  Element.prototype.setAttribute = function(name, value) {
    if (name === 'aria-hidden' && value === 'true' && this.tagName === 'FIELDSET') {
      const hasFocusable = this.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
      if (hasFocusable) {
        // Silently prevent the attribute from being set
        return;
      }
    }
    return originalSetAttribute.call(this, name, value);
  };
  
  // Also intercept setAttributeNode (less common but some libraries use it)
  Element.prototype.setAttributeNode = function(attr) {
    if (attr.name === 'aria-hidden' && attr.value === 'true' && this.tagName === 'FIELDSET') {
      const hasFocusable = this.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
      if (hasFocusable) {
        // Return the attribute node but don't actually set it
        return attr;
      }
    }
    return originalSetAttributeNode.call(this, attr);
  };
  
  // Also intercept direct property access (element.ariaHidden = true)
  const fieldsetProto = HTMLFieldSetElement.prototype;
  const originalAriaHiddenDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'ariaHidden') || 
                                       Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'ariaHidden');
  
  if (originalAriaHiddenDescriptor) {
    Object.defineProperty(HTMLFieldSetElement.prototype, 'ariaHidden', {
      get: originalAriaHiddenDescriptor.get,
      set: function(value) {
        if (value === 'true' || value === true) {
          const hasFocusable = this.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
          if (hasFocusable) {
            // Don't set it
            return;
          }
        }
        return originalAriaHiddenDescriptor.set.call(this, value);
      },
      configurable: true,
      enumerable: true
    });
  }
  
  console.log("[PromptProfile™] Installed early aria-hidden prevention for Claude accessibility bug");
})();

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

const BUTTON_ID = "promptprofile-claude-trigger";
const BUTTON_CLASS = "promptprofile-claude-trigger";
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const HIGHLIGHT_BUTTON_SELECTORS = [
  // Claude-specific selectors for highlight/select buttons (if they exist)
  "button[aria-label*='Ask']",
  "button[aria-label*='ask']"
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

// Evaluation variables
let realTimeEvaluationEnabled = false;
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
  
  // Claude uses different structure - look for assistant message containers
  // Common patterns: data-role, role attributes, or specific class patterns
  const checks = [
    element.closest("[data-role='assistant']"),
    element.closest("[role='article']")?.querySelector("[data-role='assistant']"),
    element.closest("article")?.querySelector("[data-role='assistant']"),
    element.closest("div[data-testid*='message']")?.querySelector("[data-role='assistant']"),
    // Fallback: check if parent has assistant-related attributes
    element.closest("div")?.getAttribute("data-role") === "assistant" ? element.closest("div") : null
  ];
  
  // Additional Claude-specific selectors
  const claudeChecks = [
    element.closest("article[data-role='assistant']"),
    element.closest("[class*='assistant'][class*='message']"),
    element.closest("[class*='Message'][class*='assistant']"),
    // Check for Claude's message structure - look for article or div with assistant indicators
    (() => {
      const article = element.closest("article");
      if (article) {
        // Check if article contains assistant content indicators
        const hasAssistantContent = article.querySelector("[data-role='assistant']") ||
                                   article.getAttribute("data-role") === "assistant" ||
                                   article.className?.includes("assistant") ||
                                   article.querySelector("div[class*='assistant']");
        if (hasAssistantContent) return article;
      }
      return null;
    })()
  ];
  
  const allChecks = [...checks, ...claudeChecks];
  const found = allChecks.find(check => check !== null && check !== false);
  
  if (found) {
    console.log("[PromptProfile™] nodeInAssistantMessage: Found assistant message", {
      element: element.tagName,
      className: element.className,
      closestMatch: found.tagName,
      closestClassName: found.className,
      closestDataRole: found.getAttribute("data-role")
    });
    return true;
  }
  
  return false;
}

function selectionTargetsAssistant(selection) {
  if (!selection) {
    console.log("[PromptProfile™] selectionTargetsAssistant: No selection");
    return false;
  }
  
  const anchorInAssistant = nodeInAssistantMessage(selection.anchorNode);
  const focusInAssistant = nodeInAssistantMessage(selection.focusNode);
  
  console.log("[PromptProfile™] selectionTargetsAssistant check:", {
    anchorInAssistant,
    focusInAssistant,
    anchorNode: selection.anchorNode?.nodeName,
    focusNode: selection.focusNode?.nodeName,
    isCollapsed: selection.isCollapsed,
    rangeCount: selection.rangeCount
  });
  
  if (anchorInAssistant || focusInAssistant) {
    console.log("[PromptProfile™] selectionTargetsAssistant: ✓ Found in anchor/focus nodes");
    return true;
  }
  
  try {
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      const commonAncestorInAssistant = nodeInAssistantMessage(range.commonAncestorContainer);
      console.log("[PromptProfile™] selectionTargetsAssistant commonAncestor check:", {
        commonAncestorInAssistant,
        commonAncestorNode: range.commonAncestorContainer?.nodeName
      });
      return commonAncestorInAssistant;
    }
  } catch (error) {
    console.warn("[PromptProfile™] selectionTargetsAssistant error:", error);
  }
  
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
  return !!(
    element.closest("[data-testid='chat-input']") ||
    element.closest(".tiptap.ProseMirror[contenteditable='true']") ||
    element.closest("fieldset")?.querySelector("[data-testid='chat-input']") ||
    element.closest("div[role='textbox'][contenteditable='true']")
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
  // Explicitly set role to toolbar to prevent being interpreted as a dialog
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Text selection actions");
  
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
  // Use AdapterBase's method (it will handle initialization check internally)
  AdapterBase.requestSelectionToolbarUpdate();
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
    targetsAssistant
  });
  
  // Debug: Log DOM structure when selection exists
  if (selection && !selection.isCollapsed && text) {
    try {
      const range = selection.getRangeAt(0);
      const anchorElement = AdapterBase.getElementFromNode(selection.anchorNode);
      const focusElement = AdapterBase.getElementFromNode(selection.focusNode);
      const commonAncestor = AdapterBase.getElementFromNode(range.commonAncestorContainer);
      
      console.log("[PromptProfile™] Selection DOM structure:", {
        anchorElement: anchorElement ? {
          tagName: anchorElement.tagName,
          className: anchorElement.className,
          id: anchorElement.id,
          dataRole: anchorElement.getAttribute("data-role"),
          closestArticle: anchorElement.closest("article")?.className,
          closestDiv: anchorElement.closest("div")?.className?.substring(0, 50)
        } : null,
        focusElement: focusElement ? {
          tagName: focusElement.tagName,
          className: focusElement.className,
          dataRole: focusElement.getAttribute("data-role")
        } : null,
        commonAncestor: commonAncestor ? {
          tagName: commonAncestor.tagName,
          className: commonAncestor.className,
          dataRole: commonAncestor.getAttribute("data-role"),
          id: commonAncestor.id
        } : null
      });
    } catch (error) {
      console.warn("[PromptProfile™] Error inspecting selection DOM:", error);
    }
  }
  
  if (!selection || selection.isCollapsed || !text || selectionWithinComposer(selection) || 
      !selectionTargetsAssistant(selection)) {
    console.log("[PromptProfile™] Hiding toolbar - conditions not met", {
      noSelection: !selection,
      isCollapsed: selection?.isCollapsed,
      noText: !text,
      inComposer,
      notTargetsAssistant: !targetsAssistant
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
  
  // Position tooltip BELOW the selection to avoid conflict with Claude's native UI
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

function captureClaudeChatHistory(maxMessages = 20) {
  console.log("%c[PromptProfile™ Claude] ========== captureClaudeChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[PromptProfile™ Claude] Current URL:", window.location.href);
  
  const messages = [];
  
  try {
    // Claude-specific selectors
    const assistantSelectors = [
      "[data-role='assistant']",
      "[role='article'][data-role='assistant']",
      "div[data-role='assistant']",
      "article[data-role='assistant']",
      "[class*='assistant'][class*='message']"
    ];
    
    const userSelectors = [
      "[data-role='user']",
      "[role='article'][data-role='user']",
      "div[data-role='user']",
      "article[data-role='user']",
      "[class*='user'][class*='message']"
    ];
    
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Claude] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break;
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Claude] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Claude] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break;
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Claude] Selector failed: ${selector}`, e);
      }
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
      if (content && content.length > 3) {
        messages.push({
          role: role === 'assistant' ? 'assistant' : 'user',
          content: content.replace(/\s+/g, " ").trim(),
          timestamp: Date.now()
        });
      }
    }
    
    console.log(`[PromptProfile™ Claude] ✓ Captured ${messages.length} messages from Claude conversation`);
    return messages;
  } catch (error) {
    console.error("[PromptProfile™ Claude] ✗ Error capturing Claude chat history:", error);
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

function submitSelectionToSideChat(text) {
  console.log("%c[PromptProfile™ Claude] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[PromptProfile™ Claude] Snippet:", snippet?.substring(0, 50));
  
  if (!snippet || selectionAskInFlight) {
    console.log("[PromptProfile™ Claude] Exiting early - snippet:", !!snippet, "inFlight:", selectionAskInFlight);
    return;
  }
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from Claude conversation for context
    let chatHistory = [];
    console.log("%c[PromptProfile™ Claude] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureClaudeChatHistory(20);
      console.log(`%c[PromptProfile™ Claude] ✓ Captured ${chatHistory.length} messages`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      if (chatHistory.length === 0) {
        console.warn("[PromptProfile™ Claude] ⚠️ No messages found in DOM");
      }
    } catch (error) {
      console.error("[PromptProfile™ Claude] ✗ Failed to capture chat history:", error);
      chatHistory = [];
    }
    
    console.log("%c[PromptProfile™ Claude] Sending PROMPANION_SIDECHAT_REQUEST", "color: purple; font-size: 14px; font-weight: bold;");
    console.log("[PromptProfile™ Claude] Request details:", {
      textLength: snippet.length,
      chatHistoryLength: chatHistory.length
    });

    AdapterBase.sendMessage({ 
      type: "PROMPANION_SIDECHAT_REQUEST", 
      text: snippet,
      chatHistory: chatHistory 
    }, (response) => {
      if (!response?.ok) {
        console.warn("PromptProfile™: sidechat request rejected", response?.reason);
      }
      selectionAskInFlight = false;
    }).catch((error) => {
      console.warn("PromptProfile™: failed to request sidechat from selection", error);
      selectionAskInFlight = false;
    });
  } catch (error) {
    console.error("PromptProfile™: sidechat request threw synchronously", error);
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

  // Last resort: query for common selectors (prioritize Claude-specific)
  const selectors = [
    "[data-testid='chat-input'][contenteditable='true']",
    ".tiptap.ProseMirror[contenteditable='true']",
    "div[contenteditable='true'][role='textbox'][aria-label*='Claude']",
    "[contenteditable='true'][role='textbox']",
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
// This wrapper maintains Claude-specific logging
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
    .catch((e) => console.error("PromptProfile™: failed to open sidebar from Claude adapter", e)));
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

function placeButton(targetContainer, inputNode) {
  if (!inputNode) return;
  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  floatingButtonTargetInput = inputNode;
  positionFloatingButton(inputNode, floatingButtonTargetContainer);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  if (!floatingButtonWrapper) return;
  const target = containerNode ?? inputNode;
  if (!target) return;
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }
  if (floatingButtonWrapper.parentElement !== target) {
    target.append(floatingButtonWrapper);
  }
  floatingButtonWrapper.style.top = "50%";
  floatingButtonWrapper.style.right = "12px";
  floatingButtonWrapper.style.transform = "translateY(-50%)";
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    positionFloatingButton(floatingButtonTargetInput, floatingButtonTargetContainer);
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
  // Claude-specific selectors for composer based on actual DOM structure
  // Primary selector: [data-testid="chat-input"] which is the contenteditable div
  let input = document.querySelector("[data-testid='chat-input'][contenteditable='true']") ??
              document.querySelector(".tiptap.ProseMirror[contenteditable='true']") ??
              document.querySelector("div[contenteditable='true'][role='textbox'][aria-label*='Claude']");
  
  // If not found, try finding via fieldset wrapper
  if (!input) {
    const fieldset = document.querySelector("fieldset.flex.w-full");
    if (fieldset) {
      input = fieldset.querySelector("[data-testid='chat-input']") ??
              fieldset.querySelector(".tiptap.ProseMirror[contenteditable='true']") ??
              fieldset.querySelector("div[contenteditable='true'][role='textbox']");
    }
  }
  
  // Fallback: try direct queries
  if (!input) {
    const directSelectors = [
      "[data-testid='chat-input']",
      ".tiptap.ProseMirror[contenteditable='true']",
      "div[contenteditable='true'][role='textbox']"
    ];
    for (const selector of directSelectors) {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement) {
        input = element;
        break;
      }
    }
  }
  
  if (!input) return null;
  
  // Find the container - prefer fieldset, then the box-content div, then parent
  const container = input.closest("fieldset") ??
                    input.closest("div.box-content") ??
                    input.closest("div.mx-auto") ??
                    input.parentElement ?? 
                    document.body;
  
  return { input, container };
}

/**
 * Workaround for Claude's accessibility bug: prevents aria-hidden from being set on fieldsets
 * that contain focusable elements (like textareas)
 */
function fixAriaHiddenOnFieldsets() {
  // Store original setAttribute to intercept calls
  const originalSetAttribute = Element.prototype.setAttribute;
  
  // Override setAttribute to prevent aria-hidden on fieldsets with focusable children
  Element.prototype.setAttribute = function(name, value) {
    if (name === 'aria-hidden' && value === 'true' && this.tagName === 'FIELDSET') {
      const hasFocusable = this.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
      if (hasFocusable) {
        console.warn("[PromptProfile™] Preventing aria-hidden from being set on fieldset containing focusable element (Claude accessibility bug workaround)");
        // Don't set the attribute - just return
        return;
      }
    }
    return originalSetAttribute.call(this, name, value);
  };
  
  // Also watch for attribute changes and remove immediately if set (backup in case setAttribute override doesn't catch it)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
        const target = mutation.target;
        if (target instanceof HTMLElement && target.tagName === 'FIELDSET') {
          const hasFocusable = target.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
          if (hasFocusable && target.getAttribute('aria-hidden') === 'true') {
            // Remove immediately and also in next frame to catch any race conditions
            target.removeAttribute('aria-hidden');
            requestAnimationFrame(() => {
              if (target.getAttribute('aria-hidden') === 'true') {
                target.removeAttribute('aria-hidden');
              }
            });
          }
        }
      }
    });
  });

  // Observe all fieldsets in the document
  const observeFieldsets = () => {
    const fieldsets = document.querySelectorAll('fieldset');
    fieldsets.forEach((fieldset) => {
      observer.observe(fieldset, {
        attributes: true,
        attributeFilter: ['aria-hidden']
      });
      
      // Also check and fix immediately if aria-hidden is already set
      const hasFocusable = fieldset.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
      if (hasFocusable && fieldset.getAttribute('aria-hidden') === 'true') {
        fieldset.removeAttribute('aria-hidden');
      }
    });
  };

  observeFieldsets();

  // Also observe for new fieldsets added to the DOM
  const bodyObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          const fieldsets = node.tagName === 'FIELDSET' ? [node] : node.querySelectorAll('fieldset');
          fieldsets.forEach((fieldset) => {
            observer.observe(fieldset, {
              attributes: true,
              attributeFilter: ['aria-hidden']
            });
            
            const hasFocusable = fieldset.querySelector('textarea, input, [contenteditable="true"], button, [tabindex]:not([tabindex="-1"])');
            if (hasFocusable && fieldset.getAttribute('aria-hidden') === 'true') {
              fieldset.removeAttribute('aria-hidden');
            }
          });
        }
      });
    });
  });

  if (document.body) {
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Re-observe fieldsets periodically in case new ones are added
  const intervalId = setInterval(observeFieldsets, 2000);

  return { observer, bodyObserver, originalSetAttribute, intervalId };
}

let ariaHiddenFixObservers = null;

function init() {
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  // Initialize selection toolbar with Claude-specific logic
  AdapterBase.initSelectionToolbar({
    buttonText: "Elaborate",
    toolbarId: SELECTION_TOOLBAR_ID,
    visibleClass: SELECTION_TOOLBAR_VISIBLE_CLASS,
    shouldShowToolbar: (selection) => {
      if (!selection || selection.isCollapsed) return false;
      const text = selection.toString().trim();
      if (!text) return false;
      // Don't show if selection is in composer
      if (selectionWithinComposer(selection)) return false;
      // Only show if selection targets assistant messages
      return selectionTargetsAssistant(selection);
    },
    onAction: (text) => {
      submitSelectionToSideChat(text);
    }
  });
  
  const composer = locateComposer();
  requestSelectionToolbarUpdate();
  
  // Fix Claude's accessibility bug with aria-hidden on fieldsets
  if (!ariaHiddenFixObservers) {
    ariaHiddenFixObservers = fixAriaHiddenOnFieldsets();
  }
  
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
  detachTooltipResizeHandler();
}

function ensureEnhanceTooltipElement() {
  if (!enhanceTooltipElement) {
    console.log("[PromptProfile™] Creating enhance tooltip element");
    enhanceTooltipElement = document.createElement("div");
    enhanceTooltipElement.className = "promptprofile-enhance-tooltip";
    // Explicitly set role to tooltip to prevent being interpreted as a dialog
    enhanceTooltipElement.setAttribute("role", "tooltip");
    enhanceTooltipElement.setAttribute("aria-live", "polite");
    enhanceTooltipElement.setAttribute("aria-atomic", "true");
    
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
    buttonRow.append(dismiss, action);
    
    enhanceTooltipElement.append(evaluationSection, buttonRow);
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
  
  // Don't handle clicks on upgrade button - let the upgrade handler deal with it
  const target = e.target;
  if (target && (target.classList.contains("promptprofile-enhance-tooltip__upgrade") || 
                  target.closest(".promptprofile-enhance-tooltip__upgrade"))) {
    console.log("[PromptProfile™] Upgrade button clicked, ignoring refine handler");
    return;
  }
  
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
  
  // Save current prompt version before refining
  AdapterBase.savePromptVersion(composerNode, promptText);
  
  enhanceActionInFlight = true;
  // Don't hide tooltip yet - wait to see if there's a limit error
  console.log("[PromptProfile™] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        if (result?.reason === "EXTENSION_CONTEXT_INVALIDATED") {
          console.error("[PromptProfile™ Claude] Cannot enhance prompt - extension context invalidated. Please reload the page.");
          enhanceTooltipDismissed = true;
          hideEnhanceTooltip();
        } else if (result?.error === "LIMIT_REACHED") {
          // Show upgrade button in tooltip instead of hiding
          console.log("[PromptProfile™] Limit reached, showing upgrade button");
          showUpgradeButtonInTooltip();
        } else {
          // Other errors - hide tooltip normally
          enhanceTooltipDismissed = true;
          hideEnhanceTooltip();
        }
        return;
      }
      // Success - hide tooltip and set text
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
      console.error("PromptProfile™: refine request threw", error);
      enhanceActionInFlight = false;
    });
}

function bindInputEvents(input) {
  console.log("[PromptProfile™] bindInputEvents called for input:", input);
  input.removeEventListener("input", handleInputChange);
  input.removeEventListener("keyup", handleInputChange);
  input.removeEventListener("focus", handleInputChange);
  input.removeEventListener("blur", handleInputBlur);
  input.addEventListener("input", handleInputChange);
  input.addEventListener("keyup", handleInputChange);
  input.addEventListener("focus", handleInputChange);
  input.addEventListener("blur", handleInputBlur);
  console.log("[PromptProfile™] Input events bound, calling handleInputChange()");
  handleInputChange();
}

function extractInputText() {
  if (!enhanceTooltipActiveTextarea) return "";
  return "value" in enhanceTooltipActiveTextarea
    ? enhanceTooltipActiveTextarea.value
    : enhanceTooltipActiveTextarea.textContent ?? "";
}

function handleInputChange() {
  console.log("[PromptProfile™] handleInputChange called, enhanceTooltipActiveTextarea:", enhanceTooltipActiveTextarea);
  if (!enhanceTooltipActiveTextarea) {
    console.log("[PromptProfile™] No active textarea, returning");
    return;
  }
  const rawText = extractInputText();
  const text = rawText.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  console.log("[PromptProfile™] Input text length:", text.length, "word count:", wordCount);
  if (wordCount < 3) {
    console.log("[PromptProfile™] Word count < 3, hiding tooltip");
    hideEnhanceTooltip();
    enhanceTooltipDismissed = false;
    clearTimeout(enhanceTooltipTimer);
    enhanceTooltipTimer = null;
    lastEnhanceTextSnapshot = "";
    return;
  }
  if (enhanceTooltipDismissed && text === lastEnhanceTextSnapshot) {
    console.log("[PromptProfile™] Tooltip dismissed and text unchanged, returning");
    return;
  }
  lastEnhanceTextSnapshot = text;
  enhanceTooltipDismissed = false;
  console.log("[PromptProfile™] Scheduling enhance tooltip");
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

function showUpgradeButtonInTooltip() {
  // Ensure tooltip element exists and is visible
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
  }
  if (!enhanceTooltipElement) {
    console.error("[PromptProfile™ Claude] Cannot show upgrade button - tooltip element not found");
    return;
  }
  
  // Make sure tooltip is visible first
  if (!enhanceTooltipElement.classList.contains("is-visible")) {
    enhanceTooltipElement.classList.add("is-visible");
    positionEnhanceTooltip();
    attachTooltipResizeHandler();
  }
  
  // Remove existing dismiss button if it exists (we'll add a new one)
  const oldDismiss = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__dismiss");
  if (oldDismiss) {
    oldDismiss.remove();
  }
  
  // Add dismiss button (X) for closing the upgrade tooltip
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
  
  // Change action button to upgrade button
  const action = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__action");
  if (action) {
    // Create a completely new button instead of cloning to avoid old event listeners
    const newAction = document.createElement("button");
    newAction.type = "button";
    newAction.className = "promptprofile-enhance-tooltip__action promptprofile-enhance-tooltip__upgrade";
    AdapterBase.setButtonTextContent(newAction, "Upgrade for more uses!");
    
    // Add upgrade click handler - use capture phase to run before other handlers
    newAction.addEventListener("click", async (e) => {
      console.log("[PromptProfile™ Claude] Upgrade button clicked, calling handleStripeCheckout");
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation(); // Prevent other handlers from running
      await AdapterBase.handleStripeCheckout(newAction);
    }, true); // Use capture phase to ensure it runs first
    
    // Replace the old button with the new one
    action.replaceWith(newAction);
    
    // Insert dismiss button before the upgrade button
    newAction.parentNode.insertBefore(dismiss, newAction);
  } else {
    // If no action button exists, just add the dismiss button
    enhanceTooltipElement.appendChild(dismiss);
  }
  
  // Add class to prevent auto-hide
  enhanceTooltipElement.classList.add("show-upgrade");
  enhanceTooltipDismissed = false; // Reset dismissed flag so tooltip stays visible
}

function scheduleEnhanceTooltip() {
  console.log("[PromptProfile™] scheduleEnhanceTooltip called");
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = window.setTimeout(() => {
    console.log("[PromptProfile™] scheduleEnhanceTooltip timeout fired");
    if (!enhanceTooltipActiveTextarea) {
      console.log("[PromptProfile™] No active textarea in timeout, returning");
      return;
    }
    const wordCount = extractInputText().trim().split(/\s+/).filter(Boolean).length;
    console.log("[PromptProfile™] Timeout check - word count:", wordCount, "dismissed:", enhanceTooltipDismissed);
    if (wordCount >= 3 && !enhanceTooltipDismissed) {
      console.log("[PromptProfile™] Conditions met, showing tooltip");
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
    } else {
      console.log("[PromptProfile™] Conditions not met - wordCount:", wordCount, "dismissed:", enhanceTooltipDismissed);
    }
  }, 1000);
}

function showEnhanceTooltip() {
  console.log("[PromptProfile™] showEnhanceTooltip called");
  if (!enhanceTooltipElement) {
    console.log("[PromptProfile™] Tooltip element not found, creating it");
    ensureEnhanceTooltipElement();
    if (!enhanceTooltipElement) {
      console.error("[PromptProfile™] Cannot show tooltip - element not found");
      return;
    }
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
  
  console.log("[PromptProfile™] Positioning tooltip");
  positionEnhanceTooltip();
  console.log("[PromptProfile™] Adding is-visible class to tooltip");
  enhanceTooltipElement.classList.add("is-visible");
  attachTooltipResizeHandler();
  
  // Verify tooltip is visible
  const computedStyle = window.getComputedStyle(enhanceTooltipElement);
  console.log("[PromptProfile™] Tooltip shown - is-visible class:", enhanceTooltipElement.classList.contains("is-visible"));
  console.log("[PromptProfile™] Tooltip computed opacity:", computedStyle.opacity);
  console.log("[PromptProfile™] Tooltip computed display:", computedStyle.display);
  console.log("[PromptProfile™] Tooltip computed visibility:", computedStyle.visibility);
  console.log("[PromptProfile™] Tooltip position:", enhanceTooltipElement.style.top, enhanceTooltipElement.style.left);
  console.log("[PromptProfile™] Tooltip transform:", enhanceTooltipElement.style.transform);
  console.log("[PromptProfile™] Tooltip shown, button row:", buttonRow, "evaluation section:", evaluationSection);
}

function hideEnhanceTooltip() {
  if (!enhanceTooltipElement) return;
  enhanceTooltipElement.classList.remove("is-visible");
  detachTooltipResizeHandler();
}

function positionEnhanceTooltip() {
  console.log("[PromptProfile™] positionEnhanceTooltip called");
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) {
    console.log("[PromptProfile™] Missing tooltip element or active textarea");
    return;
  }
  
  const rect = enhanceTooltipActiveTextarea.getBoundingClientRect();
  console.log("[PromptProfile™] Input rect:", { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  const tooltipRect = enhanceTooltipElement.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  console.log("[PromptProfile™] Viewport:", { width: viewportWidth, height: viewportHeight });
  
  // Calculate tooltip dimensions (force reflow if needed)
  if (!tooltipRect.width || !tooltipRect.height) {
    enhanceTooltipElement.style.visibility = "hidden";
    enhanceTooltipElement.style.display = "flex";
    void enhanceTooltipElement.offsetWidth; // Force reflow
    const tempRect = enhanceTooltipElement.getBoundingClientRect();
    enhanceTooltipElement.style.visibility = "";
    if (tempRect.width && tempRect.height) {
      // Use measured dimensions
    }
  }
  
  // Measure tooltip after it's visible
  const tooltipHeight = enhanceTooltipElement.offsetHeight || 80; // Fallback height
  const tooltipWidth = enhanceTooltipElement.offsetWidth || 200; // Fallback width
  console.log("[PromptProfile™] Tooltip dimensions:", { width: tooltipWidth, height: tooltipHeight });
  
  // Calculate center position
  const centerX = rect.left + rect.width * 0.5;
  
  // Check if there's enough space above (need space for tooltip + 8px gap)
  const spaceAbove = rect.top;
  const spaceBelow = viewportHeight - rect.bottom;
  const neededSpace = tooltipHeight + 8;
  console.log("[PromptProfile™] Space analysis:", { spaceAbove, spaceBelow, neededSpace });
  
  // Position tooltip above or below based on available space
  let top, transform;
  if (spaceAbove >= neededSpace) {
    // Position above input
    top = rect.top - 8;
    transform = "translate(-50%, -100%)";
    console.log("[PromptProfile™] Positioning above input");
  } else if (spaceBelow >= neededSpace) {
    // Position below input
    top = rect.bottom + 8;
    transform = "translate(-50%, 0)";
    console.log("[PromptProfile™] Positioning below input");
  } else {
    // Not enough space either way - position where there's more space
    if (spaceAbove > spaceBelow) {
      top = Math.max(8, rect.top - 8);
      transform = "translate(-50%, -100%)";
      console.log("[PromptProfile™] Positioning above (constrained)");
    } else {
      top = Math.min(viewportHeight - tooltipHeight - 8, rect.bottom + 8);
      transform = "translate(-50%, 0)";
      console.log("[PromptProfile™] Positioning below (constrained)");
    }
  }
  
  // Constrain horizontal position to viewport
  const left = Math.max(tooltipWidth * 0.5 + 8, Math.min(viewportWidth - tooltipWidth * 0.5 - 8, centerX));
  
  console.log("[PromptProfile™] Final position:", { top, left, transform });
  enhanceTooltipElement.style.top = `${top}px`;
  enhanceTooltipElement.style.left = `${left}px`;
  enhanceTooltipElement.style.transform = transform;
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
  // Sticky button doesn't need position refresh
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
        
        // Check if this is the upgrade button - if so, don't call refine handler
        const clickedElement = clickEvent.target;
        const isUpgradeButton = clickedElement.classList.contains("promptprofile-enhance-tooltip__upgrade") ||
                                clickedElement.closest(".promptprofile-enhance-tooltip__upgrade");
        
        if (isUpgradeButton) {
          console.log("[PromptProfile™] Upgrade button clicked, skipping refine handler in document click");
          document.removeEventListener("click", clickHandler, true);
          tooltipClickInProgress = false;
          return; // Don't call refine handler for upgrade button
        }
        
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


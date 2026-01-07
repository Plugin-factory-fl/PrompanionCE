// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™ Lovable] ========== LOVABLE ADAPTER LOADING ==========");
console.log("[PromptProfile™ Lovable] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™ Lovable] Location:", window.location.href);

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
  // Lovable-specific selectors - adjust based on actual DOM structure
  return !!(
    element.closest("[data-role='assistant']") ||
    element.closest("[class*='assistant']") ||
    element.closest("[class*='bot']") ||
    element.closest("[class*='ai-message']") ||
    element.closest("article[class*='assistant']") ||
    element.closest("div[class*='message'][class*='assistant']")
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
    if (getHighlightButton()) requestSelectionToolbarUpdate();
  });
  highlightObserver.observe(document.body, { childList: true, subtree: true });
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  // Lovable-specific composer selectors - adjust based on actual DOM structure
  return !!(
    element.closest("textarea[placeholder*='message']") ||
    element.closest("textarea[placeholder*='Message']") ||
    element.closest("input[type='text'][placeholder*='message']") ||
    element.closest("[contenteditable='true'][role='textbox']") ||
    element.closest("form[class*='composer']") ||
    element.closest("div[class*='input']") ||
    element.closest("div[class*='composer']")
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
  
  console.log("[PromptProfile™] updateSelectionToolbar called", {
    hasSelection: !!selection,
    isCollapsed: selection?.isCollapsed,
    textLength: text?.length,
    textPreview: text?.substring(0, 30),
    inComposer: selection ? selectionWithinComposer(selection) : false,
    targetsAssistant: selection ? selectionTargetsAssistant(selection) : false
  });
  
  if (!selection || selection.isCollapsed || !text || selectionWithinComposer(selection) || 
      !selectionTargetsAssistant(selection)) {
    console.log("[PromptProfile™] Hiding toolbar - conditions not met");
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
  
  // Position tooltip BELOW the selection to avoid conflict with Bolt's native button above
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

function captureLovableChatHistory(maxMessages = 20) {
  const messages = [];
  
  try {
    // Lovable-specific selectors - adjust based on actual DOM structure
    const assistantSelector = "[data-role='assistant'], [class*='assistant'], [class*='bot'], [class*='ai-message'], [class*='lovable'], article[class*='assistant']";
    const userSelector = "[data-role='user'], [class*='user'], [class*='human'], article[class*='user']";
    
    const assistantElements = Array.from(document.querySelectorAll(assistantSelector));
    const userElements = Array.from(document.querySelectorAll(userSelector));
    
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
    
    for (const { el, role } of allElements) {
      if (messages.length >= maxMessages) break;
      
      // Extract content using multiple strategies
      const contentSelectors = [
        "[data-message-content]",
        ".markdown",
        ".prose",
        "[class*='markdown']",
        "div[class*='text']"
      ];
      
      let content = null;
      for (const selector of contentSelectors) {
        const contentEl = el.querySelector(selector);
        if (contentEl) {
          content = (contentEl.innerText || contentEl.textContent)?.trim();
          if (content && content.length > 0) break;
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
        if (content.length > 3 && !/^(copy|regenerate|thumbs up|thumbs down|share)$/i.test(content)) {
          messages.push({
            role: role === 'assistant' ? 'assistant' : 'user',
            content: content,
            timestamp: Date.now()
          });
        }
      }
    }
    
    console.log(`[PromptProfile™ Lovable] Captured ${messages.length} messages from Lovable conversation`);
    return messages;
  } catch (error) {
    console.error("[PromptProfile™ Lovable] Error capturing Lovable chat history:", error);
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
  const snippet = typeof text === "string" ? text.trim() : "";
  if (!snippet || selectionAskInFlight) return;
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from Lovable conversation for context
    let chatHistory = [];
    console.log("%c[PromptProfile™ Lovable] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureLovableChatHistory(20);
      console.log(`%c[PromptProfile™ Lovable] ✓ Captured ${chatHistory.length} messages`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      if (chatHistory.length === 0) {
        console.warn("[PromptProfile™ Lovable] ⚠️ No messages found in DOM");
      }
    } catch (error) {
      console.error("[PromptProfile™ Lovable] ✗ Failed to capture chat history:", error);
      chatHistory = [];
    };

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
      const errorMessage = error?.message || "";
      if (errorMessage.includes("Extension context invalidated")) {
        console.error("[PromptProfile™ Lovable] Extension context invalidated - user should reload page");
        // The notification is already shown by AdapterBase._showContextInvalidatedNotification()
      } else {
        console.warn("[PromptProfile™ Lovable] Enhancement request failed:", error);
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
    "[data-testid='textbox'][contenteditable='true']",
    "div[contenteditable='true']",
    "[data-testid='conversation-turn-textbox'] textarea:not([readonly])"
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
// This wrapper maintains Bolt-specific logging
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
    .catch((e) => console.error("PromptProfile™: failed to open sidebar from Lovable adapter", e)));
  button.addEventListener("mouseenter", () => AdapterBase.showTooltip(button, BUTTON_ID));
  button.addEventListener("focus", () => AdapterBase.showTooltip(button, BUTTON_ID));
  button.addEventListener("mouseleave", () => AdapterBase.hideTooltip(button));
  button.addEventListener("blur", () => AdapterBase.hideTooltip(button));
  return button;
}

function ensureFloatingButton() {
  console.log("[PromptProfile™ Lovable] ensureFloatingButton called");
  if (floatingButtonWrapper && floatingButtonElement) {
    floatingButtonWrapper.style.width = floatingButtonWrapper.style.height = BUTTON_SIZE.wrapper;
    floatingButtonElement.style.width = floatingButtonElement.style.height = BUTTON_SIZE.element;
    console.log("[PromptProfile™ Lovable] Floating button already exists");
    return;
  }
  ensureStyle();
  floatingButtonWrapper = document.getElementById(`${BUTTON_ID}-wrapper`);
  if (!floatingButtonWrapper) {
    console.log("[PromptProfile™ Lovable] Creating new floating button wrapper");
    floatingButtonWrapper = document.createElement("div");
    floatingButtonWrapper.id = `${BUTTON_ID}-wrapper`;
    floatingButtonWrapper.style.position = "absolute";
    floatingButtonWrapper.style.zIndex = "2147483000";
    floatingButtonWrapper.style.pointerEvents = "auto";
    floatingButtonWrapper.style.display = "flex";
    floatingButtonWrapper.style.alignItems = "center";
    floatingButtonWrapper.style.justifyContent = "center";
    floatingButtonWrapper.style.visibility = "visible";
    floatingButtonWrapper.style.opacity = "1";
  }
  floatingButtonWrapper.style.width = floatingButtonWrapper.style.height = BUTTON_SIZE.wrapper;
  floatingButtonElement = document.getElementById(BUTTON_ID) ?? buildButton();
  floatingButtonElement.style.width = floatingButtonElement.style.height = BUTTON_SIZE.element;
  if (!floatingButtonElement.isConnected) {
    floatingButtonWrapper.append(floatingButtonElement);
    console.log("[PromptProfile™ Lovable] Button element appended to wrapper");
  }
  console.log("[PromptProfile™ Lovable] Floating button ensured:", {
    hasWrapper: !!floatingButtonWrapper,
    hasElement: !!floatingButtonElement,
    wrapperId: floatingButtonWrapper.id,
    elementId: floatingButtonElement.id
  });
}

function placeButton(targetContainer, inputNode, buttonTargetElement = null) {
  if (!inputNode) {
    console.warn("[PromptProfile™ Lovable] placeButton: no input node provided");
    return;
  }
  console.log("[PromptProfile™ Lovable] placeButton called:", {
    hasTargetContainer: !!targetContainer,
    hasInputNode: !!inputNode,
    hasButtonTargetElement: !!buttonTargetElement,
    inputTagName: inputNode.tagName
  });
  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  floatingButtonTargetInput = inputNode;
  
  // Skip XPath to avoid CSP issues - rely on fallback strategies in positionFloatingButton
  // buttonTargetElement will be found via fallback strategies
  
  positionFloatingButton(inputNode, floatingButtonTargetContainer, buttonTargetElement);
  
  // Verify button was placed
  setTimeout(() => {
    if (floatingButtonWrapper && floatingButtonWrapper.offsetParent) {
      console.log("[PromptProfile™ Lovable] ✓ Button successfully placed and visible");
    } else {
      console.warn("[PromptProfile™ Lovable] ⚠️ Button wrapper exists but is not visible:", {
        hasWrapper: !!floatingButtonWrapper,
        isConnected: floatingButtonWrapper?.isConnected,
        parentElement: floatingButtonWrapper?.parentElement?.tagName,
        display: floatingButtonWrapper ? getComputedStyle(floatingButtonWrapper).display : 'N/A',
        visibility: floatingButtonWrapper ? getComputedStyle(floatingButtonWrapper).visibility : 'N/A',
        opacity: floatingButtonWrapper ? getComputedStyle(floatingButtonWrapper).opacity : 'N/A'
      });
    }
  }, 100);
}

/**
 * Finds an element using XPath-like path (without using document.evaluate to avoid CSP issues)
 * Converts XPath /html/body/div[2]/div/main/div/section/div[2]/div/div/div/form/div[2]/div[3]
 * to DOM traversal
 * @param {string} xpath - The XPath expression (for reference, we'll use a CSS selector approach instead)
 * @returns {HTMLElement|null} The found element or null
 */
function findElementByXPath(xpath) {
  // Instead of using document.evaluate (which triggers CSP), use CSS selectors and DOM traversal
  // The XPath /html/body/div[2]/div/main/div/section/div[2]/div/div/div/form/div[2]/div[3]
  // translates to: body > div:nth-child(2) > div > main > div > section > div:nth-child(2) > div > div > div > form > div:nth-child(2) > div:nth-child(3)
  
  try {
    // Start from body
    let current = document.body;
    if (!current) return null;
    
    // Navigate: body > div[2] > div > main > div > section > div[2] > div > div > div > form > div[2] > div[3]
    // body > div:nth-child(2)
    const bodyDivs = Array.from(current.children).filter(c => c.tagName === 'DIV');
    if (bodyDivs.length < 2) return null;
    current = bodyDivs[1]; // div[2] (0-indexed)
    
    // > div
    const div1 = current.querySelector(':scope > div');
    if (!div1) return null;
    current = div1;
    
    // > main
    const main = current.querySelector(':scope > main');
    if (!main) return null;
    current = main;
    
    // > div
    const div2 = current.querySelector(':scope > div');
    if (!div2) return null;
    current = div2;
    
    // > section
    const section = current.querySelector(':scope > section');
    if (!section) return null;
    current = section;
    
    // > div[2]
    const sectionDivs = Array.from(current.children).filter(c => c.tagName === 'DIV');
    if (sectionDivs.length < 2) return null;
    current = sectionDivs[1]; // div[2]
    
    // > div > div > div
    for (let i = 0; i < 3; i++) {
      const div = current.querySelector(':scope > div');
      if (!div) return null;
      current = div;
    }
    
    // > form
    const form = current.querySelector(':scope > form');
    if (!form) return null;
    current = form;
    
    // > div[2]
    const formDivs = Array.from(current.children).filter(c => c.tagName === 'DIV');
    if (formDivs.length < 2) return null;
    current = formDivs[1]; // div[2]
    
    // > div[3]
    const finalDivs = Array.from(current.children).filter(c => c.tagName === 'DIV');
    if (finalDivs.length < 3) return null;
    current = finalDivs[2]; // div[3] (0-indexed, so index 2)
    
    return current instanceof HTMLElement ? current : null;
  } catch (e) {
    console.error("[PromptProfile™ Lovable] XPath-like traversal failed:", e);
    return null;
  }
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer, buttonTargetElement = null) {
  if (!floatingButtonWrapper) {
    console.error("[PromptProfile™ Lovable] Cannot position button - wrapper not created! Calling ensureFloatingButton...");
    ensureFloatingButton();
    if (!floatingButtonWrapper) {
      console.error("[PromptProfile™ Lovable] Still no wrapper after ensureFloatingButton!");
      return;
    }
  }
  
  console.log("[PromptProfile™ Lovable] positionFloatingButton called", {
    hasInputNode: !!inputNode,
    hasContainerNode: !!containerNode,
    hasButtonTargetElement: !!buttonTargetElement,
    hasWrapper: !!floatingButtonWrapper,
    wrapperId: floatingButtonWrapper?.id
  });
  
  // Skip XPath entirely to avoid CSP issues - use fallback strategies only
  let targetElement = buttonTargetElement;
  
  if (targetElement) {
    console.log("[PromptProfile™ Lovable] Target element found via XPath:", {
      tagName: targetElement.tagName,
      className: targetElement.className,
      id: targetElement.id,
      children: targetElement.children.length,
      isConnected: targetElement.isConnected,
      offsetParent: targetElement.offsetParent !== null
    });
  } else {
    console.warn("[PromptProfile™ Lovable] Target element not found via XPath, trying fallback strategies");
    
    // Strategy 1: Try to find the speak button directly by various means
    let speakButton = null;
    
    // Try aria-label/title
    speakButton = document.querySelector('button[aria-label*="speak" i], button[aria-label*="Speak" i], button[title*="speak" i], button[title*="Speak" i]');
    
    // Try to find button with audio/waveform icon (common for voice input)
    if (!speakButton) {
      const allButtons = Array.from(document.querySelectorAll('button'));
      for (const btn of allButtons) {
        const svg = btn.querySelector('svg');
        if (svg) {
          const paths = svg.querySelectorAll('path');
          for (const path of paths) {
            const d = path.getAttribute('d') || '';
            // Look for waveform-like patterns or audio icon patterns
            if (d.includes('M') && d.split('M').length > 3) {
              speakButton = btn;
              console.log("[PromptProfile™ Lovable] Found speak button via SVG pattern");
              break;
            }
          }
          if (speakButton) break;
        }
      }
    }
    
    // Try to find button near the input (last button in form)
    if (!speakButton && inputNode) {
      const form = inputNode.closest('form');
      if (form) {
        const buttons = Array.from(form.querySelectorAll('button'));
        // Get the last visible button (likely the send/speak button)
        for (let i = buttons.length - 1; i >= 0; i--) {
          const btn = buttons[i];
          if (btn.offsetParent !== null) {
            speakButton = btn;
            console.log("[PromptProfile™ Lovable] Found speak button as last visible button in form");
            break;
          }
        }
      }
    }
    
    if (speakButton) {
      targetElement = speakButton.parentElement;
      console.log("[PromptProfile™ Lovable] Found target element via speak button:", {
        speakButtonTag: speakButton.tagName,
        speakButtonAriaLabel: speakButton.getAttribute('aria-label'),
        targetElementTag: targetElement.tagName,
        targetElementClassName: targetElement.className
      });
    } else {
      // Try to find any button in the form area
      const form = inputNode?.closest('form');
      if (form) {
        const buttons = form.querySelectorAll('button');
        if (buttons.length > 0) {
          targetElement = buttons[buttons.length - 1].parentElement;
          console.log("[PromptProfile™ Lovable] Found target element via form button (last button)");
        }
      }
    }
  }
  
  if (!targetElement) {
    console.warn("[PromptProfile™ Lovable] Target element not found, using fallback positioning");
    // Fallback to simple positioning - at least make the button visible
    if (inputNode) {
      // Try to find the form or a container with buttons
      let container = inputNode.closest('form');
      if (!container) {
        container = containerNode && containerNode !== document.body ? containerNode : inputNode.parentElement;
      }
      
      // Walk up to find a container with buttons
      if (container) {
        let current = container;
        let depth = 0;
        while (current && depth < 5) {
          const buttons = current.querySelectorAll('button');
          if (buttons.length > 0) {
            container = current;
            break;
          }
          current = current.parentElement;
          depth++;
        }
      }
      
      if (container) {
        const containerStyle = getComputedStyle(container);
        if (containerStyle.position === "static") {
          container.style.position = "relative";
        }
        if (floatingButtonWrapper.parentElement !== container) {
          container.append(floatingButtonWrapper);
          console.log("[PromptProfile™ Lovable] Button appended to fallback container:", {
            containerTag: container.tagName,
            containerClassName: container.className
          });
        }
        floatingButtonWrapper.style.position = "absolute";
        floatingButtonWrapper.style.top = "50%";
        floatingButtonWrapper.style.right = "12px";
        floatingButtonWrapper.style.transform = "translateY(-50%)";
        floatingButtonWrapper.style.left = "auto";
        floatingButtonWrapper.style.display = "flex";
        floatingButtonWrapper.style.visibility = "visible";
        floatingButtonWrapper.style.opacity = "1";
        floatingButtonWrapper.style.zIndex = "2147483000";
        floatingButtonWrapper.style.pointerEvents = "auto";
        
        // Force button element visibility
        if (floatingButtonElement) {
          floatingButtonElement.style.display = "block";
          floatingButtonElement.style.visibility = "visible";
          floatingButtonElement.style.opacity = "1";
        }
        
        console.log("[PromptProfile™ Lovable] Button positioned using fallback (should be visible now):", {
          containerRect: container.getBoundingClientRect(),
          wrapperRect: floatingButtonWrapper.getBoundingClientRect(),
          isConnected: floatingButtonWrapper.isConnected,
          offsetParent: floatingButtonWrapper.offsetParent !== null
        });
      } else {
        console.error("[PromptProfile™ Lovable] No container found for fallback positioning!");
      }
    } else {
      console.error("[PromptProfile™ Lovable] No input node for fallback positioning!");
    }
    return;
  }
  
  console.log("[PromptProfile™ Lovable] positionFloatingButton: found target element", {
    tagName: targetElement.tagName,
    className: targetElement.className,
    id: targetElement.id
  });
  
  // Find the input bar container - the one that contains both input and buttons
  let inputBarContainer = null;
  
  // Strategy 1: Walk up from target element to find the container that also contains the input
  let current = targetElement.parentElement;
  let depth = 0;
  while (current && depth < 15) {
    const containsTarget = current.contains(targetElement);
    const containsInput = inputNode && current.contains(inputNode);
    
    if (containsTarget && containsInput) {
      const style = getComputedStyle(current);
      const hasRelativePosition = style.position === "relative" || style.position === "absolute";
      const hasFlex = style.display === "flex" || style.display === "grid";
      
      if (hasRelativePosition || hasFlex || 
          current.classList.contains("relative") || 
          current.classList.contains("flex")) {
        inputBarContainer = current;
        console.log("[PromptProfile™ Lovable] Found input bar container via target element walk");
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
      const hasButtons = current.querySelectorAll("button").length > 0;
      const containsInput = current.contains(inputNode);
      const containsTarget = current.contains(targetElement);
      
      if (hasButtons && containsInput && containsTarget) {
        const style = getComputedStyle(current);
        const hasRelativePosition = style.position === "relative" || style.position === "absolute";
        const hasFlex = style.display === "flex" || style.display === "grid";
        
        if (hasRelativePosition || hasFlex || 
            current.classList.contains("relative") || 
            current.classList.contains("flex")) {
          inputBarContainer = current;
          console.log("[PromptProfile™ Lovable] Found input bar container via input walk");
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
      if (parentRect.height < 200 && parentRect.width < 2000) {
        inputBarContainer = targetParent;
        console.log("[PromptProfile™ Lovable] Using target parent as container (fallback)");
      }
    }
  }
  
  // Final fallback
  if (!inputBarContainer) {
    inputBarContainer = targetElement.parentElement || containerNode || inputNode?.parentElement;
  }
  
  if (!inputBarContainer) {
    console.warn("[PromptProfile™ Lovable] No container found");
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
  
  // Find the speak button within the target element
  const speakButton = targetElement.querySelector('button') || targetElement;
  const speakRect = speakButton.getBoundingClientRect();
  
  // Calculate position: to the left of the speak button
  const buttonWidth = BUTTON_SIZE.wrapper ? parseInt(BUTTON_SIZE.wrapper.replace("px", "")) : 44;
  const spacing = 8; // 8px spacing to the left of speak button
  
  // Calculate the right position: speak button's left edge relative to container's right edge + spacing
  const speakLeftFromContainer = speakRect.left - containerRect.left;
  const rightPosition = containerRect.width - speakLeftFromContainer + spacing;
  
  // Calculate vertical alignment: align with the target element's center
  const targetCenterY = targetRect.top - containerRect.top + (targetRect.height / 2);
  const buttonHeight = buttonWidth; // Button is square
  const topPosition = targetCenterY - (buttonHeight / 2);
  
  // Move button to container
  if (floatingButtonWrapper.parentElement !== inputBarContainer) {
    inputBarContainer.append(floatingButtonWrapper);
    console.log("[PromptProfile™ Lovable] Button wrapper appended to inputBarContainer");
  }
  
  // Find the speak button within the target element
  const speakButton = targetElement.querySelector('button') || targetElement;
  const speakRect = speakButton.getBoundingClientRect();
  
  console.log("[PromptProfile™ Lovable] Speak button found:", {
    isButton: speakButton.tagName === 'BUTTON',
    speakRect: { left: speakRect.left, right: speakRect.right, top: speakRect.top, width: speakRect.width, height: speakRect.height }
  });
  
  // Apply positioning styles - force visibility
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = `${topPosition}px`;
  floatingButtonWrapper.style.right = `${rightPosition}px`;
  floatingButtonWrapper.style.transform = "none";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.margin = "0";
  floatingButtonWrapper.style.display = "flex";
  floatingButtonWrapper.style.visibility = "visible";
  floatingButtonWrapper.style.opacity = "1";
  floatingButtonWrapper.style.zIndex = "2147483000";
  floatingButtonWrapper.style.pointerEvents = "auto";
  
  // Force the button element to be visible too
  if (floatingButtonElement) {
    floatingButtonElement.style.display = "block";
    floatingButtonElement.style.visibility = "visible";
    floatingButtonElement.style.opacity = "1";
  }
  
  console.log("[PromptProfile™ Lovable] Button styles applied:", {
    position: floatingButtonWrapper.style.position,
    top: floatingButtonWrapper.style.top,
    right: floatingButtonWrapper.style.right,
    display: floatingButtonWrapper.style.display,
    visibility: floatingButtonWrapper.style.visibility,
    opacity: floatingButtonWrapper.style.opacity,
    zIndex: floatingButtonWrapper.style.zIndex,
    isConnected: floatingButtonWrapper.isConnected,
    offsetParent: floatingButtonWrapper.offsetParent !== null
  });
  
  // Ensure positioning persists
  requestAnimationFrame(() => {
    if (!floatingButtonWrapper || !inputBarContainer || !targetElement) {
      console.warn("[PromptProfile™ Lovable] Missing elements in requestAnimationFrame:", {
        hasWrapper: !!floatingButtonWrapper,
        hasContainer: !!inputBarContainer,
        hasTarget: !!targetElement
      });
      return;
    }
    
    if (floatingButtonWrapper.parentElement !== inputBarContainer) {
      inputBarContainer.append(floatingButtonWrapper);
      console.log("[PromptProfile™ Lovable] Button re-appended in requestAnimationFrame");
    }
    
    // Recalculate in case container moved
    const targetRect2 = targetElement.getBoundingClientRect();
    const containerRect2 = inputBarContainer.getBoundingClientRect();
    const speakRect2 = speakButton.getBoundingClientRect();
    const speakLeftFromContainer2 = speakRect2.left - containerRect2.left;
    const rightPosition2 = containerRect2.width - speakLeftFromContainer2 + spacing;
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
    floatingButtonWrapper.style.display = "flex";
    floatingButtonWrapper.style.visibility = "visible";
    floatingButtonWrapper.style.opacity = "1";
    floatingButtonWrapper.style.zIndex = "2147483000";
    floatingButtonWrapper.style.pointerEvents = "auto";
    
    // Final verification
    const rect = floatingButtonWrapper.getBoundingClientRect();
    console.log("[PromptProfile™ Lovable] Button final position in requestAnimationFrame:", {
      top: floatingButtonWrapper.style.top,
      right: floatingButtonWrapper.style.right,
      visible: floatingButtonWrapper.offsetParent !== null,
      boundingRect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
      display: getComputedStyle(floatingButtonWrapper).display,
      visibility: getComputedStyle(floatingButtonWrapper).visibility,
      opacity: getComputedStyle(floatingButtonWrapper).opacity
    });
  });
  
  console.log("[PromptProfile™ Lovable] Button positioned to the left of speak button:", {
    targetRect: { left: targetRect.left, right: targetRect.right, top: targetRect.top, width: targetRect.width, height: targetRect.height },
    speakRect: { left: speakRect.left, right: speakRect.right, top: speakRect.top, width: speakRect.width, height: speakRect.height },
    containerRect: { left: containerRect.left, right: containerRect.right, top: containerRect.top, width: containerRect.width, height: containerRect.height },
    speakLeftFromContainer,
    rightPosition,
    spacing,
    buttonWidth,
    topPosition
  });
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    // Skip XPath to avoid CSP - rely on fallback strategies
    positionFloatingButton(floatingButtonTargetInput, floatingButtonTargetContainer, null);
  }
}

function ensureDomObserver() {
  if (domObserverStarted) {
    console.log("[PromptProfile™ Lovable] DOM observer already started");
    return;
  }
  console.log("[PromptProfile™ Lovable] Starting DOM observer");
  const observer = new MutationObserver(() => {
    requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
      console.log("[PromptProfile™ Lovable] DOM observer: composer found, setting up enhance tooltip");
      setupEnhanceTooltip(composer.input, composer.container);
    } else {
      console.log("[PromptProfile™ Lovable] DOM observer: composer not found yet");
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
  console.log("[PromptProfile™ Lovable] DOM observer started");
}

function locateComposer() {
  console.log("[PromptProfile™ Lovable] locateComposer: searching for input...");
  
  // Lovable-specific composer selectors - try multiple strategies
  const selectors = [
    "textarea[placeholder*='message']",
    "textarea[placeholder*='Message']",
    "textarea[placeholder*='Ask']",
    "textarea[placeholder*='ask']",
    "input[type='text'][placeholder*='message']",
    "input[type='text'][placeholder*='Message']",
    "[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "form textarea",
    "form input[type='text']",
    "main textarea",
    "main input[type='text']"
  ];
  
  let input = null;
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element instanceof HTMLElement && element.offsetParent !== null) {
        // Check if element is visible
        const style = getComputedStyle(element);
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          input = element;
          console.log(`[PromptProfile™ Lovable] locateComposer: found input with selector: ${selector}`);
          break;
        }
      }
    } catch (e) {
      console.warn(`[PromptProfile™ Lovable] Selector failed: ${selector}`, e);
    }
  }
  
  if (!input) {
    console.warn("[PromptProfile™ Lovable] locateComposer: input not found with standard selectors");
    // Try broader search
    const allTextareas = Array.from(document.querySelectorAll("textarea"));
    const allInputs = Array.from(document.querySelectorAll("input[type='text']"));
    const allContentEditable = Array.from(document.querySelectorAll("[contenteditable='true']"));
    
    const candidates = [...allTextareas, ...allInputs, ...allContentEditable];
    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement && candidate.offsetParent !== null) {
        const style = getComputedStyle(candidate);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          // Check if it's likely an input field (not too large, has reasonable dimensions)
          const rect = candidate.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 20 && rect.height < 200) {
            input = candidate;
            console.log(`[PromptProfile™ Lovable] locateComposer: found input via broader search:`, {
              tagName: candidate.tagName,
              className: candidate.className,
              placeholder: candidate.placeholder
            });
            break;
          }
        }
      }
    }
  }
  
  if (!input) {
    console.warn("[PromptProfile™ Lovable] locateComposer: input not found");
    return null;
  }
  
  // Find container - walk up to find a suitable container
  let container = input.parentElement;
  let depth = 0;
  while (container && depth < 10) {
    const style = getComputedStyle(container);
    const hasRelativePosition = style.position === "relative" || style.position === "absolute";
    const hasFlex = style.display === "flex" || style.display === "grid";
    const hasButtons = container.querySelectorAll("button").length > 0;
    
    if ((hasRelativePosition || hasFlex) && hasButtons) {
      console.log("[PromptProfile™ Lovable] locateComposer: found container with buttons");
      return { input, container };
    }
    container = container.parentElement;
    depth++;
  }
  
  // Fallback to parent or body
  container = input.closest("form") || input.parentElement || document.body;
  console.log("[PromptProfile™ Lovable] locateComposer: using fallback container");
  
  // Skip XPath to avoid CSP issues - target element will be found via fallback strategies
  // in positionFloatingButton
  
  return { input, container, buttonTargetElement: null };
}

function init() {
  console.log("[PromptProfile™ Lovable] ========== INIT CALLED ==========");
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  requestSelectionToolbarUpdate();
  if (composer) {
    console.log("[PromptProfile™ Lovable] Composer found, setting up enhance tooltip");
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[PromptProfile™ Lovable] Composer not found on init, will retry with observer");
  ensureDomObserver();
  return false;
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

  // Fallback: locate composer using locateComposer
  const composer = locateComposer();
  if (composer?.input) {
    return composer.input;
  }

  // Last resort: query for common selectors
  const selectors = [
    "[data-testid='textbox'][contenteditable='true']",
    "div[contenteditable='true']",
    "[data-testid='conversation-turn-textbox'] textarea:not([readonly])"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      return element;
    }
  }

  return null;
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
  console.log("[PromptProfile™ Lovable] ========== BOOTSTRAP CALLED ==========");
  console.log("[PromptProfile™ Lovable] Document ready state:", document.readyState);
  console.log("[PromptProfile™ Lovable] URL:", window.location.href);
  
  // Ensure button is created first
  ensureFloatingButton();
  console.log("[PromptProfile™ Lovable] Button ensured:", {
    hasWrapper: !!floatingButtonWrapper,
    hasElement: !!floatingButtonElement,
    wrapperConnected: floatingButtonWrapper?.isConnected
  });
  
  ensureHighlightObserver();
  const initResult = init();
  console.log("[PromptProfile™ Lovable] Initial init result:", initResult);
  
  // Verify button visibility after a short delay
  setTimeout(() => {
    if (floatingButtonWrapper) {
      const isVisible = floatingButtonWrapper.offsetParent !== null;
      console.log("[PromptProfile™ Lovable] Button visibility check:", {
        isVisible,
        isConnected: floatingButtonWrapper.isConnected,
        parentElement: floatingButtonWrapper.parentElement?.tagName,
        display: getComputedStyle(floatingButtonWrapper).display,
        visibility: getComputedStyle(floatingButtonWrapper).visibility,
        opacity: getComputedStyle(floatingButtonWrapper).opacity,
        position: getComputedStyle(floatingButtonWrapper).position
      });
      
      if (!isVisible) {
        console.warn("[PromptProfile™ Lovable] Button not visible, attempting fallback placement");
        const composer = locateComposer();
        if (composer && composer.input) {
          placeButton(composer.container, composer.input, null);
        }
      }
    } else {
      console.error("[PromptProfile™ Lovable] Button wrapper not created!");
    }
  }, 500);
  
  if (!initResult) {
    console.log("[PromptProfile™ Lovable] Initial init failed, setting up retry observer");
    let retryCount = 0;
    const maxRetries = 50; // Stop after 50 attempts (about 5 seconds)
    const observer = new MutationObserver(() => {
      retryCount++;
      if (retryCount > maxRetries) {
        console.warn("[PromptProfile™ Lovable] Max retries reached, stopping observer");
        observer.disconnect();
        return;
      }
      const result = init();
      if (result) {
        console.log("[PromptProfile™ Lovable] Init succeeded after", retryCount, "retries");
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    
    // Also try periodically in case mutations aren't firing
    const intervalId = setInterval(() => {
      if (init()) {
        console.log("[PromptProfile™ Lovable] Init succeeded via interval");
        clearInterval(intervalId);
        observer.disconnect();
      }
    }, 500);
    
    // Stop interval after 10 seconds
    setTimeout(() => {
      clearInterval(intervalId);
      observer.disconnect();
    }, 10000);
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
  // Don't hide tooltip yet - wait to see if there's a limit error
  console.log("[PromptProfile™] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        if (result?.reason === "EXTENSION_CONTEXT_INVALIDATED") {
        console.error("[PromptProfile™ Bolt] Cannot enhance prompt - extension context invalidated. Please reload the page.");
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
      enhanceActionInFlight = false;
    })
    .catch((error) => {
      console.error("PromptProfile™: refine request threw", error);
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
  const text = (rawText.startsWith("window.__oai") || rawText.includes("__oai_logHTML") ? "" : rawText).trim();
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
  // Don't hide if it's showing upgrade button
  if (enhanceTooltipElement.classList.contains("show-upgrade")) {
    return;
  }
  enhanceTooltipElement.classList.remove("is-visible");
  detachTooltipResizeHandler();
}

function showUpgradeButtonInTooltip() {
  // Ensure tooltip element exists and is visible
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
  }
  if (!enhanceTooltipElement) {
    console.error("[PromptProfile™] Cannot show upgrade button - tooltip element not found");
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
    // Remove old click handlers by cloning
    const newAction = action.cloneNode(true);
    action.replaceWith(newAction);
    
    // Update the new button
    newAction.className = "promptprofile-enhance-tooltip__action promptprofile-enhance-tooltip__upgrade";
    AdapterBase.setButtonTextContent(newAction, "Upgrade for more uses!");
    
    // Add upgrade click handler
    newAction.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await AdapterBase.handleStripeCheckout(newAction);
    });
    
    // Insert dismiss button before the upgrade button
    newAction.parentNode.insertBefore(dismiss, newAction);
  }
  
  // Add class to prevent auto-hide
  enhanceTooltipElement.classList.add("show-upgrade");
  enhanceTooltipDismissed = false; // Reset dismissed flag so tooltip stays visible
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

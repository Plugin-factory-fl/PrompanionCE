// ============================================================================
// CRITICAL: INSERT TEXT MESSAGE LISTENER - MUST BE AT TOP OF FILE
// ============================================================================
// Version: 2024-01-15-FIX-INSERT-TEXT
// This listener is registered IMMEDIATELY when the script loads to ensure
// it's always available when background script sends PROMPANION_INSERT_TEXT
// ============================================================================

(function registerInsertTextListener() {
  console.log("[Prompanion] ========== REGISTERING INSERT TEXT LISTENER (TOP) ==========");
  console.log("[Prompanion] Version: 2024-01-15-FIX-INSERT-TEXT");
  console.log("[Prompanion] chrome available:", typeof chrome !== "undefined");
  console.log("[Prompanion] chrome.runtime available:", typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined");
  console.log("[Prompanion] chrome.runtime.onMessage available:", typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined" && typeof chrome.runtime.onMessage !== "undefined");
  
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[Prompanion] ✗ Cannot register listener - chrome.runtime.onMessage not available!");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      // Only handle PROMPANION_INSERT_TEXT messages
      if (!message || message.type !== "PROMPANION_INSERT_TEXT") {
        return false; // Let other listeners handle it
      }
      
      console.log("[Prompanion] ========== INSERT TEXT MESSAGE RECEIVED (TOP LISTENER) ==========");
      console.log("[Prompanion] Message:", message);
      console.log("[Prompanion] Handler function exists:", typeof handleInsertTextMessage === "function");
      
      // Function declarations are hoisted, so handleInsertTextMessage should be available
      if (typeof handleInsertTextMessage === "function") {
        console.log("[Prompanion] Calling handleInsertTextMessage...");
        try {
          handleInsertTextMessage(message, sender, sendResponse);
          return true; // Keep channel open for async response
        } catch (error) {
          console.error("[Prompanion] Error calling handleInsertTextMessage:", error);
          sendResponse({ ok: false, reason: error?.message ?? "HANDLER_ERROR" });
          return false;
        }
      } else {
        console.error("[Prompanion] handleInsertTextMessage is not a function!");
        sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        return false;
      }
    });
    
    console.log("[Prompanion] ✓✓✓ INSERT TEXT LISTENER REGISTERED SUCCESSFULLY ✓✓✓");
  } catch (error) {
    console.error("[Prompanion] ✗✗✗ FAILED TO REGISTER LISTENER ✗✗✗", error);
  }
})();

console.log("[Prompanion] ========== ADAPTER.JS LOADING ==========");
console.log("[Prompanion] Timestamp:", new Date().toISOString());
console.log("[Prompanion] Location:", window.location.href);

// Import constants from AdapterBase
const BUTTON_ID = AdapterBase.BUTTON_ID;
const BUTTON_CLASS = AdapterBase.BUTTON_CLASS;
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const HIGHLIGHT_BUTTON_SELECTORS = AdapterBase.HIGHLIGHT_BUTTON_SELECTORS;
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;
let domObserverStarted = false;
const tooltipRegistry = new WeakMap();

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

const styles = `
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

  .prompanion-enhance-tooltip {
    position: fixed;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(12, 18, 32, 0.9);
    color: #e9edff;
    box-shadow: 0 18px 40px rgba(8, 12, 28, 0.45);
    transform: translate(-50%, 6px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease, transform 140ms ease;
    z-index: 2147483000;
  }

  .prompanion-enhance-tooltip.is-visible {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }

  .prompanion-enhance-tooltip button {
    border: none;
    cursor: pointer;
  }

  .prompanion-enhance-tooltip__dismiss {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: transparent;
    color: rgba(233, 237, 255, 0.6);
    display: grid;
    place-items: center;
    font-size: 14px;
    line-height: 1;
  }

  .prompanion-enhance-tooltip__dismiss:hover {
    background: rgba(233, 237, 255, 0.14);
    color: #ffffff;
  }

  .prompanion-enhance-tooltip__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 9999px;
    background: #3a7bff;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 10px 26px rgba(58, 123, 255, 0.35);
  }

  .prompanion-enhance-tooltip__action:hover {
    background: #2957c7;
  }

  #${SELECTION_TOOLBAR_ID} {
    position: fixed;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(12, 18, 32, 0.9);
    color: #e9edff;
    box-shadow: 0 18px 40px rgba(8, 12, 28, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
    z-index: 2147483647;
  }

  #${SELECTION_TOOLBAR_ID}.${SELECTION_TOOLBAR_VISIBLE_CLASS} {
    opacity: 1;
    pointer-events: auto;
  }

  #${SELECTION_TOOLBAR_ID} button {
    border: none;
    cursor: pointer;
  }

  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__dismiss {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: transparent;
    color: rgba(233, 237, 255, 0.6);
    display: grid;
    place-items: center;
    font-size: 14px;
    line-height: 1;
  }

  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__dismiss:hover {
    background: rgba(233, 237, 255, 0.14);
    color: #ffffff;
  }

  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 9999px;
    background: #3a7bff;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 10px 26px rgba(58, 123, 255, 0.35);
  }

  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__button:hover {
    background: #2957c7;
  }
`;

function ensureStyle() {
  let style = document.getElementById(`${BUTTON_ID}-style`);
  if (!style) {
    style = document.createElement("style");
    style.id = `${BUTTON_ID}-style`;
    document.head.append(style);
  }
  if (style.textContent !== styles) style.textContent = styles;
}

function getElementFromNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
  return node instanceof HTMLElement ? node : null;
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
  const element = getElementFromNode(node);
  if (!element) return false;
  return !!(
    element.closest("[data-message-author-role='assistant']") ||
    element.closest("[data-testid='assistant-turn']") ||
    element.closest("article")?.closest("main")
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
  const element = getElementFromNode(node);
  if (!element) return false;
  return !!(
    element.closest("[data-testid='conversation-turn-textbox']") ||
    element.closest("[data-testid='composer-container']") ||
    element.closest("form[data-testid='composer']")
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
  button.textContent = "Ask Prompanion";
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

function getSelectionRect(selection) {
  if (!selection?.rangeCount) return null;
  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect?.width || rect?.height) return rect;
    const rects = range.getClientRects();
    return rects[0] || null;
  } catch {
    return null;
  }
}

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
  
  console.log("[Prompanion] updateSelectionToolbar called", {
    hasSelection: !!selection,
    isCollapsed: selection?.isCollapsed,
    textLength: text?.length,
    textPreview: text?.substring(0, 30),
    inComposer: selection ? selectionWithinComposer(selection) : false,
    targetsAssistant: selection ? selectionTargetsAssistant(selection) : false
  });
  
  if (!selection || selection.isCollapsed || !text || selectionWithinComposer(selection) || 
      !selectionTargetsAssistant(selection)) {
    console.log("[Prompanion] Hiding toolbar - conditions not met");
    hideSelectionToolbar();
    return;
  }
  
  console.log("[Prompanion] Showing toolbar - all conditions met");
  const rangeRect = getSelectionRect(selection);
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
  
  // Position tooltip BELOW the selection to avoid conflict with ChatGPT's native button above
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
    chrome.runtime.sendMessage({ type: "PROMPANION_SIDECHAT_REQUEST", text: snippet }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Prompanion: failed to request sidechat from selection", chrome.runtime.lastError);
      } else if (!response?.ok) {
        console.warn("Prompanion: sidechat request rejected", response?.reason);
      }
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

function setButtonTextContent(button, text) {
  const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent?.trim()) {
      node.textContent = text;
      return;
    }
  }
  button.textContent = text;
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
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "PROMPANION_PREPARE_ENHANCEMENT", prompt: promptText, openPanel: false },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Prompanion: enhancement request failed", chrome.runtime.lastError);
          resolve({ ok: false });
          return;
        }
        resolve(response ?? { ok: false });
      });
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

function setComposerText(node, text) {
  console.log("[Prompanion] setComposerText called with node:", node, "text:", text);
  if (!node) {
    console.log("[Prompanion] setComposerText: no node provided");
    return false;
  }
  if (node instanceof HTMLTextAreaElement) {
    console.log("[Prompanion] setComposerText: using textarea method");
    node.value = text;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (node.isContentEditable) {
    console.log("[Prompanion] setComposerText: node is contentEditable, class:", node.className);
    node.focus();
    
    // Method 1: Try to find ProseMirror view and use its API
    let pmView = null;
    
    console.log("[Prompanion] Searching for ProseMirror view...");
    console.log("[Prompanion] node.pmViewDesc:", node.pmViewDesc);
    console.log("[Prompanion] node.parentElement:", node.parentElement);
    
    if (node.pmViewDesc?.pmView) {
      pmView = node.pmViewDesc.pmView;
      console.log("[Prompanion] Found ProseMirror view via node.pmViewDesc");
    } else if (node.parentElement?.pmViewDesc?.pmView) {
      pmView = node.parentElement.pmViewDesc.pmView;
      console.log("[Prompanion] Found ProseMirror view via parent.pmViewDesc");
    } else {
      // Walk up the DOM to find ProseMirror view
      let current = node;
      let depth = 0;
      while (current && !pmView && depth < 10) {
        if (current.pmViewDesc?.pmView) {
          pmView = current.pmViewDesc.pmView;
          console.log("[Prompanion] Found ProseMirror view at depth", depth);
        }
        current = current.parentElement;
        depth++;
      }
    }
    
    if (pmView && pmView.state && pmView.dispatch) {
      console.log("[Prompanion] Attempting ProseMirror transaction method");
      try {
        const pmState = pmView.state;
        const tr = pmState.tr;
        const schema = pmState.schema;
        const textNode = schema.text(text);
        tr.replaceWith(0, pmState.doc.content.size, textNode);
        pmView.dispatch(tr);
        console.log("[Prompanion] Successfully set text via ProseMirror transaction");
        return true;
      } catch (e) {
        console.warn("[Prompanion] ProseMirror transaction failed:", e);
      }
    } else {
      console.log("[Prompanion] ProseMirror view not found or invalid");
    }
    
    // Method 2: Select all and simulate keyboard input
    console.log("[Prompanion] Attempting keyboard simulation method");
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.addRange(range);
      console.log("[Prompanion] Selected all text in node");
      
      // Simulate Cmd+A (select all) then typing
      const keyDownEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "a",
        code: "KeyA",
        metaKey: true,
        ctrlKey: false
      });
      node.dispatchEvent(keyDownEvent);
      
      const keyUpEvent = new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: "a",
        code: "KeyA",
        metaKey: true,
        ctrlKey: false
      });
      node.dispatchEvent(keyUpEvent);
      
      // Now simulate typing the new text
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const inputEvent = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: char
        });
        node.dispatchEvent(inputEvent);
        
        if (!inputEvent.defaultPrevented) {
          const inputEvent2 = new InputEvent("input", {
            bubbles: true,
            cancelable: false,
            inputType: "insertText",
            data: char
          });
          node.dispatchEvent(inputEvent2);
        }
      }
      
      // Also set textContent as fallback
      node.textContent = text;
      
      console.log("[Prompanion] Dispatched keyboard simulation events");
      return true;
    } catch (e) {
      console.warn("[Prompanion] Keyboard simulation method failed:", e);
      // Final fallback
      node.textContent = text;
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      console.log("[Prompanion] Used final fallback: direct textContent");
      return true;
    }
  }
  console.log("[Prompanion] setComposerText: node is not contentEditable or textarea");
  return false;
}

function buildButton() {
  ensureStyle();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.append(createIcon());
  attachTooltip(button);
  button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "PROMPANION_TOGGLE_PANEL" })
    .catch((e) => console.error("Prompanion: failed to open sidebar from ChatGPT adapter", e)));
  button.addEventListener("mouseenter", () => showTooltip(button));
  button.addEventListener("focus", () => showTooltip(button));
  button.addEventListener("mouseleave", () => hideTooltip(button));
  button.addEventListener("blur", () => hideTooltip(button));
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
      placeButton(composer.container, composer.input);
      setupEnhanceTooltip(composer.input, composer.container);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  const wrappers = ["[data-testid='conversation-turn-textbox']", "[data-testid='composer-container']", "main form"]
    .map(sel => document.querySelector(sel)).filter(Boolean);
  let input = null;
  for (const wrapper of wrappers) {
    const editable = wrapper.querySelector("[data-testid='textbox'][contenteditable='true']") ??
                     wrapper.querySelector("div[contenteditable='true']");
    if (editable instanceof HTMLElement) { input = editable; break; }
  }
  if (!input) {
    const textarea = document.querySelector("[data-testid='conversation-turn-textbox'] textarea:not([readonly])");
    if (textarea instanceof HTMLTextAreaElement && !textarea.className.includes("_fallbackTextarea")) input = textarea;
  }
  if (!input) return null;
  return { input, container: input.closest("[data-testid='composer-footer']") ??
                             input.closest("[data-testid='composer-container']") ??
                             input.parentElement ?? document.body };
}

function init() {
  const composer = locateComposer();
  requestSelectionToolbarUpdate();
  if (composer) {
    placeButton(composer.container, composer.input);
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
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
    console.log("[Prompanion] ========== INSERT TEXT REQUEST ==========");
    console.log("[Prompanion] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    console.log("[Prompanion] Text length:", textToInsert.length);
    
    if (!textToInsert) {
      console.log("[Prompanion] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return;
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
      return;
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
  } catch (error) {
    console.error("[Prompanion] Insert text handler failed", error);
    console.error("[Prompanion] Error stack:", error.stack);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
  }
}

// Handler is now defined - verify it's available
console.log("[Prompanion] Handler function defined:", typeof handleInsertTextMessage === "function");

// Set up message listener for insert text requests - MUST BE BEFORE bootstrap() is called
(function() {
  console.log("[Prompanion] ========== SETTING UP MESSAGE LISTENER (IMMEDIATE) ==========");
  console.log("[Prompanion] File version: 2024-01-INSERT-TEXT-FIX");
  
  if (typeof chrome === "undefined") {
    console.error("[Prompanion] chrome is undefined!");
    return;
  }
  
  if (!chrome.runtime) {
    console.error("[Prompanion] chrome.runtime is undefined!");
    return;
  }
  
  if (!chrome.runtime.onMessage) {
    console.error("[Prompanion] chrome.runtime.onMessage is undefined!");
    return;
  }
  
  console.log("[Prompanion] All chrome APIs available, registering listener...");
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      console.log("[Prompanion] ========== MESSAGE RECEIVED IN ADAPTER ==========");
      console.log("[Prompanion] Message type:", message?.type);
      
      if (!message || typeof message !== "object") {
        console.log("[Prompanion] Invalid message, returning false");
        return false;
      }

      if (message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[Prompanion] PROMPANION_INSERT_TEXT received! Calling handler...");
        try {
          handleInsertTextMessage(message, sender, sendResponse);
          return true; // Keep channel open for async response
        } catch (error) {
          console.error("[Prompanion] Handler error:", error);
          sendResponse({ ok: false, reason: error?.message ?? "HANDLER_ERROR" });
          return true;
        }
      }
      
      return false;
    });
    
    console.log("[Prompanion] ✓ Message listener registered successfully!");
  } catch (error) {
    console.error("[Prompanion] ✗ Failed to register listener:", error);
    console.error("[Prompanion] Error:", error.message, error.stack);
  }
})();

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

function attachTooltip(button) {
  ensureTooltipResources();
  tooltipRegistry.set(button, { text: "Open Prompanion to enhance your prompts for the best response." });
}

function ensureTooltipResources() {
  if (!document.getElementById(`${BUTTON_ID}-tooltip-style`)) {
    const style = document.createElement("style");
    style.id = `${BUTTON_ID}-tooltip-style`;
    style.textContent = `
      #${BUTTON_ID}-tooltip-layer {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
      }

      .prompanion-tooltip {
        position: absolute;
        transform: translateX(-50%);
        background: rgba(12, 18, 32, 0.9);
        color: #e9edff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.35;
        box-shadow: 0 16px 32px rgba(8, 12, 28, 0.42);
        max-width: 240px;
        text-align: center;
        opacity: 0;
        transition: opacity 140ms ease, transform 140ms ease;
        pointer-events: none;
      }

      .prompanion-tooltip::after {
        content: "";
        position: absolute;
        top: -6px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 6px;
        border-style: solid;
        border-color: transparent transparent rgba(12, 18, 32, 0.9) transparent;
      }

      .prompanion-tooltip.is-visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }

      .prompanion-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `;
    document.head.append(style);
  }

  if (!document.getElementById(`${BUTTON_ID}-tooltip-layer`)) {
    const container = document.createElement("div");
    container.id = `${BUTTON_ID}-tooltip-layer`;
    document.body.append(container);
  }
}

function showTooltip(button) {
  const data = tooltipRegistry.get(button);
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
  positionTooltip(button, tooltip);
  tooltip.classList.add("is-visible");
}

function hideTooltip(button) {
  const tooltip = button._prompanionTooltip;
  tooltip?.classList.remove("is-visible");
}

function positionTooltip(button, tooltip) {
  const rect = button.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
  tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
}

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
    setButtonTextContent(action, "Refine");
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

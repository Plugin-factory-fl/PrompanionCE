// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[Prompanion] ========== GEMINI ADAPTER LOADING ==========");
console.log("[Prompanion] Timestamp:", new Date().toISOString());
console.log("[Prompanion] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[Prompanion] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
}

const BUTTON_ID = AdapterBase.BUTTON_ID;
const BUTTON_CLASS = AdapterBase.BUTTON_CLASS;
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const HIGHLIGHT_BUTTON_SELECTORS = AdapterBase.HIGHLIGHT_BUTTON_SELECTORS;
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
// Selection toolbar variables removed - now handled by AdapterBase
let highlightObserver = null;
let initInProgress = false;
let bootstrapObserver = null;

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
  // Gemini-specific selectors for assistant messages
  return !!(
    element.closest("[data-model-turn='model']") ||
    element.closest("[data-model-role='model']") ||
    element.closest(".response-container") ||
    element.closest("[data-message-type='model']") ||
    element.closest(".model-response") ||
    element.closest("main")?.querySelector("[data-model-turn], [data-model-role]")
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
  // Gemini-specific selectors for composer/input area
  return !!(
    element.closest(".ql-editor.ql-blank.textarea.new-input-ui") ||
    element.closest("[aria-label='Enter a prompt here']") ||
    element.closest("[data-placeholder='Ask Gemini']") ||
    element.closest("rich-textarea.text-input-field_textarea") ||
    element.closest(".text-input-field_textarea-wrapper") ||
    element.closest(".text-input-field-main-area") ||
    element.closest("[role='textbox'][contenteditable='true'][aria-label*='prompt']")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

// Selection Toolbar system moved to AdapterBase
// Initialize it with Gemini-specific condition functions
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

// Selection toolbar update/positioning is now handled by AdapterBase.initSelectionToolbar()
// Old manual functions removed - AdapterBase handles everything internally

function captureGeminiChatHistory(maxMessages = 20) {
  console.log("%c[Prompanion Gemini] ========== captureGeminiChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[Prompanion Gemini] Current URL:", window.location.href);
  
  const messages = [];
  
  try {
    // Gemini-specific selectors
    const assistantSelectors = [
      "[data-model-turn='model']",
      "[data-model-role='model']",
      "[data-message-type='model']",
      ".response-container",
      ".model-response"
    ];
    
    const userSelectors = [
      "[data-model-turn='user']",
      "[data-model-role='user']",
      "[data-message-type='user']",
      ".user-message",
      "[data-user-turn]"
    ];
    
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[Prompanion Gemini] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break;
        }
      } catch (e) {
        console.warn(`[Prompanion Gemini] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(document.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[Prompanion Gemini] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break;
        }
      } catch (e) {
        console.warn(`[Prompanion Gemini] Selector failed: ${selector}`, e);
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
    
    console.log(`[Prompanion Gemini] ✓ Captured ${messages.length} messages from Gemini conversation`);
    return messages;
  } catch (error) {
    console.error("[Prompanion Gemini] ✗ Error capturing Gemini chat history:", error);
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
  console.log("%c[Prompanion Gemini] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[Prompanion Gemini] Snippet:", snippet?.substring(0, 50));
  
  if (!snippet || selectionAskInFlight) {
    console.log("[Prompanion Gemini] Exiting early - snippet:", !!snippet, "inFlight:", selectionAskInFlight);
    return;
  }
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from Gemini conversation for context
    let chatHistory = [];
    console.log("%c[Prompanion Gemini] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureGeminiChatHistory(20);
      console.log(`%c[Prompanion Gemini] ✓ Captured ${chatHistory.length} messages`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      if (chatHistory.length === 0) {
        console.warn("[Prompanion Gemini] ⚠️ No messages found in DOM");
      }
    } catch (error) {
      console.error("[Prompanion Gemini] ✗ Failed to capture chat history:", error);
      chatHistory = [];
    }
    
    console.log("%c[Prompanion Gemini] Sending PROMPANION_SIDECHAT_REQUEST", "color: purple; font-size: 14px; font-weight: bold;");
    console.log("[Prompanion Gemini] Request details:", {
      textLength: snippet.length,
      chatHistoryLength: chatHistory.length
    });

    AdapterBase.sendMessage({ 
      type: "PROMPANION_SIDECHAT_REQUEST", 
      text: snippet,
      chatHistory: chatHistory 
    }, (response) => {
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

// Selection toolbar action is now handled by AdapterBase.initSelectionToolbar() onAction callback
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

  // Last resort: query for common selectors - Gemini-specific
  const selectors = [
    ".ql-editor.ql-blank.textarea.new-input-ui[contenteditable='true']",
    "[aria-label='Enter a prompt here'][contenteditable='true']",
    "[data-placeholder='Ask Gemini'][contenteditable='true']",
    "rich-textarea.text-input-field_textarea .ql-editor[contenteditable='true']",
    "[role='textbox'][contenteditable='true'][aria-label*='prompt']",
    "[role='textbox'][contenteditable='true'][aria-multiline='true']"
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
// This wrapper maintains Gemini-specific logging
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
    .catch((e) => console.error("Prompanion: failed to open sidebar from Gemini adapter", e)));
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
    // CRITICAL: Don't append to DOM here - let positionFloatingButton handle it
  } else {
    // If wrapper already exists in DOM, remove it so positionFloatingButton can place it correctly
    if (floatingButtonWrapper.parentElement) {
      console.log("[Prompanion Gemini] ensureFloatingButton: Removing existing wrapper from", floatingButtonWrapper.parentElement);
      floatingButtonWrapper.remove();
    }
  }
  floatingButtonWrapper.style.width = floatingButtonWrapper.style.height = BUTTON_SIZE.wrapper;
  floatingButtonElement = document.getElementById(BUTTON_ID) ?? buildButton();
  floatingButtonElement.style.width = floatingButtonElement.style.height = BUTTON_SIZE.element;
  if (!floatingButtonElement.isConnected) floatingButtonWrapper.append(floatingButtonElement);
}

function placeButton(targetContainer, inputNode) {
  console.log("[Prompanion Gemini] placeButton called");
  if (!inputNode) {
    console.warn("[Prompanion Gemini] placeButton: no inputNode");
    return;
  }
  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  floatingButtonTargetInput = inputNode;
  console.log("[Prompanion Gemini] placeButton: calling positionFloatingButton");
  positionFloatingButton(inputNode, null);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  console.log("[Prompanion Gemini] positionFloatingButton called");
  if (!floatingButtonWrapper) {
    console.warn("[Prompanion Gemini] positionFloatingButton: floatingButtonWrapper is null");
    return;
  }
  
  // Find the model selection button
  let modelButton = null;
  
  // Try XPath first
  try {
    const xpathResult = document.evaluate(
      '/html/body/chat-app/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/div/input-area-v2/div/div/div[3]/div[1]/bard-mode-switcher/div/button',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    modelButton = xpathResult.singleNodeValue;
    if (modelButton) {
      console.log("[Prompanion Gemini] Model button found via XPath");
    }
  } catch (error) {
    console.warn("[Prompanion Gemini] XPath error:", error);
  }
  
  // Fallback: querySelector
  if (!modelButton) {
    modelButton = document.querySelector("bard-mode-switcher button") ||
                  document.querySelector("bard-mode-switcher div button");
    if (modelButton) {
      console.log("[Prompanion Gemini] Model button found via querySelector");
    }
  }
  
  if (!modelButton) {
    console.warn("[Prompanion Gemini] Model button not found - cannot position logo");
    return;
  }
  
  if (!modelButton.offsetParent) {
    console.warn("[Prompanion Gemini] Model button found but not visible (no offsetParent)");
    return;
  }
  
  console.log("[Prompanion Gemini] Model button found and visible:", {
    tagName: modelButton.tagName,
    className: modelButton.className,
    rect: modelButton.getBoundingClientRect()
  });
  
  // Find the container using the provided XPath
  // XPath: //*[@id="app-root"]/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/div/input-area-v2/div/div/div[2]
  let container = null;
  
  try {
    const xpathResult = document.evaluate(
      '//*[@id="app-root"]/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/div/input-area-v2/div/div/div[2]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    container = xpathResult.singleNodeValue;
    if (container) {
      console.log("[Prompanion Gemini] Container found via XPath");
    }
  } catch (error) {
    console.warn("[Prompanion Gemini] Container XPath error:", error);
  }
  
  // Fallback: try to find div[2] within input-area-v2
  if (!container) {
    const inputArea = document.querySelector('input-area-v2');
    if (inputArea) {
      // Find div/div/div[2] structure
      const firstDiv = inputArea.querySelector('div');
      if (firstDiv) {
        const secondDiv = firstDiv.querySelector('div');
        if (secondDiv && secondDiv.children.length >= 2) {
          container = secondDiv.children[1]; // div[2] (0-indexed, so [1])
          console.log("[Prompanion Gemini] Container found via fallback");
        }
      }
    }
  }
  
  if (!container || container === document.body) {
    console.warn("[Prompanion Gemini] No suitable container found");
    return;
  }
  
  console.log("[Prompanion Gemini] Selected container:", {
    tagName: container.tagName,
    className: container.className,
    rect: container.getBoundingClientRect()
  });
  
  // Ensure container has relative positioning
  const containerStyle = getComputedStyle(container);
  if (containerStyle.position === "static") {
    container.style.position = "relative";
  }
  
  // Get bounding rects
  const modelRect = modelButton.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const spacing = 8; // 8px from right edge of container
  
  // Parse buttonWidth - handle both number and string with "px"
  let buttonWidth = BUTTON_SIZE.wrapper || 40;
  if (typeof buttonWidth === 'string') {
    buttonWidth = parseInt(buttonWidth.replace('px', ''), 10) || 40;
  }
  
  // Calculate position using RIGHT positioning
  // Position button 8px from the right edge of the container
  // Get model button's vertical center for alignment
  const modelButtonCenter = modelRect.top + modelRect.height / 2;
  const containerTop = containerRect.top;
  const topOffset = modelButtonCenter - containerTop;
  
  // Move button to container (remove from any previous parent first)
  if (floatingButtonWrapper.parentElement !== container) {
    if (floatingButtonWrapper.parentElement) {
      floatingButtonWrapper.remove();
    }
    container.append(floatingButtonWrapper);
  }
  
  // Apply positioning: 8px from right edge, vertically aligned with model button
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.right = `${spacing}px`;
  floatingButtonWrapper.style.top = `${topOffset}px`;
  floatingButtonWrapper.style.transform = "translateY(-50%)";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.margin = "0";
  floatingButtonWrapper.style.display = "flex";
  floatingButtonWrapper.style.zIndex = "2147483000";
  
  console.log("[Prompanion Gemini] Button positioned:", {
    container: container.tagName,
    containerClass: container.className,
    rightPosition: spacing,
    topOffset: topOffset,
    modelButtonCenter: modelButtonCenter,
    containerTop: containerTop,
    buttonWidth: buttonWidth
  });
}

function refreshFloatingButtonPosition() {
  // Only refresh if button exists and model button is available
  if (floatingButtonWrapper) {
    positionFloatingButton(floatingButtonTargetInput, null);
  }
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  let lastMutationTime = 0;
  const THROTTLE_MS = 1000; // Only process mutations at most once every 1 second
  
  const observer = new MutationObserver(() => {
    // Throttle mutations to prevent infinite loops
    const now = Date.now();
    if (now - lastMutationTime < THROTTLE_MS) return;
    if (initInProgress) return;
    
    lastMutationTime = now;
    AdapterBase.requestSelectionToolbarUpdate();
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
  // Gemini-specific selectors for composer/input area - based on actual DOM structure
  // Primary: .ql-editor.ql-blank.textarea.new-input-ui inside rich-textarea.text-input-field_textarea
  let input = document.querySelector(".ql-editor.ql-blank.textarea.new-input-ui[contenteditable='true']") ||
              document.querySelector("[aria-label='Enter a prompt here'][contenteditable='true']") ||
              document.querySelector("[data-placeholder='Ask Gemini'][contenteditable='true']");
  
  // If not found, try wrapper-based approach
  if (!input) {
    const wrappers = [
      "rich-textarea.text-input-field_textarea",
      ".text-input-field_textarea-wrapper",
      ".text-input-field-main-area"
    ].map(sel => document.querySelector(sel)).filter(Boolean);
    
    for (const wrapper of wrappers) {
      const editable = wrapper.querySelector(".ql-editor.ql-blank.textarea.new-input-ui[contenteditable='true']") ??
                       wrapper.querySelector("[aria-label='Enter a prompt here']") ??
                       wrapper.querySelector("[role='textbox'][contenteditable='true']") ??
                       (wrapper.hasAttribute("contenteditable") && wrapper.getAttribute("contenteditable") === "true" ? wrapper : null);
      if (editable instanceof HTMLElement) { input = editable; break; }
    }
  }
  
  // Last resort: generic contenteditable query
  if (!input) {
    const contentEditable = document.querySelector("[role='textbox'][contenteditable='true'][aria-label*='prompt']") ||
                           document.querySelector("[role='textbox'][contenteditable='true'][aria-multiline='true']");
    if (contentEditable instanceof HTMLElement) input = contentEditable;
  }
  
  if (!input) return null;
  
  // Find the appropriate container
  const container = input.closest("rich-textarea.text-input-field_textarea") ??
                   input.closest(".text-input-field_textarea-wrapper") ??
                   input.closest(".text-input-field-main-area") ??
                   input.closest(".text-input-field_textarea-inner") ??
                   input.parentElement ?? 
                   document.body;
  
  return { input, container };
}

function init() {
  // Prevent concurrent calls
  if (initInProgress) {
    console.log("[Prompanion Gemini] init() - already in progress, skipping");
    return false;
  }
  
  initInProgress = true;
  try {
    console.log("[Prompanion Gemini] init() called");
    const composer = locateComposer();
    console.log("[Prompanion Gemini] init() - composer found:", !!composer);
    AdapterBase.requestSelectionToolbarUpdate();
    if (composer) {
      console.log("[Prompanion Gemini] init() - calling placeButton");
      placeButton(composer.container, composer.input);
      setupEnhanceTooltip(composer.input, composer.container);
      ensureDomObserver();
      return true;
    }
    console.log("[Prompanion Gemini] init() - no composer found, setting up observer");
    ensureDomObserver();
    return false;
  } finally {
    initInProgress = false;
  }
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
  console.log("[Prompanion Gemini] bootstrap() called");
  ensureHighlightObserver();
  initSelectionToolbar(); // Initialize the selection toolbar system
  const initResult = init();
  console.log("[Prompanion Gemini] bootstrap() - init() returned:", initResult);
  if (!initResult) {
    console.log("[Prompanion Gemini] bootstrap() - composer not found, setting up MutationObserver");
    // Disconnect any existing observer first
    if (bootstrapObserver) {
      bootstrapObserver.disconnect();
      bootstrapObserver = null;
    }
    let lastInitTime = 0;
    const THROTTLE_MS = 500; // Only run init() at most once every 500ms
    
    bootstrapObserver = new MutationObserver(() => {
      // Throttle: only run if enough time has passed since last init
      const now = Date.now();
      if (now - lastInitTime < THROTTLE_MS) return;
      if (initInProgress) return; // Prevent concurrent calls
      
      lastInitTime = now;
      const retryResult = init();
      if (retryResult) {
        console.log("[Prompanion Gemini] bootstrap() - composer found on retry, disconnecting observer");
        if (bootstrapObserver) {
          bootstrapObserver.disconnect();
          bootstrapObserver = null;
        }
      }
    });
    bootstrapObserver.observe(document.documentElement, { childList: true, subtree: true });
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

// Selection change is handled by AdapterBase.initSelectionToolbar()
// Scroll and resize listeners removed to avoid performance issues
// AdapterBase will handle selection changes efficiently

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

// Also recalculate on window resize to keep button position correct
window.addEventListener("resize", () => {
  if (floatingButtonTargetInput) {
    refreshFloatingButtonPosition();
  }
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


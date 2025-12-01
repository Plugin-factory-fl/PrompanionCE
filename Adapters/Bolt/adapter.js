// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[Prompanion Bolt] ========== BOLT ADAPTER LOADING ==========");
console.log("[Prompanion Bolt] Timestamp:", new Date().toISOString());
console.log("[Prompanion Bolt] Location:", window.location.href);

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
let enhanceTooltipDismissedTime = 0;
const ENHANCE_TOOLTIP_DISMISS_COOLDOWN_MS = 5000; // 5 seconds
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
// Old selection toolbar variables removed - now using AdapterBase.initSelectionToolbar()
// Clean up any existing old toolbar elements on load
if (document.body) {
  const oldToolbar = document.getElementById(SELECTION_TOOLBAR_ID);
  if (oldToolbar && !oldToolbar.classList.contains('prompanion-selection-toolbar')) {
    // Only remove if it's the old style toolbar, not the AdapterBase one
    oldToolbar.remove();
  }
}
// selectionUpdateRaf removed - now using AdapterBase.requestSelectionToolbarUpdate()
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
  
  // Inject CSS rule for Bolt container push with very high specificity
  const pushStyleId = 'prompanion-bolt-container-push-style';
  if (document.getElementById(pushStyleId)) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = pushStyleId;
  style.textContent = `
    /* High specificity rule to override Bolt.new's width */
    div.flex.flex-col.h-full.w-full[data-prompanion-pushed="true"] {
      width: calc(100% - min(546px, 94vw)) !important;
      max-width: calc(100% - min(546px, 94vw)) !important;
      flex-basis: calc(100% - min(546px, 94vw)) !important;
      box-sizing: border-box !important;
      transition: width 160ms ease-in-out, max-width 160ms ease-in-out, flex-basis 160ms ease-in-out, box-sizing 160ms ease-in-out !important;
    }
  `;
  document.head.appendChild(style);
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
  if (!element) {
    console.log("[Prompanion Bolt] nodeInAssistantMessage - no element from node");
    return false;
  }
  // Bolt-specific selectors - adjust based on actual DOM structure
  const selectors = [
    "[data-role='assistant']",
    "[class*='assistant']",
    "[class*='bot']",
    "[class*='ai-message']",
    "article[class*='assistant']",
    "div[class*='message'][class*='assistant']",
    "[class*='response']",
    "[class*='output']",
    "[data-author='assistant']",
    "[data-role='bot']"
  ];
  
  for (const selector of selectors) {
    const closest = element.closest(selector);
    if (closest) {
      console.log("[Prompanion Bolt] nodeInAssistantMessage - found assistant message via selector:", selector, {
        tagName: closest.tagName,
        className: closest.className,
        id: closest.id
      });
      return true;
    }
  }
  
  // Also check if the element or its parent contains text that looks like an assistant response
  // (e.g., not in an input field, and in a message-like container)
  const text = element.textContent || element.innerText || "";
  const isInInput = element.closest("input, textarea, [contenteditable='true']");
  const isInMessageContainer = element.closest("div[class*='message'], article, section, [role='article']");
  
  if (!isInInput && isInMessageContainer && text.length > 10) {
    // Check if it's likely an assistant message (not user input)
    // User messages are typically in input fields or have specific patterns
    const isUserInput = element.closest("form, [role='textbox'], textarea");
    if (!isUserInput) {
      console.log("[Prompanion Bolt] nodeInAssistantMessage - likely assistant message (fallback detection)", {
        tagName: element.tagName,
        className: element.className,
        textPreview: text.substring(0, 50)
      });
      return true;
    }
  }
  
  console.log("[Prompanion Bolt] nodeInAssistantMessage - not an assistant message", {
    tagName: element.tagName,
    className: element.className,
    isInInput: !!isInInput,
    isInMessageContainer: !!isInMessageContainer
  });
  return false;
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
  // Bolt-specific composer selectors - adjust based on actual DOM structure
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

// Old ensureSelectionToolbar and hideSelectionToolbar functions removed
// Now using AdapterBase.initSelectionToolbar() which handles toolbar creation and management
// Clean up any existing old toolbar elements
if (typeof selectionToolbarElement !== 'undefined' && selectionToolbarElement) {
  selectionToolbarElement.remove();
  selectionToolbarElement = null;
}

// Generic getSelectionRect removed - use AdapterBase.getSelectionRect()

// Old requestSelectionToolbarUpdate and updateSelectionToolbar functions removed
// Now using AdapterBase.initSelectionToolbar() and AdapterBase.requestSelectionToolbarUpdate()

function captureBoltChatHistory(maxMessages = 20) {
  const messages = [];
  
  try {
    // Bolt-specific selectors - adjust based on actual DOM structure
    const assistantSelector = "[data-role='assistant'], [class*='assistant'], [class*='bot'], [class*='ai-message'], article[class*='assistant']";
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
    
    console.log(`[Prompanion] Captured ${messages.length} messages from Bolt conversation`);
    return messages;
  } catch (error) {
    console.error("[Prompanion] Error capturing GPT chat history:", error);
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
    // Capture chat history from Bolt conversation for context
    let chatHistory = [];
    console.log("%c[Prompanion Bolt] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureBoltChatHistory(20);
      console.log(`%c[Prompanion Bolt] ✓ Captured ${chatHistory.length} messages`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      if (chatHistory.length === 0) {
        console.warn("[Prompanion Bolt] ⚠️ No messages found in DOM");
      }
    } catch (error) {
      console.error("[Prompanion Bolt] ✗ Failed to capture chat history:", error);
      chatHistory = [];
    };

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

// Old handleSelectionToolbarAction removed - now handled by AdapterBase.initSelectionToolbar() onAction callback

function initSelectionToolbar() {
  AdapterBase.initSelectionToolbar({
    shouldShowToolbar: (selection) => {
      const text = selection?.toString().trim();
      const inComposer = selectionWithinComposer(selection);
      const targetsAssistant = selectionTargetsAssistant(selection);
      const hasText = !!(text && text.length > 0);
      const notCollapsed = !!(selection && !selection.isCollapsed);
      
      // Show toolbar for any text selection that's not in the composer
      // Prefer assistant messages, but allow any selection for better UX
      const shouldShow = !!(notCollapsed && hasText && !inComposer);
      
      console.log("[Prompanion Bolt] shouldShowToolbar check:", {
        hasSelection: !!selection,
        notCollapsed,
        hasText,
        textLength: text?.length || 0,
        inComposer,
        targetsAssistant,
        shouldShow
      });
      
      return shouldShow;
    },
    onAction: (text) => {
      submitSelectionToSideChat(text);
    },
    buttonText: "Elaborate",
    toolbarId: SELECTION_TOOLBAR_ID,
    visibleClass: SELECTION_TOOLBAR_VISIBLE_CLASS
  });
  console.log("[Prompanion Bolt] Selection toolbar initialized");
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
        console.error("[Prompanion Bolt] Extension context invalidated - user should reload page");
        // The notification is already shown by AdapterBase._showContextInvalidatedNotification()
      } else {
        console.warn("[Prompanion Bolt] Enhancement request failed:", error);
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
  AdapterBase.attachTooltip(button, "Open Prompanion to enhance your prompts for the best response.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("Prompanion: failed to open sidebar from Bolt adapter", e)));
  // Custom tooltip handlers that check for edit mode
  button.addEventListener("mouseenter", () => {
    const isEditingMode = floatingButtonTargetInput && floatingButtonTargetInput.classList && floatingButtonTargetInput.classList.contains('cm-content');
    AdapterBase.showTooltip(button, BUTTON_ID, { positionAbove: isEditingMode });
  });
  button.addEventListener("focus", () => {
    const isEditingMode = floatingButtonTargetInput && floatingButtonTargetInput.classList && floatingButtonTargetInput.classList.contains('cm-content');
    AdapterBase.showTooltip(button, BUTTON_ID, { positionAbove: isEditingMode });
  });
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
  console.log("[Prompanion Bolt] placeButton called", {
    hasInputNode: !!inputNode,
    inputNodeTag: inputNode?.tagName,
    inputNodeClass: inputNode?.className,
    hasContainer: !!targetContainer,
    containerTag: targetContainer?.tagName
  });
  if (!inputNode) {
    console.warn("[Prompanion Bolt] placeButton - no inputNode, returning");
    return;
  }
  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  floatingButtonTargetInput = inputNode;
  console.log("[Prompanion Bolt] placeButton - calling positionFloatingButton");
  positionFloatingButton(inputNode, floatingButtonTargetContainer);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  console.log("[Prompanion Bolt] positionFloatingButton called", {
    hasWrapper: !!floatingButtonWrapper,
    inputNode: inputNode?.tagName,
    inputClass: inputNode?.className,
    containerNode: containerNode?.tagName
  });
  
  if (!floatingButtonWrapper) {
    console.warn("[Prompanion Bolt] positionFloatingButton - no floatingButtonWrapper");
    return;
  }
  
  // Check if we're in editing mode (CodeMirror editor present)
  const isEditingMode = inputNode && inputNode.classList && inputNode.classList.contains('cm-content');
  console.log("[Prompanion Bolt] positionFloatingButton - isEditingMode:", isEditingMode);
  
  if (isEditingMode) {
    // In editing mode, position relative to the plan/submit button section
    console.log("[Prompanion Bolt] positionFloatingButton - attempting XPath lookup for editing mode");
    try {
      const xpathResult = document.evaluate(
        '//*[@id="root"]/div[2]/div[2]/div/div[1]/div/div[2]/div/div[3]/div[2]/div[4]/div[3]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const editingContainer = xpathResult.singleNodeValue;
      
      console.log("[Prompanion Bolt] positionFloatingButton - XPath result:", {
        found: !!editingContainer,
        isHTMLElement: editingContainer instanceof HTMLElement,
        tagName: editingContainer?.tagName,
        className: editingContainer?.className
      });
      
      if (editingContainer && editingContainer instanceof HTMLElement) {
        console.log("[Prompanion Bolt] Found editing mode container via XPath, positioning button");
        const containerStyle = getComputedStyle(editingContainer);
        if (containerStyle.position === "static") {
          editingContainer.style.position = "relative";
        }
        if (floatingButtonWrapper.parentElement !== editingContainer) {
          if (floatingButtonWrapper.parentElement) {
            floatingButtonWrapper.remove();
          }
          editingContainer.append(floatingButtonWrapper);
          console.log("[Prompanion Bolt] Button appended to editing container");
        }
        floatingButtonWrapper.style.position = "absolute";
        floatingButtonWrapper.style.top = "50%";
        floatingButtonWrapper.style.right = "112px"; // 12px + 100px total offset to the left
        floatingButtonWrapper.style.transform = "translateY(-50%)";
        floatingButtonWrapper.style.left = "auto";
        floatingButtonWrapper.style.bottom = "auto";
        floatingButtonWrapper.style.display = "flex";
        floatingButtonWrapper.style.zIndex = "2147483000";
        console.log("[Prompanion Bolt] Button positioned in editing mode", {
          parent: floatingButtonWrapper.parentElement?.tagName,
          parentClass: floatingButtonWrapper.parentElement?.className,
          right: "112px (100px total offset from original 12px)",
          rect: floatingButtonWrapper.getBoundingClientRect()
        });
        return;
      } else {
        console.warn("[Prompanion Bolt] XPath found element but it's not an HTMLElement:", editingContainer);
      }
    } catch (error) {
      console.warn("[Prompanion Bolt] XPath lookup failed for editing mode:", error);
    }
    console.log("[Prompanion Bolt] Falling back to default positioning for editing mode");
  }
  
  // Default positioning for homepage/chat mode
  const target = containerNode ?? inputNode;
  if (!target) {
    console.warn("[Prompanion Bolt] positionFloatingButton - no target container");
    return;
  }
  console.log("[Prompanion Bolt] Using default positioning", {
    target: target.tagName,
    targetClass: target.className
  });
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }
  if (floatingButtonWrapper.parentElement !== target) {
    if (floatingButtonWrapper.parentElement) {
      floatingButtonWrapper.remove();
    }
    target.append(floatingButtonWrapper);
    console.log("[Prompanion Bolt] Button appended to default container");
  }
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = "50%";
  floatingButtonWrapper.style.right = "12px";
  floatingButtonWrapper.style.transform = "translateY(-50%)";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.display = "flex";
  floatingButtonWrapper.style.zIndex = "2147483000";
  console.log("[Prompanion Bolt] Button positioned in default mode", {
    parent: floatingButtonWrapper.parentElement?.tagName,
    parentClass: floatingButtonWrapper.parentElement?.className,
    rect: floatingButtonWrapper.getBoundingClientRect()
  });
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    positionFloatingButton(floatingButtonTargetInput, floatingButtonTargetContainer);
  }
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  let lastCheck = 0;
  let lastComposerInput = null;
  const THROTTLE_MS = 500;
  const observer = new MutationObserver(() => {
    const now = Date.now();
    if (now - lastCheck < THROTTLE_MS) return;
    lastCheck = now;
    
    AdapterBase.requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
      const inputChanged = lastComposerInput !== composer.input;
      if (inputChanged) {
        console.log("[Prompanion Bolt] DOM changed - input element changed, re-positioning button and tooltip", {
          oldInput: lastComposerInput?.tagName,
          newInput: composer.input?.tagName,
          newInputClass: composer.input?.className
        });
        lastComposerInput = composer.input;
        placeButton(composer.container, composer.input);
        setupEnhanceTooltip(composer.input, composer.container);
      } else {
        console.log("[Prompanion Bolt] DOM changed, re-positioning button");
        placeButton(composer.container, composer.input);
      }
    } else {
      lastComposerInput = null;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  
  // Also listen for focus events on textareas to catch when user switches to a different input
  document.addEventListener("focusin", (e) => {
    const target = e.target;
    const isInput = target instanceof HTMLTextAreaElement || 
                    (target instanceof HTMLElement && target.contentEditable === "true") ||
                    (target instanceof HTMLElement && target.classList?.contains('cm-content'));
    
    if (isInput) {
      console.log("[Prompanion Bolt] Focus detected on input element:", target.tagName, target.className);
      const composer = locateComposer();
      if (composer) {
        // Check if the focused element is the composer input or a child of it (for CodeMirror)
        const isComposerInput = composer.input === target || 
                                composer.input.contains(target) ||
                                target.closest('.cm-content') === composer.input;
        
        if (isComposerInput) {
          console.log("[Prompanion Bolt] Setting up enhance tooltip for newly focused input");
          // Always re-setup if the input has changed (e.g., switching from homepage to edit mode)
          if (enhanceTooltipActiveTextarea !== composer.input) {
            setupEnhanceTooltip(composer.input, composer.container);
          } else {
            // Even if it's the same input, re-bind events in case they were lost
            bindInputEvents(composer.input);
          }
        }
      }
    }
  }, true);
  
  domObserverStarted = true;
}

function locateComposer() {
  console.log("[Prompanion Bolt] locateComposer() called");
  // Bolt-specific composer selectors - adjust based on actual DOM structure
  const wrappers = [
    "textarea[placeholder*='message']",
    "textarea[placeholder*='Message']", 
    "form[class*='composer']",
    "div[class*='input']",
    "div[class*='composer']",
    "main form"
  ].map(sel => document.querySelector(sel)).filter(Boolean);
  console.log("[Prompanion Bolt] locateComposer() - found wrappers:", wrappers.length);
  let input = null;
  for (const wrapper of wrappers) {
    const editable = wrapper.querySelector("textarea, input[type='text'], [contenteditable='true'][role='textbox']") ??
                     wrapper.querySelector("div[contenteditable='true']");
    if (editable instanceof HTMLElement) { 
      input = editable; 
      console.log("[Prompanion Bolt] locateComposer() - found input in wrapper:", editable.tagName, editable.className);
      break; 
    }
  }
  if (!input) {
    const textarea = document.querySelector("textarea[placeholder*='message'], textarea[placeholder*='Message']");
    if (textarea instanceof HTMLTextAreaElement) {
      input = textarea;
      console.log("[Prompanion Bolt] locateComposer() - found textarea directly:", textarea.className);
    }
  }
  if (!input) {
    console.log("[Prompanion Bolt] locateComposer() - no input found, trying broader search");
    // Try more generic selectors for Bolt.new
    const allTextareas = document.querySelectorAll("textarea");
    const allContentEditable = document.querySelectorAll("[contenteditable='true']");
    console.log("[Prompanion Bolt] locateComposer() - found textareas:", allTextareas.length, "contentEditable:", allContentEditable.length);
    
    // PRIORITIZE contentEditable elements - Bolt.new likely uses these for input
    for (const editable of allContentEditable) {
      if (editable instanceof HTMLElement) {
        const isVisible = editable.offsetParent !== null;
        const hasFocus = document.activeElement === editable;
        const hasText = (editable.textContent || editable.innerText || "").trim().length > 0;
        const isLikelyInput = editable.getAttribute("role") === "textbox" || 
                             editable.tagName === "DIV" ||
                             editable.classList.toString().includes("input") ||
                             editable.classList.toString().includes("composer");
        
        console.log("[Prompanion Bolt] locateComposer() - checking contentEditable:", {
          tagName: editable.tagName,
          className: editable.className,
          isVisible,
          hasFocus,
          hasText,
          isLikelyInput,
          role: editable.getAttribute("role")
        });
        
        // Prefer focused contentEditable, then visible ones that look like input fields
        if (hasFocus && isVisible) {
          input = editable;
          console.log("[Prompanion Bolt] locateComposer() - using focused contentEditable");
          break;
        } else if (isVisible && isLikelyInput && !input) {
          input = editable;
          console.log("[Prompanion Bolt] locateComposer() - using visible contentEditable input:", editable.className);
        }
      }
    }
    
    // Fallback to textarea if no contentEditable found
    if (!input) {
      for (const textarea of allTextareas) {
        if (textarea instanceof HTMLTextAreaElement) {
          const isVisible = textarea.offsetParent !== null;
          const isEnabled = !textarea.disabled && !textarea.readOnly;
          const hasFocus = document.activeElement === textarea;
          console.log("[Prompanion Bolt] locateComposer() - checking textarea:", {
            className: textarea.className,
            isVisible,
            isEnabled,
            hasFocus,
            disabled: textarea.disabled,
            readOnly: textarea.readOnly
          });
          
          // Prefer focused textarea, then visible and enabled
          if (hasFocus && isEnabled) {
            input = textarea;
            console.log("[Prompanion Bolt] locateComposer() - using focused textarea");
            break;
          } else if (isVisible && isEnabled && !input) {
            input = textarea;
            console.log("[Prompanion Bolt] locateComposer() - using visible enabled textarea:", textarea.className);
          }
        }
      }
    }
  }
  if (!input) {
    console.warn("[Prompanion Bolt] locateComposer() - no input found");
    return null;
  }
  const container = input.closest("[data-testid='composer-footer']") ??
                    input.closest("[data-testid='composer-container']") ??
                    input.parentElement ?? document.body;
  console.log("[Prompanion Bolt] locateComposer() - returning:", {
    input: input.tagName,
    container: container.tagName
  });
  return { input, container };
}

function init() {
  console.log("[Prompanion Bolt] init() called");
  const composer = locateComposer();
  console.log("[Prompanion Bolt] locateComposer() returned:", composer ? "found" : "not found");
  if (composer) {
    console.log("[Prompanion Bolt] Composer found:", {
      input: composer.input?.tagName,
      inputClass: composer.input?.className,
      container: composer.container?.tagName,
      containerClass: composer.container?.className
    });
  }
  AdapterBase.requestSelectionToolbarUpdate();
  if (composer) {
    placeButton(composer.container, composer.input);
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    
    // If this is a CodeMirror element (edit mode), ensure events are set up even if not focused yet
    if (composer.input?.classList?.contains('cm-content')) {
      console.log("[Prompanion Bolt] init() - detected CodeMirror (edit mode), ensuring tooltip is ready");
      // Force a check after a short delay to catch any initial text
      setTimeout(() => {
        if (enhanceTooltipActiveTextarea === composer.input) {
          handleInputChange();
        }
      }, 500);
    }
    
    return true;
  }
  console.log("[Prompanion Bolt] Composer not found, setting up observer");
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
  console.log("[Prompanion Bolt] bootstrap() called");
  
  // Clean up any old toolbar elements that might exist
  const oldToolbars = document.querySelectorAll(`#${SELECTION_TOOLBAR_ID}`);
  oldToolbars.forEach(toolbar => {
    // Check if it's the old style (has the old class structure)
    if (toolbar.querySelector('.prompanion-selection-toolbar__dismiss')) {
      console.log("[Prompanion Bolt] Removing old selection toolbar element");
      toolbar.remove();
    }
  });
  
  ensureHighlightObserver();
  initSelectionToolbar(); // Initialize the selection toolbar system
  if (!init()) {
    console.log("[Prompanion Bolt] bootstrap() - init() returned false, setting up MutationObserver");
    const observer = new MutationObserver(() => {
      if (init()) {
        console.log("[Prompanion Bolt] bootstrap() - composer found on retry, disconnecting observer");
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } else {
    console.log("[Prompanion Bolt] bootstrap() - init() returned true, composer found immediately");
  }
}

// Generic tooltip functions have been moved to AdapterBase
// Use AdapterBase.attachTooltip(), AdapterBase.showTooltip(), etc.

function setupEnhanceTooltip(input, container) {
  console.log("[Prompanion Bolt] setupEnhanceTooltip called", {
    input: input?.tagName,
    inputClass: input?.className,
    alreadyActive: enhanceTooltipActiveTextarea === input,
    isCodeMirror: input?.classList?.contains('cm-content')
  });
  if (!input) {
    console.log("[Prompanion Bolt] setupEnhanceTooltip - skipping (no input)");
    return;
  }
  
  // If the input has changed (e.g., switching from homepage textarea to edit mode CodeMirror),
  // we need to re-setup even if we had a previous input
  const inputChanged = enhanceTooltipActiveTextarea !== input;
  
  if (!inputChanged) {
    console.log("[Prompanion Bolt] setupEnhanceTooltip - same input, checking if events are still bound");
    // Even if it's the same input, re-bind events in case they were lost (e.g., DOM replacement)
    if (!input._prompanionInputHandler) {
      console.log("[Prompanion Bolt] setupEnhanceTooltip - events lost, re-binding");
      bindInputEvents(input);
    } else {
      console.log("[Prompanion Bolt] setupEnhanceTooltip - events still bound, skipping");
      return;
    }
  } else {
    console.log("[Prompanion Bolt] setupEnhanceTooltip - input changed, re-setting up");
    teardownEnhanceTooltip();
    enhanceTooltipActiveTextarea = input;
    enhanceTooltipDismissed = false;
    lastEnhanceTextSnapshot = "";
    ensureEnhanceTooltipElement();
    bindInputEvents(input);
  }
  console.log("[Prompanion Bolt] setupEnhanceTooltip - complete");
}

function teardownEnhanceTooltip() {
  if (enhanceTooltipActiveTextarea) {
    // Remove listeners using stored handlers if available
    if (enhanceTooltipActiveTextarea._prompanionInputHandler) {
      enhanceTooltipActiveTextarea.removeEventListener("input", enhanceTooltipActiveTextarea._prompanionInputHandler, true);
      enhanceTooltipActiveTextarea.removeEventListener("keyup", enhanceTooltipActiveTextarea._prompanionKeyupHandler, true);
      enhanceTooltipActiveTextarea.removeEventListener("focus", enhanceTooltipActiveTextarea._prompanionFocusHandler, true);
      delete enhanceTooltipActiveTextarea._prompanionInputHandler;
      delete enhanceTooltipActiveTextarea._prompanionKeyupHandler;
      delete enhanceTooltipActiveTextarea._prompanionFocusHandler;
    } else {
      // Fallback to old method
      enhanceTooltipActiveTextarea.removeEventListener("input", handleInputChange);
      enhanceTooltipActiveTextarea.removeEventListener("keyup", handleInputChange);
      enhanceTooltipActiveTextarea.removeEventListener("focus", handleInputChange);
    }
    enhanceTooltipActiveTextarea.removeEventListener("blur", handleInputBlur, true);
    
    // Clean up MutationObserver for CodeMirror
    if (enhanceTooltipActiveTextarea._prompanionMutationObserver) {
      enhanceTooltipActiveTextarea._prompanionMutationObserver.disconnect();
      enhanceTooltipActiveTextarea._prompanionMutationObserver = null;
    }
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
      enhanceTooltipDismissedTime = Date.now();
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
  // Don't hide tooltip yet - wait to see if there's a limit error
  console.log("[Prompanion] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        if (result?.reason === "EXTENSION_CONTEXT_INVALIDATED") {
        console.error("[Prompanion Bolt] Cannot enhance prompt - extension context invalidated. Please reload the page.");
        enhanceTooltipDismissed = true;
        enhanceTooltipDismissedTime = Date.now();
        hideEnhanceTooltip();
        } else if (result?.error === "LIMIT_REACHED") {
          // Show upgrade button in tooltip instead of hiding
          console.log("[Prompanion] Limit reached, showing upgrade button");
          showUpgradeButtonInTooltip();
        } else {
          // Other errors - hide tooltip normally
          enhanceTooltipDismissed = true;
          enhanceTooltipDismissedTime = Date.now();
          hideEnhanceTooltip();
        }
        return;
      }
      // Success - hide tooltip and set text
      enhanceTooltipDismissed = true;
      enhanceTooltipDismissedTime = Date.now();
      hideEnhanceTooltip();
      const refinedText = result.optionA && typeof result.optionA === "string" && result.optionA.trim()
        ? result.optionA.trim() 
        : promptText;
      setComposerText(composerNode, refinedText);
      enhanceActionInFlight = false;
    })
    .catch((error) => {
      console.error("Prompanion: refine request threw", error);
      enhanceActionInFlight = false;
      enhanceTooltipDismissed = true;
      enhanceTooltipDismissedTime = Date.now();
      hideEnhanceTooltip();
    });
}

function bindInputEvents(input) {
  // Check if it's CodeMirror (cm-content) OR if it's the edit mode textarea
  const isCodeMirror = input?.classList?.contains('cm-content');
  const isEditModeTextarea = input instanceof HTMLTextAreaElement && 
                             input.closest('div[class*="cm-editor"]') !== null;
  const isRegularTextarea = input instanceof HTMLTextAreaElement && !isEditModeTextarea;
  
  console.log("[Prompanion Bolt] bindInputEvents called for:", {
    tagName: input?.tagName,
    className: input?.className,
    disabled: input?.disabled,
    readOnly: input?.readOnly,
    value: input?.value?.substring(0, 50),
    isCodeMirror: isCodeMirror,
    isEditModeTextarea: isEditModeTextarea,
    isRegularTextarea: isRegularTextarea
  });
  
  // Remove old listeners
  if (input._prompanionInputHandler) {
    input.removeEventListener("input", input._prompanionInputHandler, true);
    input.removeEventListener("keyup", input._prompanionKeyupHandler, true);
    input.removeEventListener("focus", input._prompanionFocusHandler, true);
  } else {
    input.removeEventListener("input", handleInputChange);
    input.removeEventListener("keyup", handleInputChange);
    input.removeEventListener("focus", handleInputChange);
  }
  input.removeEventListener("blur", handleInputBlur, true);
  
  // Clean up existing MutationObserver for CodeMirror
  if (input._prompanionMutationObserver) {
    input._prompanionMutationObserver.disconnect();
    input._prompanionMutationObserver = null;
  }
  
  // Clean up CodeMirror-specific handlers
  if (input._prompanionCodeMirrorStopPolling) {
    input._prompanionCodeMirrorStopPolling();
  }
  if (input._prompanionCodeMirrorPollingInterval) {
    clearInterval(input._prompanionCodeMirrorPollingInterval);
  }
  
  if (input._prompanionCodeMirrorKeydown) {
    document.removeEventListener("keydown", input._prompanionCodeMirrorKeydown, true);
    if (input._prompanionCodeMirrorEditor) {
      input._prompanionCodeMirrorEditor.removeEventListener("keydown", input._prompanionCodeMirrorKeydown, true);
    }
    delete input._prompanionCodeMirrorKeydown;
  }
  if (input._prompanionCodeMirrorKeyup) {
    document.removeEventListener("keyup", input._prompanionCodeMirrorKeyup, true);
    if (input._prompanionCodeMirrorEditor) {
      input._prompanionCodeMirrorEditor.removeEventListener("keyup", input._prompanionCodeMirrorKeyup, true);
    }
    delete input._prompanionCodeMirrorKeyup;
  }
  if (input._prompanionCodeMirrorPaste) {
    document.removeEventListener("paste", input._prompanionCodeMirrorPaste, true);
    if (input._prompanionCodeMirrorEditor) {
      input._prompanionCodeMirrorEditor.removeEventListener("paste", input._prompanionCodeMirrorPaste, true);
    }
    delete input._prompanionCodeMirrorPaste;
  }
  if (input._prompanionCodeMirrorFocus) {
    if (input._prompanionCodeMirrorEditor) {
      input._prompanionCodeMirrorEditor.removeEventListener("focus", input._prompanionCodeMirrorFocus, true);
    }
    delete input._prompanionCodeMirrorFocus;
  }
  if (input._prompanionCodeMirrorBlur) {
    if (input._prompanionCodeMirrorEditor) {
      input._prompanionCodeMirrorEditor.removeEventListener("blur", input._prompanionCodeMirrorBlur, true);
    }
    delete input._prompanionCodeMirrorBlur;
  }
  if (input._prompanionCodeMirrorEditor) {
    delete input._prompanionCodeMirrorEditor;
  }
  delete input._prompanionCodeMirrorPollingInterval;
  delete input._prompanionCodeMirrorStartPolling;
  delete input._prompanionCodeMirrorStopPolling;
  
  // Add new listeners with capture to ensure we catch events
  const inputHandler = (e) => {
    console.log("[Prompanion Bolt] Input event fired:", e.type, "target:", e.target?.tagName);
    handleInputChange();
  };
  const keyupHandler = (e) => {
    console.log("[Prompanion Bolt] Keyup event fired:", e.key);
    handleInputChange();
  };
  const focusHandler = () => {
    console.log("[Prompanion Bolt] Focus event fired");
    handleInputChange();
  };
  
  input.addEventListener("input", inputHandler, true);
  input.addEventListener("keyup", keyupHandler, true);
  input.addEventListener("focus", focusHandler, true);
  input.addEventListener("blur", handleInputBlur, true);
  
  // Store handlers for cleanup
  input._prompanionInputHandler = inputHandler;
  input._prompanionKeyupHandler = keyupHandler;
  input._prompanionFocusHandler = focusHandler;
  
  // For CodeMirror or edit mode textarea, use multiple detection methods since it might not fire standard input events reliably
  if (isCodeMirror || isEditModeTextarea) {
    console.log("[Prompanion Bolt] bindInputEvents - setting up CodeMirror/edit mode textarea-specific listeners");
    
    // Find the CodeMirror editor container (cm-editor or cm-scroller) for better event handling
    // For regular textarea, use the textarea itself
    const codeMirrorEditor = isCodeMirror 
      ? (input.closest('.cm-editor') || input.closest('.cm-scroller') || input)
      : input;
    console.log("[Prompanion Bolt] Editor container:", {
      tagName: codeMirrorEditor?.tagName,
      className: codeMirrorEditor?.className,
      isCodeMirror: isCodeMirror,
      isEditModeTextarea: isEditModeTextarea
    });
    
    // Method 1: MutationObserver with less aggressive throttling
    let mutationTimeout = null;
    input._prompanionMutationObserver = new MutationObserver((mutations) => {
      // Throttle MutationObserver callbacks to avoid excessive calls
      if (mutationTimeout) {
        clearTimeout(mutationTimeout);
      }
      mutationTimeout = setTimeout(() => {
        const textLength = extractInputText().length;
        console.log("[Prompanion Bolt] CodeMirror content changed (MutationObserver)", {
          mutationCount: mutations.length,
          textLength: textLength
        });
        if (textLength > 0) { // Only process if there's actual text
          handleInputChange();
        }
      }, 50); // Reduced delay for more responsive detection
    });
    
    input._prompanionMutationObserver.observe(input, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: false
    });
    
    // Method 2: Polling mechanism - check text content periodically when CodeMirror is focused
    let lastTextContent = "";
    let pollingInterval = null;
    
    const startPolling = () => {
      if (pollingInterval) {
        console.log("[Prompanion Bolt] Polling already active, skipping");
        return; // Already polling
      }
      console.log("[Prompanion Bolt] Starting polling for", isCodeMirror ? "CodeMirror" : "edit mode textarea");
      lastTextContent = extractInputText(); // Initialize with current text
      pollingInterval = setInterval(() => {
        const activeElement = document.activeElement;
        // For textarea, check if it's the active element or if it's visible
        // For CodeMirror, check if active element is within the editor
        const isActive = isEditModeTextarea
          ? (activeElement === input || input.offsetParent !== null)
          : (codeMirrorEditor.contains(activeElement) || 
             activeElement === codeMirrorEditor ||
             activeElement === input ||
             input.contains(activeElement) ||
             (activeElement?.closest && activeElement.closest('.cm-editor') === codeMirrorEditor));
        
        // Always check text content, even if not focused (focus detection might be unreliable)
        const currentText = extractInputText();
        if (currentText !== lastTextContent) {
          console.log("[Prompanion Bolt] Text changed (polling)", {
            oldLength: lastTextContent.length,
            newLength: currentText.length,
            isActive,
            activeElementTag: activeElement?.tagName,
            inputType: isCodeMirror ? "CodeMirror" : "textarea"
          });
          lastTextContent = currentText;
          handleInputChange();
        }
        
        // Don't stop polling - CodeMirror focus detection is unreliable
        // Keep polling continuously to catch all text changes
      }, 200); // Check every 200ms
    };
    
    const stopPolling = () => {
      if (pollingInterval) {
        console.log("[Prompanion Bolt] Stopping CodeMirror polling");
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };
    
    // Method 3: Key events on document level (CodeMirror might intercept events)
    const codeMirrorKeyHandler = (e) => {
      // Check if the active element is within our CodeMirror editor
      const activeElement = document.activeElement;
      const isInCodeMirror = codeMirrorEditor.contains(activeElement) || 
                            activeElement === codeMirrorEditor ||
                            activeElement === input ||
                            input.contains(activeElement) ||
                            (activeElement?.closest && activeElement.closest('.cm-editor') === codeMirrorEditor);
      
      if (isInCodeMirror) {
        console.log("[Prompanion Bolt] CodeMirror key event:", e.type, e.key, "activeElement:", activeElement?.tagName);
        // Start polling if not already started
        if (!pollingInterval) {
          startPolling();
        }
        // Also trigger immediate check
        setTimeout(() => {
          handleInputChange();
        }, 50);
      }
    };
    
    const codeMirrorPasteHandler = (e) => {
      const activeElement = document.activeElement;
      const isInCodeMirror = codeMirrorEditor.contains(activeElement) || 
                            activeElement === codeMirrorEditor ||
                            activeElement === input ||
                            input.contains(activeElement);
      
      if (isInCodeMirror) {
        console.log("[Prompanion Bolt] CodeMirror paste event");
        if (!pollingInterval) {
          startPolling();
        }
        setTimeout(() => {
          handleInputChange();
        }, 50);
      }
    };
    
    const codeMirrorFocusHandler = () => {
      console.log("[Prompanion Bolt] CodeMirror focus event");
      startPolling();
      // Initial check
      setTimeout(() => {
        handleInputChange();
      }, 100);
    };
    
    const codeMirrorBlurHandler = () => {
      console.log("[Prompanion Bolt] CodeMirror blur event");
      stopPolling();
    };
    
    // Attach to document level to catch all events
    document.addEventListener("keydown", codeMirrorKeyHandler, true);
    document.addEventListener("keyup", codeMirrorKeyHandler, true);
    document.addEventListener("paste", codeMirrorPasteHandler, true);
    
    // Also attach to the editor container as backup
    codeMirrorEditor.addEventListener("keydown", codeMirrorKeyHandler, true);
    codeMirrorEditor.addEventListener("keyup", codeMirrorKeyHandler, true);
    codeMirrorEditor.addEventListener("paste", codeMirrorPasteHandler, true);
    codeMirrorEditor.addEventListener("focus", codeMirrorFocusHandler, true);
    codeMirrorEditor.addEventListener("blur", codeMirrorBlurHandler, true);
    
    // Start polling immediately - CodeMirror might be focused but focus events might not fire
    console.log("[Prompanion Bolt] Starting CodeMirror polling immediately");
    startPolling();
    
    // Also check if already focused
    const activeElement = document.activeElement;
    const isCurrentlyFocused = codeMirrorEditor.contains(activeElement) || 
                              activeElement === codeMirrorEditor ||
                              activeElement === input ||
                              input.contains(activeElement);
    console.log("[Prompanion Bolt] CodeMirror focus check:", {
      isCurrentlyFocused,
      activeElementTag: activeElement?.tagName,
      activeElementClass: activeElement?.className
    });
    
    // Store handlers and editor reference for cleanup
    input._prompanionCodeMirrorEditor = codeMirrorEditor;
    input._prompanionCodeMirrorKeydown = codeMirrorKeyHandler;
    input._prompanionCodeMirrorKeyup = codeMirrorKeyHandler;
    input._prompanionCodeMirrorPaste = codeMirrorPasteHandler;
    input._prompanionCodeMirrorFocus = codeMirrorFocusHandler;
    input._prompanionCodeMirrorBlur = codeMirrorBlurHandler;
    input._prompanionCodeMirrorPollingInterval = pollingInterval;
    input._prompanionCodeMirrorStartPolling = startPolling;
    input._prompanionCodeMirrorStopPolling = stopPolling;
  }
  
  console.log("[Prompanion Bolt] bindInputEvents - event listeners attached, calling handleInputChange()");
  handleInputChange();
}

function extractInputText() {
  if (!enhanceTooltipActiveTextarea) return "";
  
  // Handle textarea/input elements first (most common case)
  if (enhanceTooltipActiveTextarea instanceof HTMLTextAreaElement || 
      enhanceTooltipActiveTextarea instanceof HTMLInputElement) {
    return enhanceTooltipActiveTextarea.value || "";
  }
  
  // Handle CodeMirror elements (cm-content)
  if (enhanceTooltipActiveTextarea.classList?.contains('cm-content')) {
    // CodeMirror stores text in the textContent of the cm-content div
    const text = enhanceTooltipActiveTextarea.textContent || enhanceTooltipActiveTextarea.innerText || "";
    return text.trim();
  }
  
  // Handle contentEditable elements
  if (enhanceTooltipActiveTextarea.contentEditable === "true") {
    return (enhanceTooltipActiveTextarea.textContent || enhanceTooltipActiveTextarea.innerText || "").trim();
  }
  
  // Fallback
  return "value" in enhanceTooltipActiveTextarea
    ? enhanceTooltipActiveTextarea.value
    : enhanceTooltipActiveTextarea.textContent ?? "";
}

function handleInputChange() {
  if (!enhanceTooltipActiveTextarea) {
    console.log("[Prompanion Bolt] handleInputChange - no active textarea");
    return;
  }
  const rawText = extractInputText();
  const text = (rawText.startsWith("window.__oai") || rawText.includes("__oai_logHTML") ? "" : rawText).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  console.log("[Prompanion Bolt] handleInputChange - wordCount:", wordCount, "text length:", text.length);
  if (wordCount < 3) {
    console.log("[Prompanion Bolt] handleInputChange - wordCount < 3, hiding tooltip");
    hideEnhanceTooltip();
    enhanceTooltipDismissed = false;
    clearTimeout(enhanceTooltipTimer);
    enhanceTooltipTimer = null;
    lastEnhanceTextSnapshot = "";
    return;
  }
  if (enhanceTooltipDismissed && text === lastEnhanceTextSnapshot) {
    console.log("[Prompanion Bolt] handleInputChange - tooltip dismissed and text unchanged");
    return;
  }
  // Don't reset dismissed flag if it was recently dismissed (within cooldown period)
  const timeSinceDismiss = Date.now() - enhanceTooltipDismissedTime;
  if (enhanceTooltipDismissed && timeSinceDismiss < ENHANCE_TOOLTIP_DISMISS_COOLDOWN_MS) {
    console.log("[Prompanion Bolt] handleInputChange - tooltip recently dismissed, not resetting flag");
    return;
  }
  lastEnhanceTextSnapshot = text;
  enhanceTooltipDismissed = false;
  console.log("[Prompanion Bolt] handleInputChange - scheduling tooltip (wordCount >= 3)");
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
    console.log("[Prompanion Bolt] scheduleEnhanceTooltip - timeout fired");
    if (!enhanceTooltipActiveTextarea) {
      console.log("[Prompanion Bolt] scheduleEnhanceTooltip - no active textarea, returning");
      return;
    }
    const wordCount = extractInputText().trim().split(/\s+/).filter(Boolean).length;
    console.log("[Prompanion Bolt] scheduleEnhanceTooltip - wordCount:", wordCount, "dismissed:", enhanceTooltipDismissed);
    if (wordCount >= 3 && !enhanceTooltipDismissed) {
      console.log("[Prompanion Bolt] scheduleEnhanceTooltip - calling showEnhanceTooltip()");
      showEnhanceTooltip();
    } else {
      console.log("[Prompanion Bolt] scheduleEnhanceTooltip - not showing (wordCount < 3 or dismissed)");
    }
  }, 1000);
}

function showEnhanceTooltip() {
  console.log("[Prompanion Bolt] showEnhanceTooltip() called");
  if (!enhanceTooltipElement) {
    console.log("[Prompanion Bolt] showEnhanceTooltip - creating tooltip element");
    ensureEnhanceTooltipElement();
    if (!enhanceTooltipElement) {
      console.warn("[Prompanion Bolt] showEnhanceTooltip - failed to create tooltip element");
      return;
    }
  }
  
  // Ensure tooltip is in the DOM
  if (!enhanceTooltipElement.isConnected) {
    console.log("[Prompanion Bolt] showEnhanceTooltip - appending tooltip to body");
    document.body.append(enhanceTooltipElement);
  }
  
  console.log("[Prompanion Bolt] showEnhanceTooltip - positioning tooltip");
  positionEnhanceTooltip();
  
  // Make sure tooltip is visible
  enhanceTooltipElement.classList.add("is-visible");
  enhanceTooltipElement.style.display = "block";
  enhanceTooltipElement.style.visibility = "visible";
  enhanceTooltipElement.style.opacity = "1";
  enhanceTooltipElement.style.pointerEvents = "auto";
  
  const computedStyle = getComputedStyle(enhanceTooltipElement);
  console.log("[Prompanion Bolt] showEnhanceTooltip - tooltip made visible", {
    classList: enhanceTooltipElement.classList.toString(),
    isConnected: enhanceTooltipElement.isConnected,
    display: computedStyle.display,
    visibility: computedStyle.visibility,
    opacity: computedStyle.opacity,
    zIndex: computedStyle.zIndex,
    position: computedStyle.position,
    top: computedStyle.top,
    left: computedStyle.left,
    rect: enhanceTooltipElement.getBoundingClientRect()
  });
  
  attachTooltipResizeHandler();
}

function hideEnhanceTooltip() {
  if (!enhanceTooltipElement) return;
  // Don't hide if it's showing upgrade button
  if (enhanceTooltipElement.classList.contains("show-upgrade")) {
    return;
  }
  // Clear any pending timer
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = null;
  enhanceTooltipElement.classList.remove("is-visible");
  // Clear inline styles that were set by showEnhanceTooltip()
  enhanceTooltipElement.style.display = "none";
  enhanceTooltipElement.style.visibility = "hidden";
  enhanceTooltipElement.style.opacity = "0";
  enhanceTooltipElement.style.pointerEvents = "none";
  detachTooltipResizeHandler();
  console.log("[Prompanion Bolt] hideEnhanceTooltip - tooltip hidden");
}

function showUpgradeButtonInTooltip() {
  // Ensure tooltip element exists and is visible
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
  }
  if (!enhanceTooltipElement) {
    console.error("[Prompanion] Cannot show upgrade button - tooltip element not found");
    return;
  }
  
  // Make sure tooltip is visible first
  if (!enhanceTooltipElement.classList.contains("is-visible")) {
    enhanceTooltipElement.classList.add("is-visible");
    positionEnhanceTooltip();
    attachTooltipResizeHandler();
  }
  
  // Remove existing dismiss button if it exists (we'll add a new one)
  const oldDismiss = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__dismiss");
  if (oldDismiss) {
    oldDismiss.remove();
  }
  
  // Add dismiss button (X) for closing the upgrade tooltip
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "prompanion-enhance-tooltip__dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss upgrade prompt");
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enhanceTooltipDismissed = true;
    enhanceTooltipDismissedTime = Date.now();
    enhanceTooltipElement.classList.remove("show-upgrade");
    hideEnhanceTooltip();
  });
  
  // Change action button to upgrade button
  const action = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__action");
  if (action) {
    // Remove old click handlers by cloning
    const newAction = action.cloneNode(true);
    action.replaceWith(newAction);
    
    // Update the new button
    newAction.className = "prompanion-enhance-tooltip__action prompanion-enhance-tooltip__upgrade";
    AdapterBase.setButtonTextContent(newAction, "Upgrade for more uses!");
    
    // Add upgrade click handler
    newAction.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("[Prompanion] Upgrade button clicked - placeholder for Stripe integration");
      // TODO: Navigate to Stripe upgrade page
      // window.open("https://stripe.com/upgrade", "_blank");
    });
    
    // Insert dismiss button before the upgrade button
    newAction.parentNode.insertBefore(dismiss, newAction);
  }
  
  // Add class to prevent auto-hide
  enhanceTooltipElement.classList.add("show-upgrade");
  enhanceTooltipDismissed = false; // Reset dismissed flag so tooltip stays visible
}

function positionEnhanceTooltip() {
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) {
    console.warn("[Prompanion Bolt] positionEnhanceTooltip - missing element or textarea");
    return;
  }
  
  // Check if we're in editing mode (CodeMirror editor)
  const isEditingMode = enhanceTooltipActiveTextarea.classList && enhanceTooltipActiveTextarea.classList.contains('cm-content');
  
  const rect = enhanceTooltipActiveTextarea.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = enhanceTooltipElement.offsetWidth || 200; // Estimate if not yet rendered
  const tooltipHeight = enhanceTooltipElement.offsetHeight || 60; // Estimate if not yet rendered
  
  // Calculate position - center horizontally above the input
  let left = rect.left + (rect.width * 0.5);
  let top = rect.top - 8;
  
  // Ensure tooltip stays within viewport bounds
  const minLeft = tooltipWidth / 2;
  const maxLeft = viewportWidth - (tooltipWidth / 2);
  left = Math.max(minLeft, Math.min(maxLeft, left));
  
  // In editing mode, ALWAYS position above (even if it goes slightly above viewport)
  if (isEditingMode) {
    // Force position above - don't check viewport bounds
    enhanceTooltipElement.style.transform = "translate(-50%, -100%)";
    // If it would go above viewport, adjust top but keep it above
    if (top - tooltipHeight < 0) {
      top = tooltipHeight + 8; // Position at top of viewport with padding
    }
  } else {
    // Normal mode: position above if there's space, otherwise below
  if (top - tooltipHeight < 0) {
    top = rect.bottom + 8;
    enhanceTooltipElement.style.transform = "translate(-50%, 0%)";
  } else {
    enhanceTooltipElement.style.transform = "translate(-50%, -100%)";
  }
  
  // Ensure tooltip doesn't go below viewport
  if (top + tooltipHeight > viewportHeight) {
    top = viewportHeight - tooltipHeight - 8;
    }
  }
  
  enhanceTooltipElement.style.top = `${top}px`;
  enhanceTooltipElement.style.left = `${left}px`;
  enhanceTooltipElement.style.position = "fixed";
  enhanceTooltipElement.style.zIndex = "2147483000";
  
  // Ensure tooltip is visible
  enhanceTooltipElement.style.display = "block";
  enhanceTooltipElement.style.visibility = "visible";
  enhanceTooltipElement.style.opacity = "1";
  enhanceTooltipElement.style.pointerEvents = "auto";
  
  console.log("[Prompanion Bolt] positionEnhanceTooltip - positioned at:", { 
    top, 
    left, 
    isEditingMode,
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    viewport: { width: viewportWidth, height: viewportHeight },
    tooltipSize: { width: tooltipWidth, height: tooltipHeight },
    elementVisible: enhanceTooltipElement.offsetParent !== null,
    elementDisplay: getComputedStyle(enhanceTooltipElement).display,
    elementVisibility: getComputedStyle(enhanceTooltipElement).visibility
  });
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

/**
 * Detects if we're in editor mode
 * @returns {boolean} True if in editor mode
 */
function isBoltEditorMode() {
  // Check if there's a CodeMirror editor (cm-content) or edit mode textarea
  const hasCodeMirror = document.querySelector('.cm-content') !== null;
  const hasEditModeTextarea = document.querySelector('textarea') && 
                              document.querySelector('textarea').closest('div[class*="cm-editor"]') !== null;
  return hasCodeMirror || hasEditModeTextarea;
}

/**
 * Finds Bolt.new's main layout container using XPath
 * Same XPath works for both homepage and editor mode
 * @returns {HTMLElement|null} The main container element or null
 */
function findBoltMainContainer() {
  const inEditorMode = isBoltEditorMode();
  console.log('[Prompanion Bolt] Finding container, editor mode:', inEditorMode);
  
  // Same XPath works for both modes: //*[@id="root"]/div[2]
  try {
    const xpathResult = document.evaluate(
      '//*[@id="root"]/div[2]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const container = xpathResult.singleNodeValue;
    if (container instanceof HTMLElement) {
      console.log('[Prompanion Bolt] Container found via XPath (mode:', inEditorMode ? 'editor' : 'homepage', '):', container);
      return container;
    }
  } catch (error) {
    console.warn('[Prompanion Bolt] XPath evaluation error:', error);
  }
  
  // Fallback to querySelector
  const container = document.querySelector('#root > div:nth-child(2)') ||
                    document.querySelector('#root > div:last-child');
  if (container) {
    console.log('[Prompanion Bolt] Container found via fallback (mode:', inEditorMode ? 'editor' : 'homepage', '):', container);
    return container;
  }
  
  console.warn('[Prompanion Bolt] Container not found');
  return null;
}

/**
 * Applies push effect to Bolt.new's main container
 * @param {boolean} shouldPush - Whether to apply or remove the push
 */
function applyBoltContainerPush(shouldPush) {
  const container = findBoltMainContainer();
  if (!container) {
    console.warn('[Prompanion Bolt] Container not found, cannot apply push');
    return;
  }
  
  const panelWidthCalc = 'min(546px, 94vw)';
  
  if (shouldPush) {
    // Store original styles if they exist
    const computedStyle = window.getComputedStyle(container);
    const currentWidth = computedStyle.width;
    const currentMaxWidth = computedStyle.maxWidth;
    
    if (!container.dataset.prompanionOriginalWidth) {
      container.dataset.prompanionOriginalWidth = currentWidth || '';
    }
    if (!container.dataset.prompanionOriginalMaxWidth) {
      container.dataset.prompanionOriginalMaxWidth = currentMaxWidth || '';
    }
    
    // Override width directly to force the container to shrink
    // The w-full class sets width: 100%, so we need to override it with !important
    const currentBoxSizing = computedStyle.boxSizing;
    if (!container.dataset.prompanionOriginalBoxSizing) {
      container.dataset.prompanionOriginalBoxSizing = currentBoxSizing || 'border-box';
    }
    
    // Use requestAnimationFrame to ensure our styles are applied after any other style changes
    requestAnimationFrame(() => {
      // Override width, max-width, and flex-basis to ensure it shrinks
      container.style.setProperty('width', `calc(100% - ${panelWidthCalc})`, 'important');
      container.style.setProperty('max-width', `calc(100% - ${panelWidthCalc})`, 'important');
      container.style.setProperty('flex-basis', `calc(100% - ${panelWidthCalc})`, 'important');
      container.style.setProperty('box-sizing', 'border-box', 'important');
      container.style.setProperty('transition', 'width 160ms ease-in-out, max-width 160ms ease-in-out, flex-basis 160ms ease-in-out, box-sizing 160ms ease-in-out');
      
      // Double-check after a short delay to ensure styles stick
      setTimeout(() => {
        const currentWidth = window.getComputedStyle(container).width;
        if (currentWidth && !currentWidth.includes('calc')) {
          console.warn('[Prompanion Bolt] Width was overridden, re-applying...', { currentWidth });
          container.style.setProperty('width', `calc(100% - ${panelWidthCalc})`, 'important');
          container.style.setProperty('max-width', `calc(100% - ${panelWidthCalc})`, 'important');
          container.style.setProperty('flex-basis', `calc(100% - ${panelWidthCalc})`, 'important');
        }
      }, 50);
    });
    
    container.dataset.prompanionPushed = 'true';
    
    console.log('[Prompanion Bolt] Applied push to container (overriding width + max-width + flex-basis):', {
      container,
      width: `calc(100% - ${panelWidthCalc})`,
      maxWidth: `calc(100% - ${panelWidthCalc})`,
      flexBasis: `calc(100% - ${panelWidthCalc})`,
      originalWidth: currentWidth,
      originalMaxWidth: currentMaxWidth,
      boxSizing: 'border-box'
    });
  } else {
    // Restore original styles
    if (container.dataset.prompanionPushed === 'true') {
      const originalWidth = container.dataset.prompanionOriginalWidth;
      const originalMaxWidth = container.dataset.prompanionOriginalMaxWidth;
      const originalBoxSizing = container.dataset.prompanionOriginalBoxSizing;
      
      if (originalWidth) {
        container.style.setProperty('width', originalWidth, 'important');
      } else {
        container.style.removeProperty('width');
      }
      
      if (originalMaxWidth) {
        container.style.setProperty('max-width', originalMaxWidth, 'important');
      } else {
        container.style.removeProperty('max-width');
      }
      
      // Remove flex-basis we added
      container.style.removeProperty('flex-basis');
      
      if (originalBoxSizing) {
        container.style.setProperty('box-sizing', originalBoxSizing, 'important');
      } else {
        container.style.removeProperty('box-sizing');
      }
      
      container.style.removeProperty('transition');
      delete container.dataset.prompanionPushed;
      delete container.dataset.prompanionOriginalWidth;
      delete container.dataset.prompanionOriginalMaxWidth;
      delete container.dataset.prompanionOriginalBoxSizing;
      
      console.log('[Prompanion Bolt] Removed push from container');
    }
  }
}

/**
 * Checks if the side panel is currently visible
 * @returns {boolean} True if panel is visible
 */
function isPanelVisible() {
  const panelContainer = document.getElementById('prompanion-sidepanel-container');
  return panelContainer && panelContainer.classList.contains('prompanion-sidepanel-visible');
}

/**
 * Updates the container push based on panel visibility
 */
function updateBoltContainerPush() {
  const visible = isPanelVisible();
  const inEditorMode = isBoltEditorMode();
  console.log('[Prompanion Bolt] Panel visibility changed:', {
    visible,
    editorMode: inEditorMode,
    location: window.location.href
  });
  applyBoltContainerPush(visible);
}

// Also observe the panel container directly for visibility changes
function observePanelVisibility() {
  const panelContainer = document.getElementById('prompanion-sidepanel-container');
  if (!panelContainer) {
    // Panel not created yet, try again later
    setTimeout(observePanelVisibility, 500);
    return;
  }
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        console.log('[Prompanion Bolt] Panel class changed, updating container push');
        updateBoltContainerPush();
      }
    });
  });
  
  observer.observe(panelContainer, {
    attributes: true,
    attributeFilter: ['class']
  });
  
  // Also observe the container for style changes to re-apply our styles if overridden
  const container = findBoltMainContainer();
  if (container) {
    const styleObserver = new MutationObserver(() => {
      if (container.dataset.prompanionPushed === 'true' && isPanelVisible()) {
        // Re-apply styles if they were overridden
        const computedWidth = window.getComputedStyle(container).width;
        if (computedWidth && !computedWidth.includes('calc')) {
          console.log('[Prompanion Bolt] Container width was overridden, re-applying push styles');
          const panelWidthCalc = 'min(546px, 94vw)';
          container.style.setProperty('width', `calc(100% - ${panelWidthCalc})`, 'important');
          container.style.setProperty('max-width', `calc(100% - ${panelWidthCalc})`, 'important');
          container.style.setProperty('flex-basis', `calc(100% - ${panelWidthCalc})`, 'important');
        }
      }
    });
    
    styleObserver.observe(container, {
      attributes: true,
      attributeFilter: ['style']
    });
  }
  
  // Initial check
  console.log('[Prompanion Bolt] Running initial container push check');
  updateBoltContainerPush();
  
  console.log('[Prompanion Bolt] Panel visibility observer set up');
}

// Start observing when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observePanelVisibility);
} else {
  observePanelVisibility();
}

// Listen for panel resize events (fired when panel opens/closes)
window.addEventListener("prompanion-panel-resize", () => {
  refreshFloatingButtonPosition();
  updateBoltContainerPush();
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

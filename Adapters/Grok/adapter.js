// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[PromptProfile™ Grok] ========== GROK ADAPTER LOADING ==========");
console.log("[PromptProfile™ Grok] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™ Grok] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[PromptProfile™ Grok] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before Grok adapter.js");
}

const BUTTON_ID = AdapterBase.BUTTON_ID;
const BUTTON_CLASS = AdapterBase.BUTTON_CLASS;
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const HIGHLIGHT_BUTTON_SELECTORS = AdapterBase.HIGHLIGHT_BUTTON_SELECTORS;
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

console.log("[PromptProfile™ Grok] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
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
  // Grok doesn't have native highlight buttons like ChatGPT, so return null
  // This will prevent conflicts with Grok's UI
  return null;
}

function nodeInAssistantMessage(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  
  // Grok-specific selectors for assistant messages
  // Try multiple strategies to handle platform differences (Mac vs Windows)
  // Strategy 1: Check for explicit data attributes (most reliable)
  if (element.closest("[data-role='assistant']") ||
      element.closest("[data-author='assistant']") ||
      element.closest("[data-message-author-role='assistant']")) {
    return true;
  }
  
  // Strategy 2: Check for class names containing "assistant" (case-insensitive)
  // Walk up the DOM tree to find assistant markers
  let current = element;
  let depth = 0;
  while (current && depth < 10) {
    const className = current.className;
    if (typeof className === 'string') {
      // Case-insensitive check for "assistant" in class name
      const lowerClassName = className.toLowerCase();
      if (lowerClassName.includes('assistant') && 
          !lowerClassName.includes('user') &&
          !lowerClassName.includes('composer') &&
          !lowerClassName.includes('input')) {
        return true;
      }
    }
    
    // Check data attributes on current element
    if (current.getAttribute) {
      const dataRole = current.getAttribute('data-role');
      const dataAuthor = current.getAttribute('data-author');
      const dataMessageRole = current.getAttribute('data-message-author-role');
      if (dataRole === 'assistant' || dataAuthor === 'assistant' || dataMessageRole === 'assistant') {
        return true;
      }
    }
    
    current = current.parentElement;
    depth++;
  }
  
  // Strategy 3: Check if we're in main content area but NOT in composer
  // This is a fallback for when explicit markers aren't available
  const mainElement = element.closest("main");
  if (mainElement) {
    // If we're in main but NOT in composer, and NOT in user input areas, likely assistant
    const inComposer = element.closest(".query-bar") || 
                      element.closest(".tiptap") || 
                      element.closest("form");
    if (!inComposer) {
      // Check if there are message-like structures nearby
      const hasMessageStructure = mainElement.querySelector("[class*='message'], [class*='turn'], article");
      if (hasMessageStructure) {
        // Additional check: make sure we're not in a user message area
        const inUserMessage = element.closest("[data-role='user']") ||
                             element.closest("[data-author='user']") ||
                             element.closest("[class*='user'][class*='message']");
        if (!inUserMessage) {
          return true; // Likely assistant message
        }
      }
    }
  }
  
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
  // Grok doesn't have highlight buttons, so no observer needed
  // But we can still observe for selection changes
  if (highlightObserver || !document.body) return;
  highlightObserver = new MutationObserver(() => {
    requestSelectionToolbarUpdate();
  });
  highlightObserver.observe(document.body, { childList: true, subtree: true });
  
  // CRITICAL: Also listen for selectionchange events to ensure toolbar updates on Windows
  // This is especially important for cross-platform compatibility
  if (!document._promptprofileGrokSelectionListener) {
    document._promptprofileGrokSelectionListener = () => {
      requestSelectionToolbarUpdate();
    };
    document.addEventListener("selectionchange", document._promptprofileGrokSelectionListener);
    console.log("[PromptProfile™ Grok] Selection change listener registered");
  }
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  
  // Grok-specific selectors for composer
  // Based on the image: Tiptap/ProseMirror editor with query-bar container
  return !!(
    element.closest(".query-bar") ||
    element.closest(".tiptap") ||
    element.closest(".ProseMirror") ||
    element.closest("form")?.querySelector(".tiptap")
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
    console.error("[PromptProfile™ Grok] Cannot create selection toolbar: document.body not available");
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
  
  // Enhanced debugging for Windows compatibility
  const inComposer = selection ? selectionWithinComposer(selection) : false;
  const targetsAssistant = selection ? selectionTargetsAssistant(selection) : false;
  
  // Detailed debugging for assistant detection
  let assistantDebugInfo = null;
  if (selection && !selection.isCollapsed) {
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    assistantDebugInfo = {
      anchorNodeType: anchorNode?.nodeType,
      anchorNodeName: anchorNode?.nodeName,
      focusNodeType: focusNode?.nodeType,
      focusNodeName: focusNode?.nodeName,
      anchorInAssistant: anchorNode ? nodeInAssistantMessage(anchorNode) : false,
      focusInAssistant: focusNode ? nodeInAssistantMessage(focusNode) : false,
      anchorElement: anchorNode ? AdapterBase.getElementFromNode(anchorNode) : null,
      focusElement: focusNode ? AdapterBase.getElementFromNode(focusNode) : null
    };
    
    // Try to find what element contains the selection
    try {
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const commonAncestor = range.commonAncestorContainer;
        assistantDebugInfo.commonAncestorType = commonAncestor?.nodeType;
        assistantDebugInfo.commonAncestorName = commonAncestor?.nodeName;
        assistantDebugInfo.commonAncestorInAssistant = commonAncestor ? nodeInAssistantMessage(commonAncestor) : false;
        
        // Walk up to find parent elements with classes
        let current = AdapterBase.getElementFromNode(commonAncestor);
        const parentClasses = [];
        let depth = 0;
        while (current && depth < 5) {
          if (current.className && typeof current.className === 'string') {
            parentClasses.push(current.className);
          }
          if (current.getAttribute) {
            const dataRole = current.getAttribute('data-role');
            const dataAuthor = current.getAttribute('data-author');
            if (dataRole || dataAuthor) {
              parentClasses.push(`data-role="${dataRole}" data-author="${dataAuthor}"`);
            }
          }
          current = current.parentElement;
          depth++;
        }
        assistantDebugInfo.parentClasses = parentClasses;
      }
    } catch (e) {
      assistantDebugInfo.rangeError = e.message;
    }
  }
  
  console.log("[PromptProfile™ Grok] updateSelectionToolbar called", {
    hasSelection: !!selection,
    isCollapsed: selection?.isCollapsed,
    textLength: text?.length,
    textPreview: text?.substring(0, 30),
    inComposer: inComposer,
    targetsAssistant: targetsAssistant,
    assistantDebugInfo: assistantDebugInfo
  });
  
  if (!selection || selection.isCollapsed || !text || inComposer || !targetsAssistant) {
    const reasons = [];
    if (!selection) reasons.push("no selection");
    if (selection?.isCollapsed) reasons.push("collapsed selection");
    if (!text) reasons.push("no text");
    if (inComposer) reasons.push("in composer");
    if (!targetsAssistant) reasons.push("not targeting assistant");
    console.log("[PromptProfile™ Grok] Hiding toolbar - conditions not met:", reasons.join(", "));
    hideSelectionToolbar();
    return;
  }
  
  console.log("[PromptProfile™ Grok] Showing toolbar - all conditions met");
  const rangeRect = AdapterBase.getSelectionRect(selection);
  if (!rangeRect) {
    hideSelectionToolbar();
    return;
  }

  const toolbar = ensureSelectionToolbar();
  if (!toolbar) {
    console.error("[PromptProfile™ Grok] Failed to create selection toolbar");
    return;
  }
  selectionToolbarText = text;
  
  // Position tooltip BELOW the selection to avoid conflict with Grok's UI
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
    console.warn("[PromptProfile™ Grok] Toolbar has invalid dimensions:", { w, h }, "retrying...");
    // Force another reflow and remeasure
    void toolbar.offsetWidth;
    w = toolbar.offsetWidth;
    h = toolbar.offsetHeight;
    if (!w || !h) {
      console.error("[PromptProfile™ Grok] Toolbar dimensions still invalid, cannot position tooltip");
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

function captureGrokChatHistory(maxMessages = 20) {
  // Make these logs VERY visible
  console.log("%c[PromptProfile™ Grok] ========== captureGrokChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Grok] ========== captureGrokChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Grok] ========== captureGrokChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[PromptProfile™ Grok] Current URL:", window.location.href);
  console.log("[PromptProfile™ Grok] Document ready state:", document.readyState);
  console.log("[PromptProfile™ Grok] Timestamp:", new Date().toISOString());
  
  // Check if we're on a conversation page
  const isConversationPage = window.location.href.includes("/c/") || 
                            window.location.href.includes("/chat") ||
                            document.querySelector("main, [role='main']");
  console.log("[PromptProfile™ Grok] Is conversation page:", isConversationPage);
  
  const messages = [];
  
  try {
    // First, try to find the main conversation container (Grok uses main element)
    const mainContainer = document.querySelector("main");
    console.log("[PromptProfile™ Grok] Main container found:", !!mainContainer);
    
    // Determine the best search root - prefer main container, then document
    let searchRoot = document;
    if (mainContainer) {
      searchRoot = mainContainer;
      console.log("[PromptProfile™ Grok] Using main container as search root");
      console.log("[PromptProfile™ Grok] Main container details:", {
        tagName: mainContainer.tagName,
        className: mainContainer.className,
        childCount: mainContainer.children.length,
        innerHTMLLength: mainContainer.innerHTML.length,
        hasText: (mainContainer.innerText || mainContainer.textContent || "").trim().length > 0
      });
    } else {
      console.warn("[PromptProfile™ Grok] ⚠️ Main container not found - searching entire document");
    }
    
    // Grok-specific selectors - try multiple patterns to handle DOM changes
    const assistantSelectors = [
      "[data-role='assistant']",
      "[data-author='assistant']",
      "[data-message-author-role='assistant']",
      "div[data-role='assistant']",
      "article[data-role='assistant']",
      "[class*='assistant'][class*='message']",
      "[class*='assistant'][class*='turn']",
      "div[class*='assistant-message']",
      "div[class*='assistant-turn']",
      "[class*='assistant']"
    ];
    
    const userSelectors = [
      "[data-role='user']",
      "[data-author='user']",
      "[data-message-author-role='user']",
      "div[data-role='user']",
      "article[data-role='user']",
      "[class*='user'][class*='message']",
      "[class*='user'][class*='turn']",
      "div[class*='user-message']",
      "div[class*='user-turn']",
      "[class*='user'][class*='message']"
    ];
    
    console.log("[PromptProfile™ Grok] Searching for messages with multiple selector strategies");
    
    // Try each selector pattern and combine results
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Grok] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Grok] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[PromptProfile™ Grok] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[PromptProfile™ Grok] Selector failed: ${selector}`, e);
      }
    }
    
    console.log("[PromptProfile™ Grok] Final element counts after standard selectors:", {
      assistantCount: assistantElements.length,
      userCount: userElements.length,
      totalElements: assistantElements.length + userElements.length
    });
    
    // If no elements found with standard selectors, try searching within main container
    if (assistantElements.length === 0 && userElements.length === 0 && mainContainer) {
      console.warn("[PromptProfile™ Grok] ⚠️ No messages found with standard selectors, searching within main container...");
      
      // Look for all divs within main that might be messages
      const allDivsInMain = mainContainer.querySelectorAll("div");
      console.log(`[PromptProfile™ Grok] Found ${allDivsInMain.length} divs within main container`);
      
      // Look for message-like structures - Grok messages are typically in nested divs
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
      
      console.log(`[PromptProfile™ Grok] Found ${potentialMessages.length} potential message divs in main`);
      
      // Sort potential messages by their position in the DOM (top to bottom)
      const sortedMessages = potentialMessages.sort((a, b) => {
        const posA = getElementPosition(a);
        const posB = getElementPosition(b);
        return posA - posB;
      });
      
      // Use alternating pattern: Grok typically starts with user, then assistant, etc.
      // First message in conversation is usually user
      for (let i = 0; i < sortedMessages.length && (assistantElements.length + userElements.length) < maxMessages * 2; i++) {
        const msg = sortedMessages[i];
        const text = (msg.innerText || msg.textContent || "").trim();
        
        if (text.length > 20) {
          // Check for explicit markers first
          const hasAssistantMarker = msg.querySelector("[class*='assistant']") || 
                                   msg.getAttribute("data-author") === "assistant" ||
                                   msg.closest("[data-message-author-role='assistant']") ||
                                   msg.className?.includes("assistant") ||
                                   msg.getAttribute("data-role") === "assistant" ||
                                   msg.querySelector("[data-message-author-role='assistant']");
          
          const hasUserMarker = msg.querySelector("[class*='user']") || 
                              msg.getAttribute("data-author") === "user" ||
                              msg.closest("[data-message-author-role='user']") ||
                              msg.className?.includes("user") ||
                              msg.getAttribute("data-role") === "user" ||
                              msg.querySelector("[data-message-author-role='user']");
          
          // If we have clear markers, use them
          if (hasAssistantMarker && assistantElements.length < maxMessages) {
            assistantElements.push(msg);
            console.log(`[PromptProfile™ Grok] Added assistant message from main search (${text.substring(0, 50)}...)`);
          } else if (hasUserMarker && userElements.length < maxMessages) {
            userElements.push(msg);
            console.log(`[PromptProfile™ Grok] Added user message from main search (${text.substring(0, 50)}...)`);
          } else {
            // No clear markers - use alternating pattern
            // Grok conversations typically start with user, then assistant, then user, etc.
            const totalFound = assistantElements.length + userElements.length;
            if (totalFound % 2 === 0 && userElements.length < maxMessages) {
              // Even index (0, 2, 4...) = user message
              userElements.push(msg);
              console.log(`[PromptProfile™ Grok] Added user message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            } else if (assistantElements.length < maxMessages) {
              // Odd index (1, 3, 5...) = assistant message
              assistantElements.push(msg);
              console.log(`[PromptProfile™ Grok] Added assistant message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            }
          }
        }
      }
      
      console.log(`[PromptProfile™ Grok] After main search: ${assistantElements.length} assistant, ${userElements.length} user messages`);
    }
    
    // If still no elements found, try alternative approach with other containers
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[PromptProfile™ Grok] ⚠️ Still no messages found, trying broader search...");
      
      // Try finding messages by looking for conversation containers
      const conversationContainers = document.querySelectorAll("main, [role='main'], [class*='conversation'], [class*='chat'], [id*='conversation'], [id*='chat']");
      console.log("[PromptProfile™ Grok] Found conversation containers:", conversationContainers.length);
      
      // Log container structure for debugging
      if (conversationContainers.length > 0) {
        const firstContainer = conversationContainers[0];
        console.log("[PromptProfile™ Grok] First container structure:", {
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
        console.log(`[PromptProfile™ Grok] Found ${potentialMessages.length} potential message elements in container`);
        
        // Try to identify role by looking for common patterns
        for (const msg of potentialMessages) {
          const text = (msg.innerText || msg.textContent || "").trim();
          if (text.length > 10) {
            // Heuristic: if it contains common assistant patterns, it's likely assistant
            const isLikelyAssistant = msg.querySelector("[class*='assistant']") || 
                                     msg.getAttribute("data-author") === "assistant" ||
                                     msg.closest("[data-message-author-role='assistant']") ||
                                     msg.className?.includes("assistant") ||
                                     msg.getAttribute("data-role") === "assistant";
            
            if (isLikelyAssistant && assistantElements.length < maxMessages) {
              assistantElements.push(msg);
              console.log(`[PromptProfile™ Grok] Added assistant element from fallback search`);
            } else if (!isLikelyAssistant && userElements.length < maxMessages) {
              userElements.push(msg);
              console.log(`[PromptProfile™ Grok] Added user element from fallback search`);
            }
          }
        }
      }
    }
    
    // Last resort: search for any divs with substantial text that might be messages
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[PromptProfile™ Grok] ⚠️ Still no messages found, trying last-resort search...");
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
      console.log(`[PromptProfile™ Grok] Last-resort search found ${foundCount} potential messages`);
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
    
    console.log("[PromptProfile™ Grok] Processing", allElements.length, "message elements");
    
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
            console.log(`[PromptProfile™ Grok] Extracted content using selector "${selector}": ${content.substring(0, 50)}...`);
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
          console.log(`[PromptProfile™ Grok] Added ${role} message (${content.length} chars): ${content.substring(0, 50)}...`);
        } else {
          console.log(`[PromptProfile™ Grok] Skipped ${role} message - too short or UI-only: "${content.substring(0, 30)}"`);
        }
      } else {
        console.warn(`[PromptProfile™ Grok] Could not extract content from ${role} message element:`, {
          tagName: el.tagName,
          className: el.className,
          hasChildren: el.children.length > 0,
          innerTextLength: (el.innerText || "").length,
          textContentLength: (el.textContent || "").length
        });
      }
    }
    
    console.log(`[PromptProfile™ Grok] ✓ Captured ${messages.length} messages from Grok conversation`);
    if (messages.length === 0) {
      console.warn("[PromptProfile™ Grok] ⚠️ No messages captured - check if conversation elements exist in DOM");
      console.warn("[PromptProfile™ Grok] DOM Diagnostic Info:", {
        bodyChildren: document.body?.children?.length || 0,
        mainElements: document.querySelectorAll("main").length,
        articles: document.querySelectorAll("article").length,
        divsWithDataRole: document.querySelectorAll("div[data-role], div[data-author], div[data-message-author-role]").length,
        allDivs: document.querySelectorAll("div").length,
        sampleDivClasses: Array.from(document.querySelectorAll("div")).slice(0, 10).map(d => d.className).filter(c => c),
        url: window.location.href
      });
      
      // Try one more aggressive search: look for any divs with substantial text that might be messages
      console.warn("[PromptProfile™ Grok] Attempting final aggressive search for message-like content...");
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
      
      console.warn(`[PromptProfile™ Grok] Found ${allTextDivs.length} potential message divs in final search`);
      if (allTextDivs.length > 0) {
        console.warn("[PromptProfile™ Grok] Sample divs found:", allTextDivs.slice(0, 5).map(div => ({
          className: div.className,
          id: div.id,
          textPreview: (div.innerText || div.textContent || "").substring(0, 100),
          dataAttributes: Array.from(div.attributes).filter(attr => attr.name.startsWith("data-")).map(attr => `${attr.name}="${attr.value}"`)
        })));
      }
    }
    return messages;
  } catch (error) {
    console.error("[PromptProfile™ Grok] ✗ Error capturing Grok chat history:", error);
    console.error("[PromptProfile™ Grok] Error details:", {
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
  console.log("%c[PromptProfile™ Grok] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Grok] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[PromptProfile™ Grok] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[PromptProfile™ Grok] Snippet:", snippet?.substring(0, 50));
  console.log("[PromptProfile™ Grok] selectionAskInFlight:", selectionAskInFlight);
  
  if (!snippet || selectionAskInFlight) {
    console.log("[PromptProfile™ Grok] Exiting early - snippet:", !!snippet, "inFlight:", selectionAskInFlight);
    return;
  }
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from Grok conversation for context
    let chatHistory = [];
    console.log("%c[PromptProfile™ Grok] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureGrokChatHistory(20);
      console.log(`%c[PromptProfile™ Grok] ✓ Captured ${chatHistory.length} messages from conversation for SideChat context`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      
      // Log sample of captured history for debugging
      if (chatHistory.length > 0) {
        console.log("[PromptProfile™ Grok] Sample captured messages:", {
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
        console.warn("[PromptProfile™ Grok] ⚠️ captureGrokChatHistory returned empty array - no messages found in DOM");
      }
    } catch (error) {
      console.error("[PromptProfile™ Grok] ✗ Failed to capture chat history:", error);
      console.error("[PromptProfile™ Grok] Error stack:", error.stack);
      // Continue with empty array - better than failing completely
      chatHistory = [];
    }
    
    console.log("[PromptProfile™ Grok] ========== SENDING PROMPANION_SIDECHAT_REQUEST ==========");
    console.log("[PromptProfile™ Grok] Sending PROMPANION_SIDECHAT_REQUEST with:", {
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
      console.log("[PromptProfile™ Grok] ========== PROMPANION_SIDECHAT_REQUEST RESPONSE ==========");
      console.log("[PromptProfile™ Grok] Response:", response);
      if (!response?.ok) {
        console.warn("PromptProfile™: sidechat request rejected", response?.reason);
      }
      selectionAskInFlight = false;
    }).catch((error) => {
      console.warn("PromptProfile™: failed to request sidechat from selection", error);
      selectionAskInFlight = false;
    });
  } catch (error) {
    console.error("PromptProfile™ Grok: sidechat request threw synchronously", error);
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
        console.error("[PromptProfile™ Grok] Extension context invalidated - user should reload page");
        // The notification is already shown by AdapterBase._showContextInvalidatedNotification()
      } else {
        console.warn("[PromptProfile™ Grok] Enhancement request failed:", error);
      }
      return { ok: false, reason: errorMessage || "UNKNOWN_ERROR" };
    });
}

/**
 * Finds the active composer input node for Grok
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

  // Last resort: query for Grok-specific selectors
  const selectors = [
    ".tiptap.ProseMirror[contenteditable='true']",
    ".ProseMirror[contenteditable='true']",
    ".tiptap[contenteditable='true']",
    "div.query-bar .tiptap",
    "form .tiptap.ProseMirror",
    "[contenteditable='true'].tiptap"
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
// This wrapper maintains Grok-specific logging
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
    .catch((e) => console.error("PromptProfile™ Grok: failed to open sidebar", e)));
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
  // Removed the !inputNode gatekeeper that caused the 20s delay
  console.log("[PromptProfile™ Grok] placeButton called");
  
  ensureFloatingButton();
  if (!floatingButtonWrapper) return;

  if (inputNode) {
    floatingButtonTargetInput = inputNode;
    floatingButtonTargetContainer = targetContainer ?? inputNode;
  }
  
  // Call positioning immediately
  positionFloatingButton(inputNode, targetContainer);
}

let isPositioningLoopActive = false;

function positionFloatingButton(inputNode = null, containerNode = null) {
  // Ensure only one positioning loop is ever running
  if (isPositioningLoopActive && !inputNode && !containerNode) return;
  if (!isPositioningLoopActive) isPositioningLoopActive = true;

  if (!floatingButtonWrapper) {
    ensureFloatingButton();
    if (!floatingButtonWrapper) {
      requestAnimationFrame(() => positionFloatingButton());
      return;
    }
  }
  
  // THE ONE AND ONLY TARGET: The Speak/Input Button
  let target = null;
  try {
    const xpath = '//form//div/div/div[2]/div[2]/div[2]/div[2]/button';
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const el = result.singleNodeValue;
    
    if (el && el.offsetParent !== null) {
      target = el;
    }
  } catch (e) {}

  if (!target) {
    requestAnimationFrame(() => positionFloatingButton());
    return;
  }

  const rect = target.getBoundingClientRect();
  
  // Ignore invalid/initial coordinates to prevent top-right placement
  if (rect.width === 0 || rect.height === 0 || (rect.top === 0 && rect.left === 0)) {
    requestAnimationFrame(() => positionFloatingButton());
    return;
  }

  // --- POSITIONING: 10px to the RIGHT of the speak/input button ---
  const leftPos = rect.right + 10;
  const topPos = rect.top + (rect.height / 2);

  if (floatingButtonWrapper.parentElement !== document.body) {
    document.body.append(floatingButtonWrapper);
  }

  Object.assign(floatingButtonWrapper.style, {
    position: "fixed",
    left: `${leftPos}px`,
    right: "auto",
    top: `${topPos}px`,
    bottom: "auto",
    transform: "translateY(-50%)",
    margin: "0",
    display: "flex",
    zIndex: "2147483000",
    visibility: "visible",
    opacity: "1"
  });

  // Zero-lag tracking
  requestAnimationFrame(() => positionFloatingButton());
}

function refreshFloatingButtonPosition() {
  // Always recalculate position based on whatever is visible
  positionFloatingButton(floatingButtonTargetInput, null);
}

// Throttle MutationObserver callbacks
let lastObserverCall = 0;
const OBSERVER_THROTTLE_MS = 200; // Throttle observer to once per 200ms

function ensureDomObserver() {
  if (domObserverStarted) return;
  const observer = new MutationObserver(() => {
    // Throttle observer callbacks
    const now = Date.now();
    if (now - lastObserverCall < OBSERVER_THROTTLE_MS) {
      return;
    }
    lastObserverCall = now;
    
    requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
      setupEnhanceTooltip(composer.input, composer.container);
    }
    // Sticky button doesn't need position refresh
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  // Grok-specific composer location based on DOM structure from image
  // Form > query-bar > tiptap/ProseMirror editor
  const form = document.querySelector("form");
  if (form) {
    // Look for Tiptap/ProseMirror editor inside the form
    const editor = form.querySelector(".tiptap.ProseMirror") ||
                   form.querySelector(".ProseMirror") ||
                   form.querySelector(".tiptap[contenteditable='true']") ||
                   form.querySelector("div[contenteditable='true'].tiptap");
    
    if (editor instanceof HTMLElement) {
      // Find the query-bar container
      const queryBar = editor.closest(".query-bar") || editor.closest("form");
      return {
        input: editor,
        container: queryBar || form || editor.parentElement || document.body
      };
    }
  }
  
  // Fallback: search for Tiptap/ProseMirror editor directly
  const editor = document.querySelector(".tiptap.ProseMirror[contenteditable='true']") ||
                 document.querySelector(".ProseMirror[contenteditable='true']") ||
                 document.querySelector(".tiptap[contenteditable='true']");
  
  if (editor instanceof HTMLElement) {
    const queryBar = editor.closest(".query-bar");
    const form = editor.closest("form");
    return {
      input: editor,
      container: queryBar || form || editor.parentElement || document.body
    };
  }
  
  return null;
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
    console.log("[PromptProfile™ Grok] ========== INSERT TEXT REQUEST ==========");
    console.log("[PromptProfile™ Grok] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    console.log("[PromptProfile™ Grok] Text length:", textToInsert.length);
    
    if (!textToInsert) {
      console.log("[PromptProfile™ Grok] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[PromptProfile™ Grok] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[PromptProfile™ Grok] Composer node found:", composerNode);
    console.log("[PromptProfile™ Grok] Node type:", composerNode?.constructor?.name);
    console.log("[PromptProfile™ Grok] Node isContentEditable:", composerNode?.isContentEditable);
    console.log("[PromptProfile™ Grok] Node tagName:", composerNode?.tagName);
    console.log("[PromptProfile™ Grok] Node className:", composerNode?.className);
    console.log("[PromptProfile™ Grok] Node visible:", composerNode ? (composerNode.offsetParent !== null) : false);
    console.log("[PromptProfile™ Grok] Node current value:", composerNode ? (composerNode.value || composerNode.textContent || "").substring(0, 50) : "");
    
    if (!composerNode) {
      console.log("[PromptProfile™ Grok] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[PromptProfile™ Grok] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[PromptProfile™ Grok] setComposerText returned:", success);
    
    // Verify insertion
    const currentValue = composerNode.value || composerNode.textContent || "";
    const textInserted = currentValue.includes(textToInsert.substring(0, Math.min(20, textToInsert.length)));
    console.log("[PromptProfile™ Grok] Verification - text appears in node:", textInserted);
    console.log("[PromptProfile™ Grok] Current node value:", currentValue.substring(0, 100));
    
    if (success && textInserted) {
      console.log("[PromptProfile™ Grok] Insert succeeded!");
      sendResponse({ ok: true });
    } else if (success && !textInserted) {
      console.warn("[PromptProfile™ Grok] setComposerText returned true but text not verified in node");
      sendResponse({ ok: false, reason: "INSERTION_NOT_VERIFIED" });
    } else {
      console.log("[PromptProfile™ Grok] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false; // sendResponse called synchronously, close channel
  } catch (error) {
    console.error("[PromptProfile™ Grok] Insert text handler failed", error);
    console.error("[PromptProfile™ Grok] Error stack:", error.stack);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false; // sendResponse called synchronously, close channel
  }
}

// Register message handler using AdapterBase (must be after handleInsertTextMessage is defined)
console.log("[PromptProfile™ Grok] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

function bootstrap() {
  ensureHighlightObserver();
  
  // IMMEDIATELY place the button on startup (removes the 20s delay)
  placeButton(null, null);
  
  // Separately watch for the editor/composer to appear for text injection
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
    console.log("[PromptProfile™ Grok] Creating enhance tooltip element");
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
    console.log("[PromptProfile™ Grok] Attaching click handler to Refine button");
    console.log("[PromptProfile™ Grok] handleRefineButtonClick function exists:", typeof handleRefineButtonClick);
    action.addEventListener("click", handleRefineButtonClick);
    console.log("[PromptProfile™ Grok] Click handler attached, button:", action);
    enhanceTooltipElement.append(dismiss, action);
    console.log("[PromptProfile™ Grok] Enhance tooltip element created");
  }
  if (!enhanceTooltipElement.isConnected) {
    console.log("[PromptProfile™ Grok] Appending enhance tooltip to body");
    document.body.append(enhanceTooltipElement);
  }
  hideEnhanceTooltip();
}

function handleRefineButtonClick(e) {
  console.log("[PromptProfile™ Grok] ========== REFINE BUTTON HANDLER FIRED ==========");
  console.log("[PromptProfile™ Grok] Event type:", e.type);
  console.log("[PromptProfile™ Grok] Event target:", e.target);
  
  // Don't handle clicks on upgrade button - let the upgrade handler deal with it
  const target = e.target;
  if (target && (target.classList.contains("promptprofile-enhance-tooltip__upgrade") || 
                  target.closest(".promptprofile-enhance-tooltip__upgrade"))) {
    console.log("[PromptProfile™ Grok] Upgrade button clicked, ignoring refine handler");
    return;
  }
  
  e.preventDefault();
  e.stopPropagation();
  if (enhanceActionInFlight) {
    return;
  }
  const composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  console.log("[PromptProfile™ Grok] Composer node:", composerNode);
  if (!composerNode) {
    console.error("[PromptProfile™ Grok] No composer node found!");
    return;
  }
  const promptText = extractInputText().trim();
  console.log("[PromptProfile™ Grok] Prompt text:", promptText);
  if (!promptText) {
    return;
  }
  enhanceActionInFlight = true;
  // Don't hide tooltip yet - wait to see if there's a limit error
  console.log("[PromptProfile™ Grok] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        if (result?.reason === "EXTENSION_CONTEXT_INVALIDATED") {
          console.error("[PromptProfile™ Grok] Cannot enhance prompt - extension context invalidated. Please reload the page.");
          enhanceTooltipDismissed = true;
          hideEnhanceTooltip();
        } else if (result?.error === "LIMIT_REACHED") {
          // Show upgrade button in tooltip instead of hiding
          console.log("[PromptProfile™ Grok] Limit reached, showing upgrade button");
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
      console.error("PromptProfile™ Grok: refine request threw", error);
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
  // Grok doesn't have the same debug patterns as ChatGPT, but filter out empty/whitespace
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

function showUpgradeButtonInTooltip() {
  // Ensure tooltip element exists and is visible
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
  }
  if (!enhanceTooltipElement) {
    console.error("[PromptProfile™ Grok] Cannot show upgrade button - tooltip element not found");
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
      console.log("[PromptProfile™ Grok] Upgrade button clicked, calling handleStripeCheckout");
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
  console.log("[PromptProfile™ Grok] ========== BACKUP MESSAGE LISTENER REGISTRATION ==========");
  console.log("[PromptProfile™ Grok] Current time:", new Date().toISOString());
  
  if (typeof chrome === "undefined") {
    console.error("[PromptProfile™ Grok] chrome is undefined in backup registration");
    return;
  }
  
  if (!chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[PromptProfile™ Grok] chrome.runtime.onMessage not available in backup registration");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message && message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[PromptProfile™ Grok] BACKUP LISTENER: PROMPANION_INSERT_TEXT received!");
        if (typeof handleInsertTextMessage === "function") {
          handleInsertTextMessage(message, sender, sendResponse);
        } else {
          console.error("[PromptProfile™ Grok] handleInsertTextMessage is not a function!");
          sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        }
        return true;
      }
      return false;
    });
    console.log("[PromptProfile™ Grok] ✓ Backup listener registered successfully");
  } catch (error) {
    console.error("[PromptProfile™ Grok] ✗ Backup listener registration failed:", error);
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
console.log("[PromptProfile™ Grok] ========== VERIFYING MESSAGE LISTENER ==========");
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  console.log("[PromptProfile™ Grok] chrome.runtime.onMessage is available");
  console.log("[PromptProfile™ Grok] chrome.runtime.id:", chrome.runtime.id);
  console.log("[PromptProfile™ Grok] chrome.runtime.getURL:", typeof chrome.runtime.getURL);
} else {
  console.error("[PromptProfile™ Grok] chrome.runtime.onMessage is NOT available at this point!");
}

window.addEventListener("promptprofile-panel-resize", () => {
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
    const button = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__action");
    const clickedButton = e.target.closest(".promptprofile-enhance-tooltip__action");
    if (clickedButton || button === e.target) {
      console.log("[PromptProfile™ Grok] ========== MOUSEDOWN DETECTED ON BUTTON ==========");
      console.log("[PromptProfile™ Grok] Setting tooltipClickInProgress flag");
      tooltipClickInProgress = true;
      const buttonRef = button;
      const mousedownTime = Date.now();
      
      const clickHandler = (clickEvent) => {
        const timeSinceMousedown = Date.now() - mousedownTime;
        console.log("[PromptProfile™ Grok] ========== CLICK AFTER MOUSEDOWN (direct handler) ==========");
        console.log("[PromptProfile™ Grok] Time since mousedown:", timeSinceMousedown, "ms");
        console.log("[PromptProfile™ Grok] Click target:", clickEvent.target);
        if (typeof handleRefineButtonClick === "function") {
          handleRefineButtonClick(clickEvent);
        }
        document.removeEventListener("click", clickHandler, true);
      };
      
      document.addEventListener("click", clickHandler, true);
      
      setTimeout(() => {
        tooltipClickInProgress = false;
        console.log("[PromptProfile™ Grok] tooltipClickInProgress flag cleared");
        document.removeEventListener("click", clickHandler, true);
      }, 300);
    }
  }
}, true);


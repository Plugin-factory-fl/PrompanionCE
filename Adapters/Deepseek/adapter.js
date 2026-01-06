// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[Prompanion Deepseek] ========== DEEPSEEK ADAPTER LOADING ==========");
console.log("[Prompanion Deepseek] Timestamp:", new Date().toISOString());
console.log("[Prompanion Deepseek] Location:", window.location.href);

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

console.log("[Prompanion Deepseek] Constants loaded from AdapterBase:", { BUTTON_ID, BUTTON_CLASS });
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
// Selection toolbar variables moved to AdapterBase
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
  
  // Deepseek-specific selectors - try multiple patterns
  const isAssistant = !!(
    element.closest("[data-role='assistant']") ||
    element.closest("[data-author='assistant']") ||
    element.closest("[data-message-author-role='assistant']") ||
    element.closest("[class*='assistant']") ||
    element.closest("[class*='bot']") ||
    element.closest("[class*='ai-message']") ||
    element.closest("[class*='ai-response']") ||
    element.closest("[class*='model']") ||
    element.closest("article[class*='assistant']") ||
    element.closest("div[class*='message'][class*='assistant']") ||
    element.closest("div[class*='response']") ||
    // Check if parent has assistant indicators
    (element.parentElement && (
      element.parentElement.getAttribute('data-role') === 'assistant' ||
      element.parentElement.getAttribute('data-author') === 'assistant' ||
      element.parentElement.className?.includes('assistant') ||
      element.parentElement.className?.includes('bot')
    )) ||
    // Check if we're in a message container that's not a user message
    (element.closest("div[class*='message']") && 
     !element.closest("[data-role='user']") &&
     !element.closest("[data-author='user']") &&
     !element.closest("[class*='user-message']") &&
     !element.closest("div[class*='message'][class*='user']"))
  );
  
  // Debug logging
  if (isAssistant) {
    console.log("[Prompanion Deepseek] nodeInAssistantMessage: TRUE", {
      element: element.tagName,
      className: element.className,
      closestAssistant: element.closest("[data-role='assistant'], [class*='assistant']")?.className
    });
  }
  
  return isAssistant;
}

function selectionTargetsAssistant(selection) {
  if (!selection) {
    console.log("[Prompanion Deepseek] selectionTargetsAssistant: no selection");
    return false;
  }
  
  const text = selection.toString().trim();
  if (!text) {
    console.log("[Prompanion Deepseek] selectionTargetsAssistant: no text");
    return false;
  }
  
  const anchorInAssistant = nodeInAssistantMessage(selection.anchorNode);
  const focusInAssistant = nodeInAssistantMessage(selection.focusNode);
  
  console.log("[Prompanion Deepseek] selectionTargetsAssistant check:", {
    hasSelection: !!selection,
    textLength: text.length,
    anchorInAssistant: anchorInAssistant,
    focusInAssistant: focusInAssistant,
    anchorNode: selection.anchorNode?.nodeName,
    focusNode: selection.focusNode?.nodeName
  });
  
  if (anchorInAssistant || focusInAssistant) {
    console.log("[Prompanion Deepseek] selectionTargetsAssistant: TRUE (anchor or focus in assistant)");
    return true;
  }
  
  try {
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (range) {
      const commonAncestorInAssistant = nodeInAssistantMessage(range.commonAncestorContainer);
      console.log("[Prompanion Deepseek] selectionTargetsAssistant check (common ancestor):", {
        commonAncestorInAssistant: commonAncestorInAssistant,
        commonAncestor: range.commonAncestorContainer?.nodeName
      });
      return commonAncestorInAssistant;
    }
  } catch (error) {
    console.warn("[Prompanion Deepseek] selectionTargetsAssistant error:", error);
  }
  
  return false;
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
  // Deepseek-specific composer selectors - adjust based on actual DOM structure
  return !!(
    element.closest("div[contenteditable='true']") ||
    element.closest("div[contenteditable='true'][role='textbox']") ||
    element.closest("textarea[placeholder*='message']") ||
    element.closest("textarea[placeholder*='Message']") ||
    element.closest("input[type='text'][placeholder*='message']") ||
    element.closest("form") ||
    element.closest("div[class*='input']") ||
    element.closest("div[class*='composer']")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

// Selection Toolbar system moved to AdapterBase
// Initialize it with Deepseek-specific condition functions
function initSelectionToolbar() {
  console.log("[Prompanion Deepseek] Initializing selection toolbar");
  AdapterBase.initSelectionToolbar({
    shouldShowToolbar: (selection) => {
      const text = selection?.toString().trim();
      const isCollapsed = selection?.isCollapsed;
      const inComposer = selection ? selectionWithinComposer(selection) : false;
      const targetsAssistant = selection ? selectionTargetsAssistant(selection) : false;
      
      const shouldShow = !!(selection && !isCollapsed && text && 
                            !inComposer && 
                            targetsAssistant);
      
      console.log("[Prompanion Deepseek] shouldShowToolbar check:", {
        hasSelection: !!selection,
        isCollapsed: isCollapsed,
        hasText: !!text,
        textLength: text?.length,
        inComposer: inComposer,
        targetsAssistant: targetsAssistant,
        shouldShow: shouldShow
      });
      
      return shouldShow;
    },
    onAction: (text) => {
      console.log("[Prompanion Deepseek] Selection toolbar action triggered with text:", text?.substring(0, 50));
      submitSelectionToSideChat(text);
    },
    buttonText: "Elaborate",
    toolbarId: SELECTION_TOOLBAR_ID,
    visibleClass: SELECTION_TOOLBAR_VISIBLE_CLASS
  });
  console.log("[Prompanion Deepseek] Selection toolbar initialized");
}

function captureDeepseekChatHistory(maxMessages = 20) {
  // Make these logs VERY visible
  console.log("%c[Prompanion Deepseek] ========== captureDeepseekChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion Deepseek] ========== captureDeepseekChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion Deepseek] ========== captureDeepseekChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[Prompanion Deepseek] Current URL:", window.location.href);
  console.log("[Prompanion Deepseek] Document ready state:", document.readyState);
  console.log("[Prompanion Deepseek] Timestamp:", new Date().toISOString());
  
  // Check if we're on a conversation page
  const isConversationPage = window.location.href.includes("/c/") || 
                            window.location.href.includes("/chat") ||
                            document.querySelector("main, [role='main']");
  console.log("[Prompanion Deepseek] Is conversation page:", isConversationPage);
  
  const messages = [];
  
  try {
    // First, try to find the main conversation container
    const mainContainer = document.querySelector("main") || document.querySelector("[role='main']");
    console.log("[Prompanion Deepseek] Main container found:", !!mainContainer);
    
    // Determine the best search root - prefer main container, then document
    let searchRoot = document;
    if (mainContainer) {
      searchRoot = mainContainer;
      console.log("[Prompanion Deepseek] Using main container as search root");
      console.log("[Prompanion Deepseek] Main container details:", {
        tagName: mainContainer.tagName,
        className: mainContainer.className,
        childCount: mainContainer.children.length,
        innerHTMLLength: mainContainer.innerHTML.length,
        hasText: (mainContainer.innerText || mainContainer.textContent || "").trim().length > 0
      });
    } else {
      console.warn("[Prompanion Deepseek] ⚠️ Main container not found - searching entire document");
    }
    
    // Deepseek-specific selectors - try multiple patterns to handle DOM changes
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
      "[class*='assistant']",
      "[class*='bot']",
      "[class*='ai-message']"
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
      "[class*='user'][class*='message']",
      "[class*='human']"
    ];
    
    console.log("[Prompanion Deepseek] Searching for messages with multiple selector strategies");
    
    // Try each selector pattern and combine results
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[Prompanion Deepseek] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[Prompanion Deepseek] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[Prompanion Deepseek] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[Prompanion Deepseek] Selector failed: ${selector}`, e);
      }
    }
    
    console.log("[Prompanion Deepseek] Final element counts after standard selectors:", {
      assistantCount: assistantElements.length,
      userCount: userElements.length,
      totalElements: assistantElements.length + userElements.length
    });
    
    // If no elements found with standard selectors, try searching within main container
    if (assistantElements.length === 0 && userElements.length === 0 && mainContainer) {
      console.warn("[Prompanion Deepseek] ⚠️ No messages found with standard selectors, searching within main container...");
      
      // Look for all divs within main that might be messages
      const allDivsInMain = mainContainer.querySelectorAll("div");
      console.log(`[Prompanion Deepseek] Found ${allDivsInMain.length} divs within main container`);
      
      // Look for message-like structures
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
      
      console.log(`[Prompanion Deepseek] Found ${potentialMessages.length} potential message divs in main`);
      
      // Sort potential messages by their position in the DOM (top to bottom)
      const sortedMessages = potentialMessages.sort((a, b) => {
        const posA = getElementPosition(a);
        const posB = getElementPosition(b);
        return posA - posB;
      });
      
      // Use alternating pattern: Deepseek typically starts with user, then assistant, etc.
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
                                   msg.querySelector("[data-message-author-role='assistant']") ||
                                   msg.className?.includes("bot") ||
                                   msg.className?.includes("ai-message");
          
          const hasUserMarker = msg.querySelector("[class*='user']") || 
                              msg.getAttribute("data-author") === "user" ||
                              msg.closest("[data-message-author-role='user']") ||
                              msg.className?.includes("user") ||
                              msg.getAttribute("data-role") === "user" ||
                              msg.querySelector("[data-message-author-role='user']") ||
                              msg.className?.includes("human");
          
          // If we have clear markers, use them
          if (hasAssistantMarker && assistantElements.length < maxMessages) {
            assistantElements.push(msg);
            console.log(`[Prompanion Deepseek] Added assistant message from main search (${text.substring(0, 50)}...)`);
          } else if (hasUserMarker && userElements.length < maxMessages) {
            userElements.push(msg);
            console.log(`[Prompanion Deepseek] Added user message from main search (${text.substring(0, 50)}...)`);
          } else {
            // No clear markers - use alternating pattern
            const totalFound = assistantElements.length + userElements.length;
            if (totalFound % 2 === 0 && userElements.length < maxMessages) {
              // Even index (0, 2, 4...) = user message
              userElements.push(msg);
              console.log(`[Prompanion Deepseek] Added user message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            } else if (assistantElements.length < maxMessages) {
              // Odd index (1, 3, 5...) = assistant message
              assistantElements.push(msg);
              console.log(`[Prompanion Deepseek] Added assistant message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            }
          }
        }
      }
      
      console.log(`[Prompanion Deepseek] After main search: ${assistantElements.length} assistant, ${userElements.length} user messages`);
    }
    
    // If still no elements found, try alternative approach with other containers
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[Prompanion Deepseek] ⚠️ Still no messages found, trying broader search...");
      
      // Try finding messages by looking for conversation containers
      const conversationContainers = document.querySelectorAll("main, [role='main'], [class*='conversation'], [class*='chat'], [id*='conversation'], [id*='chat']");
      console.log("[Prompanion Deepseek] Found conversation containers:", conversationContainers.length);
      
      // Log container structure for debugging
      if (conversationContainers.length > 0) {
        const firstContainer = conversationContainers[0];
        console.log("[Prompanion Deepseek] First container structure:", {
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
        console.log(`[Prompanion Deepseek] Found ${potentialMessages.length} potential message elements in container`);
        
        // Try to identify role by looking for common patterns
        for (const msg of potentialMessages) {
          const text = (msg.innerText || msg.textContent || "").trim();
          if (text.length > 10) {
            // Heuristic: if it contains common assistant patterns, it's likely assistant
            const isLikelyAssistant = msg.querySelector("[class*='assistant']") || 
                                     msg.getAttribute("data-author") === "assistant" ||
                                     msg.closest("[data-message-author-role='assistant']") ||
                                     msg.className?.includes("assistant") ||
                                     msg.getAttribute("data-role") === "assistant" ||
                                     msg.className?.includes("bot") ||
                                     msg.className?.includes("ai-message");
            
            if (isLikelyAssistant && assistantElements.length < maxMessages) {
              assistantElements.push(msg);
              console.log(`[Prompanion Deepseek] Added assistant element from fallback search`);
            } else if (!isLikelyAssistant && userElements.length < maxMessages) {
              userElements.push(msg);
              console.log(`[Prompanion Deepseek] Added user element from fallback search`);
            }
          }
        }
      }
    }
    
    // Last resort: search for any divs with substantial text that might be messages
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[Prompanion Deepseek] ⚠️ Still no messages found, trying last-resort search...");
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
            !div.closest("aside") &&
            div.children.length > 0) {
          // Try to determine role from context
          const parent = div.parentElement;
          const hasAssistantMarker = div.className?.includes("assistant") || 
                                    parent?.className?.includes("assistant") ||
                                    div.getAttribute("data-author") === "assistant" ||
                                    div.className?.includes("bot") ||
                                    div.className?.includes("ai-message");
          
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
      console.log(`[Prompanion Deepseek] Last-resort search found ${foundCount} potential messages`);
      
      // If still nothing found, try one more aggressive search
      if (foundCount === 0) {
        console.warn("[Prompanion Deepseek] Attempting final aggressive search for message-like content...");
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
        
        console.warn(`[Prompanion Deepseek] Found ${allTextDivs.length} potential message divs in final search`);
        if (allTextDivs.length > 0) {
          // Sort by position and use alternating pattern
          const sortedDivs = allTextDivs.sort((a, b) => {
            const posA = getElementPosition(a);
            const posB = getElementPosition(b);
            return posA - posB;
          });
          
          for (let i = 0; i < sortedDivs.length && (assistantElements.length + userElements.length) < maxMessages * 2; i++) {
            const div = sortedDivs[i];
            const text = (div.innerText || div.textContent || "").trim();
            
            if (text.length > 20) {
              const totalFound = assistantElements.length + userElements.length;
              // Use alternating pattern: user, assistant, user, assistant...
              if (totalFound % 2 === 0 && userElements.length < maxMessages) {
                userElements.push(div);
                foundCount++;
              } else if (assistantElements.length < maxMessages) {
                assistantElements.push(div);
                foundCount++;
              }
            }
          }
          console.log(`[Prompanion Deepseek] Final aggressive search added ${foundCount} messages`);
        }
      }
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
    
    console.log("[Prompanion Deepseek] Processing", allElements.length, "message elements");
    
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
            console.log(`[Prompanion Deepseek] Extracted content using selector "${selector}": ${content.substring(0, 50)}...`);
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
          console.log(`[Prompanion Deepseek] Added ${role} message (${content.length} chars): ${content.substring(0, 50)}...`);
        } else {
          console.log(`[Prompanion Deepseek] Skipped ${role} message - too short or UI-only: "${content.substring(0, 30)}"`);
        }
      } else {
        console.warn(`[Prompanion Deepseek] Could not extract content from ${role} message element:`, {
          tagName: el.tagName,
          className: el.className,
          hasChildren: el.children.length > 0,
          innerTextLength: (el.innerText || "").length,
          textContentLength: (el.textContent || "").length
        });
      }
    }
    
    // If still no messages, try ultra-aggressive search: look for ANY divs with substantial text
    if (messages.length === 0) {
      console.warn("[Prompanion Deepseek] ⚠️ No messages found with all strategies, trying ultra-aggressive search...");
      
      // Get all divs in the document
      const allDivs = Array.from(document.querySelectorAll("div"));
      console.log(`[Prompanion Deepseek] Scanning ${allDivs.length} divs for message-like content...`);
      
      // Filter for divs that might be messages
      const candidateDivs = allDivs.filter(div => {
        // Skip if it's clearly not a message
        if (div.closest("nav") || 
            div.closest("header") || 
            div.closest("footer") || 
            div.closest("aside") ||
            div.closest("form") ||
            div.closest("button") ||
            div.closest("input") ||
            div.closest("select") ||
            div.closest("textarea")) {
          return false;
        }
        
        const text = (div.innerText || div.textContent || "").trim();
        const hasSubstantialText = text.length > 30 && text.length < 50000;
        const hasChildren = div.children.length > 0;
        const isVisible = div.offsetParent !== null;
        
        // Look for divs that contain text nodes directly or through children
        const hasTextNodes = Array.from(div.childNodes).some(node => 
          node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 10
        ) || Array.from(div.querySelectorAll("*")).some(child => {
          const childText = (child.innerText || child.textContent || "").trim();
          return childText.length > 30 && !child.closest("button") && !child.closest("input");
        });
        
        return hasSubstantialText && hasChildren && isVisible && hasTextNodes;
      });
      
      console.log(`[Prompanion Deepseek] Found ${candidateDivs.length} candidate message divs`);
      
      if (candidateDivs.length > 0) {
        // Sort by position in DOM
        const sortedCandidates = candidateDivs.sort((a, b) => {
          const posA = getElementPosition(a);
          const posB = getElementPosition(b);
          return posA - posB;
        });
        
        // Try to identify user vs assistant by looking for patterns
        // Deepseek typically alternates: user, assistant, user, assistant...
        for (let i = 0; i < sortedCandidates.length && messages.length < maxMessages * 2; i++) {
          const div = sortedCandidates[i];
          const text = (div.innerText || div.textContent || "").trim();
          
          if (text.length > 30) {
            // Check if it looks like an assistant message (contains common AI response patterns)
            const looksLikeAssistant = 
              div.className?.toLowerCase().includes("assistant") ||
              div.className?.toLowerCase().includes("bot") ||
              div.className?.toLowerCase().includes("ai") ||
              div.className?.toLowerCase().includes("model") ||
              div.closest("[class*='assistant']") ||
              div.closest("[class*='bot']") ||
              div.closest("[class*='ai']") ||
              // Check parent for assistant markers
              (div.parentElement && (
                div.parentElement.className?.toLowerCase().includes("assistant") ||
                div.parentElement.className?.toLowerCase().includes("bot")
              ));
            
            // Check if it looks like a user message
            const looksLikeUser = 
              div.className?.toLowerCase().includes("user") ||
              div.className?.toLowerCase().includes("human") ||
              div.closest("[class*='user']") ||
              div.closest("[class*='human']") ||
              (div.parentElement && (
                div.parentElement.className?.toLowerCase().includes("user") ||
                div.parentElement.className?.toLowerCase().includes("human")
              ));
            
            // Determine role
            let role = 'user';
            if (looksLikeAssistant && !looksLikeUser) {
              role = 'assistant';
            } else if (!looksLikeUser && !looksLikeAssistant) {
              // No clear markers - use alternating pattern
              // First message is usually user, then alternate
              role = messages.length % 2 === 0 ? 'user' : 'assistant';
            }
            
            // Extract clean text content
            const textNodes = [];
            const walker = document.createTreeWalker(
              div,
              NodeFilter.SHOW_TEXT,
              {
                acceptNode: (node) => {
                  const parent = node.parentElement;
                  if (parent && (
                    parent.tagName === "BUTTON" ||
                    parent.tagName === "INPUT" ||
                    parent.closest("button") ||
                    parent.closest("input") ||
                    parent.closest("nav") ||
                    parent.closest("header") ||
                    parent.closest("footer")
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
            
            const content = textNodes.join(" ").trim() || text;
            
            if (content.length > 30 && !/^(copy|regenerate|thumbs up|thumbs down|share|attach|send|submit)$/i.test(content)) {
              messages.push({
                role: role,
                content: content.replace(/\s+/g, " ").trim(),
                timestamp: Date.now()
              });
              console.log(`[Prompanion Deepseek] Added ${role} message from ultra-aggressive search (${content.length} chars): ${content.substring(0, 50)}...`);
            }
          }
        }
      }
    }
    
    console.log(`[Prompanion Deepseek] ✓ Captured ${messages.length} messages from Deepseek conversation`);
    if (messages.length === 0) {
      console.warn("[Prompanion Deepseek] ⚠️ No messages captured - check if conversation elements exist in DOM");
      console.warn("[Prompanion Deepseek] DOM Diagnostic Info:", {
        bodyChildren: document.body?.children?.length || 0,
        mainElements: document.querySelectorAll("main").length,
        articles: document.querySelectorAll("article").length,
        divsWithDataRole: document.querySelectorAll("div[data-role], div[data-author], div[data-message-author-role]").length,
        allDivs: document.querySelectorAll("div").length,
        sampleDivClasses: Array.from(document.querySelectorAll("div")).slice(0, 20).map(d => ({
          className: d.className,
          textLength: (d.innerText || "").trim().length,
          hasChildren: d.children.length > 0,
          isVisible: d.offsetParent !== null
        })).filter(d => d.textLength > 30),
        url: window.location.href
      });
    }
    return messages;
  } catch (error) {
    console.error("[Prompanion Deepseek] ✗ Error capturing Deepseek chat history:", error);
    console.error("[Prompanion Deepseek] Error details:", {
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
  console.log("%c[Prompanion Deepseek] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion Deepseek] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion Deepseek] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[Prompanion Deepseek] Snippet:", snippet?.substring(0, 50));
  console.log("[Prompanion Deepseek] selectionAskInFlight:", selectionAskInFlight);
  
  if (!snippet || selectionAskInFlight) {
    console.log("[Prompanion Deepseek] Exiting early - snippet:", !!snippet, "inFlight:", selectionAskInFlight);
    return;
  }
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from Deepseek conversation for context
    let chatHistory = [];
    console.log("%c[Prompanion Deepseek] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureDeepseekChatHistory(20);
      console.log(`%c[Prompanion Deepseek] ✓ Captured ${chatHistory.length} messages from conversation for SideChat context`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      
      // Log sample of captured history for debugging
      if (chatHistory.length > 0) {
        console.log("[Prompanion Deepseek] Sample captured messages:", {
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
        console.warn("[Prompanion Deepseek] ⚠️ captureDeepseekChatHistory returned empty array - no messages found in DOM");
      }
    } catch (error) {
      console.error("[Prompanion Deepseek] ✗ Failed to capture chat history:", error);
      console.error("[Prompanion Deepseek] Error stack:", error.stack);
      // Continue with empty array - better than failing completely
      chatHistory = [];
    }
    
    console.log("[Prompanion Deepseek] ========== SENDING PROMPANION_SIDECHAT_REQUEST ==========");
    console.log("[Prompanion Deepseek] Sending PROMPANION_SIDECHAT_REQUEST with:", {
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
      console.log("[Prompanion Deepseek] ========== PROMPANION_SIDECHAT_REQUEST RESPONSE ==========");
      console.log("[Prompanion Deepseek] Response:", response);
      if (!response?.ok) {
        console.warn("Prompanion: sidechat request rejected", response?.reason);
      }
      selectionAskInFlight = false;
    }).catch((error) => {
      console.warn("Prompanion: failed to request sidechat from selection", error);
      selectionAskInFlight = false;
    });
  } catch (error) {
    console.error("Prompanion Deepseek: sidechat request threw synchronously", error);
    selectionAskInFlight = false;
  }
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
        console.error("[Prompanion Deepseek] Extension context invalidated - user should reload page");
        // The notification is already shown by AdapterBase._showContextInvalidatedNotification()
      } else {
        console.warn("[Prompanion Deepseek] Enhancement request failed:", error);
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

  // Last resort: query for Deepseek-specific selectors
  const selectors = [
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "textarea:not([readonly])",
    "input[type='text']:not([readonly])"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement && element.offsetParent !== null) {
      return element;
    }
  }

  return null;
}

// Generic text insertion moved to AdapterBase.setEditableElementText()
// This wrapper maintains Deepseek-specific logging
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
    .catch((e) => console.error("Prompanion: failed to open sidebar from Deepseek adapter", e)));
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
  // CRITICAL: Always call positionFloatingButton which will find the correct container via XPath
  positionFloatingButton(inputNode, null);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  if (!floatingButtonWrapper) return;
  
  console.log("[Prompanion Deepseek] positionFloatingButton called");
  
  // Use XPath to find the target container
  // XPath: //*[@id="root"]/div/div/div[2]/div[3]/div/div/div[2]/div[2]/div/div/div[2]/div[3]
  let targetContainer = null;
  
  try {
    const xpathResult = document.evaluate(
      '//*[@id="root"]/div/div/div[2]/div[3]/div/div/div[2]/div[2]/div/div/div[2]/div[3]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    targetContainer = xpathResult.singleNodeValue;
    if (targetContainer) {
      console.log("[Prompanion Deepseek] Target container found via XPath");
    }
  } catch (error) {
    console.warn("[Prompanion Deepseek] Container XPath error:", error);
  }
  
  // Find the reference element (10px to the left of this)
  // XPath: //*[@id="root"]/div/div/div[2]/div[3]/div/div/div[2]/div[2]/div/div/div[2]/div[3]/div[1]
  let referenceElement = null;
  
  try {
    const xpathResult = document.evaluate(
      '//*[@id="root"]/div/div/div[2]/div[3]/div/div/div[2]/div[2]/div/div/div[2]/div[3]/div[1]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    referenceElement = xpathResult.singleNodeValue;
    if (referenceElement) {
      console.log("[Prompanion Deepseek] Reference element found via XPath");
    }
  } catch (error) {
    console.warn("[Prompanion Deepseek] Reference element XPath error:", error);
  }
  
  // Fallback: if XPath doesn't work, try to find container from input node
  if (!targetContainer && inputNode) {
    // Walk up the DOM to find a likely container
    let current = inputNode.parentElement;
    for (let i = 0; i < 10 && current; i++) {
      if (current.tagName === 'DIV' && current.children.length > 0) {
        targetContainer = current;
        break;
      }
      current = current.parentElement;
    }
  }
  
  if (!targetContainer) {
    console.warn("[Prompanion Deepseek] Target container not found, will retry...");
    if (inputNode && floatingButtonWrapper) {
      setTimeout(() => {
        positionFloatingButton(inputNode, null);
      }, 100);
    }
    return;
  }
  
  // Ensure container has relative positioning
  const containerStyle = getComputedStyle(targetContainer);
  if (containerStyle.position === "static") {
    targetContainer.style.position = "relative";
  }
  
  // Calculate spacing - position 10px to the left of the reference element
  let spacing = 8; // Default 8px from right edge
  
  if (referenceElement && referenceElement.offsetParent) {
    const referenceRect = referenceElement.getBoundingClientRect();
    const containerRect = targetContainer.getBoundingClientRect();
    
    // Calculate reference element's left edge relative to container's right edge
    const referenceLeftFromContainer = containerRect.right - referenceRect.left;
    const spacingBetween = 10; // 10px spacing to the left of reference element
    
    // To place our button 10px to the left of reference element's left edge:
    // Our button's RIGHT edge should be at: referenceLeftFromContainer + spacingBetween
    spacing = referenceLeftFromContainer + spacingBetween;
    
    // Ensure spacing is at least 8px from right edge
    if (spacing < 8) {
      spacing = 8;
    }
    
    console.log("[Prompanion Deepseek] Reference element found, positioning relative to it:", {
      referenceLeftFromContainer: referenceLeftFromContainer,
      spacingBetween: spacingBetween,
      calculatedSpacing: spacing,
      referenceElement: referenceElement
    });
  } else {
    console.warn("[Prompanion Deepseek] Reference element not found or not visible, using default spacing");
  }
  
  // Get reference element's vertical center for alignment
  let topOffset = "50%";
  if (referenceElement && referenceElement.offsetParent) {
    const referenceRect = referenceElement.getBoundingClientRect();
    const containerRect = targetContainer.getBoundingClientRect();
    const referenceCenter = referenceRect.top + referenceRect.height / 2;
    const containerTop = containerRect.top;
    topOffset = `${referenceCenter - containerTop}px`;
  }
  
  // Move button to container
  if (floatingButtonWrapper.parentElement !== targetContainer) {
    targetContainer.append(floatingButtonWrapper);
  }
  
  // Apply positioning styles
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = topOffset;
  floatingButtonWrapper.style.right = `${spacing}px`;
  floatingButtonWrapper.style.transform = typeof topOffset === 'string' && topOffset.includes('px')
    ? "translateY(-50%)"
    : "translateY(-50%)";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.margin = "0";
  floatingButtonWrapper.style.display = "flex";
  
  // Also schedule for next frame to override any code that runs after this
  requestAnimationFrame(() => {
    if (!floatingButtonWrapper || !targetContainer) return;
    
    // Force move again in case something moved it
    if (floatingButtonWrapper.parentElement !== targetContainer) {
      targetContainer.append(floatingButtonWrapper);
    }
    
    // Force apply styles again to override anything that changed them
    floatingButtonWrapper.style.position = "absolute";
    floatingButtonWrapper.style.top = topOffset;
    floatingButtonWrapper.style.right = `${spacing}px`;
    floatingButtonWrapper.style.transform = typeof topOffset === 'string' && topOffset.includes('px')
      ? "translateY(-50%)"
      : "translateY(-50%)";
    floatingButtonWrapper.style.left = "auto";
    floatingButtonWrapper.style.bottom = "auto";
    floatingButtonWrapper.style.margin = "0";
  });
  
  console.log("[Prompanion Deepseek] Button positioned in container:", {
    containerWidth: targetContainer.getBoundingClientRect().width,
    containerHeight: targetContainer.getBoundingClientRect().height,
    buttonRight: spacing,
    topOffset: topOffset,
    containerElement: targetContainer
  });
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    positionFloatingButton(floatingButtonTargetInput, null);
  }
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  const observer = new MutationObserver(() => {
    AdapterBase.requestSelectionToolbarUpdate();
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
  console.log("[Prompanion Deepseek] locateComposer called");
  
  // Deepseek uses contenteditable divs - try multiple strategies
  // Strategy 1: Look for contenteditable divs in common locations
  let input = document.querySelector("div[contenteditable='true'][role='textbox']") ||
              document.querySelector("div[contenteditable='true']") ||
              document.querySelector("[contenteditable='true']");
  
  // Strategy 2: Look within form elements
  if (!input) {
    const forms = document.querySelectorAll("form");
    for (const form of forms) {
      const editable = form.querySelector("div[contenteditable='true']") ||
                      form.querySelector("textarea") ||
                      form.querySelector("input[type='text']");
      if (editable instanceof HTMLElement) {
        input = editable;
        console.log("[Prompanion Deepseek] Found input in form:", input);
        break;
      }
    }
  }
  
  // Strategy 3: Look for textarea elements
  if (!input) {
    const textareas = document.querySelectorAll("textarea");
    for (const textarea of textareas) {
      if (textarea instanceof HTMLTextAreaElement && 
          !textarea.readOnly && 
          !textarea.disabled &&
          textarea.offsetParent !== null) {
        input = textarea;
        console.log("[Prompanion Deepseek] Found textarea:", input);
        break;
      }
    }
  }
  
  // Strategy 4: Look for input elements
  if (!input) {
    const inputs = document.querySelectorAll("input[type='text'], input[type='search']");
    for (const inp of inputs) {
      if (inp instanceof HTMLInputElement && 
          !inp.readOnly && 
          !inp.disabled &&
          inp.offsetParent !== null) {
        input = inp;
        console.log("[Prompanion Deepseek] Found input:", input);
        break;
      }
    }
  }
  
  if (!input) {
    console.warn("[Prompanion Deepseek] No input found in locateComposer");
    return null;
  }
  
  // Find container - try to find the XPath container first
  let container = null;
  try {
    const xpathResult = document.evaluate(
      '//*[@id="root"]/div/div/div[2]/div[3]/div/div/div[2]/div[2]/div/div/div[2]/div[3]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    container = xpathResult.singleNodeValue;
    if (container) {
      console.log("[Prompanion Deepseek] Found container via XPath");
    }
  } catch (error) {
    console.warn("[Prompanion Deepseek] XPath error:", error);
  }
  
  // Fallback: find container from input
  if (!container) {
    container = input.closest("form") ||
                input.closest("div[class*='input']") ||
                input.closest("div[class*='composer']") ||
                input.parentElement;
  }
  
  console.log("[Prompanion Deepseek] Composer located:", { input, container });
  return { input, container: container || document.body };
}

function init() {
  console.log("[Prompanion Deepseek] init() called");
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  AdapterBase.requestSelectionToolbarUpdate();
  if (composer) {
    console.log("[Prompanion Deepseek] Composer found, setting up enhance tooltip");
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[Prompanion Deepseek] Composer not found in init()");
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

  // Last resort: query for Deepseek-specific selectors
  const selectors = [
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "textarea:not([readonly])",
    "input[type='text']:not([readonly])"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement && element.offsetParent !== null) {
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
    console.log("[Prompanion Deepseek] ========== INSERT TEXT REQUEST ==========");
    console.log("[Prompanion Deepseek] Text to insert:", textToInsert.substring(0, 50) + (textToInsert.length > 50 ? "..." : ""));
    console.log("[Prompanion Deepseek] Text length:", textToInsert.length);
    
    if (!textToInsert) {
      console.log("[Prompanion Deepseek] Insert failed: EMPTY_TEXT");
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[Prompanion Deepseek] Searching for composer node...");
    const composerNode = findComposerNode();
    console.log("[Prompanion Deepseek] Composer node found:", composerNode);
    console.log("[Prompanion Deepseek] Node type:", composerNode?.constructor?.name);
    console.log("[Prompanion Deepseek] Node isContentEditable:", composerNode?.isContentEditable);
    console.log("[Prompanion Deepseek] Node tagName:", composerNode?.tagName);
    console.log("[Prompanion Deepseek] Node className:", composerNode?.className);
    console.log("[Prompanion Deepseek] Node visible:", composerNode ? (composerNode.offsetParent !== null) : false);
    console.log("[Prompanion Deepseek] Node current value:", composerNode ? (composerNode.value || composerNode.textContent || "").substring(0, 50) : "");
    
    if (!composerNode) {
      console.log("[Prompanion Deepseek] Insert failed: NO_COMPOSER_NODE");
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false; // sendResponse called synchronously, close channel
    }

    console.log("[Prompanion Deepseek] Calling setComposerText...");
    const success = setComposerText(composerNode, textToInsert);
    console.log("[Prompanion Deepseek] setComposerText returned:", success);
    
    // Verify insertion
    const currentValue = composerNode.value || composerNode.textContent || "";
    const textInserted = currentValue.includes(textToInsert.substring(0, Math.min(20, textToInsert.length)));
    console.log("[Prompanion Deepseek] Verification - text appears in node:", textInserted);
    console.log("[Prompanion Deepseek] Current node value:", currentValue.substring(0, 100));
    
    if (success && textInserted) {
      console.log("[Prompanion Deepseek] Insert succeeded!");
      sendResponse({ ok: true });
    } else if (success && !textInserted) {
      console.warn("[Prompanion Deepseek] setComposerText returned true but text not verified in node");
      sendResponse({ ok: false, reason: "INSERTION_NOT_VERIFIED" });
    } else {
      console.log("[Prompanion Deepseek] Insert failed: SET_TEXT_FAILED");
      sendResponse({ ok: false, reason: "SET_TEXT_FAILED" });
    }
    return false; // sendResponse called synchronously, close channel
  } catch (error) {
    console.error("[Prompanion Deepseek] Insert text handler failed", error);
    console.error("[Prompanion Deepseek] Error stack:", error.stack);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false; // sendResponse called synchronously, close channel
  }
}

// Register message handler using AdapterBase (must be after handleInsertTextMessage is defined)
console.log("[Prompanion Deepseek] Registering PROMPANION_INSERT_TEXT handler with AdapterBase");
AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

function bootstrap() {
  ensureHighlightObserver();
  initSelectionToolbar(); // Initialize the selection toolbar system
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
    console.log("[Prompanion Deepseek] Creating enhance tooltip element");
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
    console.log("[Prompanion Deepseek] Attaching click handler to Refine button");
    console.log("[Prompanion Deepseek] handleRefineButtonClick function exists:", typeof handleRefineButtonClick);
    action.addEventListener("click", handleRefineButtonClick);
    console.log("[Prompanion Deepseek] Click handler attached, button:", action);
    enhanceTooltipElement.append(dismiss, action);
    console.log("[Prompanion Deepseek] Enhance tooltip element created");
  }
  if (!enhanceTooltipElement.isConnected) {
    console.log("[Prompanion Deepseek] Appending enhance tooltip to body");
    document.body.append(enhanceTooltipElement);
  }
  hideEnhanceTooltip();
}

function handleRefineButtonClick(e) {
  console.log("[Prompanion Deepseek] ========== REFINE BUTTON HANDLER FIRED ==========");
  console.log("[Prompanion Deepseek] Event type:", e.type);
  console.log("[Prompanion Deepseek] Event target:", e.target);
  e.preventDefault();
  e.stopPropagation();
  if (enhanceActionInFlight) {
    return;
  }
  const composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  console.log("[Prompanion Deepseek] Composer node:", composerNode);
  if (!composerNode) {
    console.error("[Prompanion Deepseek] No composer node found!");
    return;
  }
  const promptText = extractInputText().trim();
  console.log("[Prompanion Deepseek] Prompt text:", promptText);
  if (!promptText) {
    return;
  }
  enhanceActionInFlight = true;
  // Don't hide tooltip yet - wait to see if there's a limit error
  console.log("[Prompanion Deepseek] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        if (result?.reason === "EXTENSION_CONTEXT_INVALIDATED") {
          console.error("[Prompanion Deepseek] Cannot enhance prompt - extension context invalidated. Please reload the page.");
          enhanceTooltipDismissed = true;
          hideEnhanceTooltip();
        } else if (result?.error === "LIMIT_REACHED") {
          // Show upgrade button in tooltip instead of hiding
          console.log("[Prompanion Deepseek] Limit reached, showing upgrade button");
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
      console.error("Prompanion Deepseek: refine request threw", error);
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
    console.error("[Prompanion Deepseek] Cannot show upgrade button - tooltip element not found");
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
      console.log("[Prompanion Deepseek] Upgrade button clicked - placeholder for Stripe integration");
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
  console.log("[Prompanion Deepseek] ========== BACKUP MESSAGE LISTENER REGISTRATION ==========");
  console.log("[Prompanion Deepseek] Current time:", new Date().toISOString());
  
  if (typeof chrome === "undefined") {
    console.error("[Prompanion Deepseek] chrome is undefined in backup registration");
    return;
  }
  
  if (!chrome.runtime || !chrome.runtime.onMessage) {
    console.error("[Prompanion Deepseek] chrome.runtime.onMessage not available in backup registration");
    return;
  }
  
  try {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      if (message && message.type === "PROMPANION_INSERT_TEXT") {
        console.log("[Prompanion Deepseek] BACKUP LISTENER: PROMPANION_INSERT_TEXT received!");
        if (typeof handleInsertTextMessage === "function") {
          handleInsertTextMessage(message, sender, sendResponse);
        } else {
          console.error("[Prompanion Deepseek] handleInsertTextMessage is not a function!");
          sendResponse({ ok: false, reason: "HANDLER_NOT_FOUND" });
        }
        return true;
      }
      return false;
    });
    console.log("[Prompanion Deepseek] ✓ Backup listener registered successfully");
  } catch (error) {
    console.error("[Prompanion Deepseek] ✗ Backup listener registration failed:", error);
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
console.log("[Prompanion Deepseek] ========== VERIFYING MESSAGE LISTENER ==========");
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
  console.log("[Prompanion Deepseek] chrome.runtime.onMessage is available");
  console.log("[Prompanion Deepseek] chrome.runtime.id:", chrome.runtime.id);
  console.log("[Prompanion Deepseek] chrome.runtime.getURL:", typeof chrome.runtime.getURL);
} else {
  console.error("[Prompanion Deepseek] chrome.runtime.onMessage is NOT available at this point!");
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
      console.log("[Prompanion Deepseek] ========== MOUSEDOWN DETECTED ON BUTTON ==========");
      console.log("[Prompanion Deepseek] Setting tooltipClickInProgress flag");
      tooltipClickInProgress = true;
      const buttonRef = button;
      const mousedownTime = Date.now();
      
      const clickHandler = (clickEvent) => {
        const timeSinceMousedown = Date.now() - mousedownTime;
        console.log("[Prompanion Deepseek] ========== CLICK AFTER MOUSEDOWN (direct handler) ==========");
        console.log("[Prompanion Deepseek] Time since mousedown:", timeSinceMousedown, "ms");
        console.log("[Prompanion Deepseek] Click target:", clickEvent.target);
        if (typeof handleRefineButtonClick === "function") {
          handleRefineButtonClick(clickEvent);
        }
        document.removeEventListener("click", clickHandler, true);
      };
      
      document.addEventListener("click", clickHandler, true);
      
      setTimeout(() => {
        tooltipClickInProgress = false;
        console.log("[Prompanion Deepseek] tooltipClickInProgress flag cleared");
        document.removeEventListener("click", clickHandler, true);
      }, 300);
    }
  }
}, true);

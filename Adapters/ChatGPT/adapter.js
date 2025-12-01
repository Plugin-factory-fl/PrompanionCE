// ============================================================================
// Message listener registration moved to AdapterBase
// ============================================================================
// The message listener system is now handled by AdapterBase.registerMessageHandler()
// This eliminates duplicate listener registrations and provides unified message handling.
// ============================================================================

console.log("[Prompanion] ========== ADAPTER.JS LOADING ==========");
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
// Selection toolbar variables moved to AdapterBase
let highlightObserver = null;

// Generic styles moved to styles/AdapterStyles.css
// Styles are loaded via ensureStyle() function

// Generic DOM utilities have been moved to AdapterBase
// Use AdapterBase.injectStyle(), AdapterBase.getElementFromNode(), etc.

// ensureStyle() moved to AdapterBase.ensureStyle()

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
    if (getHighlightButton()) AdapterBase.requestSelectionToolbarUpdate();
  });
  highlightObserver.observe(document.body, { childList: true, subtree: true });
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
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

// Selection Toolbar system moved to AdapterBase
// Initialize it with ChatGPT-specific condition functions
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

// Expose capture function to window for manual testing
window.__prompanionTestCapture = function() {
  console.log("[Prompanion ChatGPT] Manual test of captureGPTChatHistory");
  const result = captureGPTChatHistory(20);
  console.log("[Prompanion ChatGPT] Test result:", result);
  return result;
};

function captureGPTChatHistory(maxMessages = 20) {
  // Make these logs VERY visible
  console.log("%c[Prompanion ChatGPT] ========== captureGPTChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion ChatGPT] ========== captureGPTChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion ChatGPT] ========== captureGPTChatHistory CALLED ==========", "color: blue; font-size: 16px; font-weight: bold;");
  console.log("[Prompanion ChatGPT] Current URL:", window.location.href);
  console.log("[Prompanion ChatGPT] Document ready state:", document.readyState);
  console.log("[Prompanion ChatGPT] Timestamp:", new Date().toISOString());
  
  // Check if we're on a conversation page
  const isConversationPage = window.location.href.includes("/c/") || 
                            window.location.href.includes("/chat") ||
                            document.querySelector("main, [role='main']");
  console.log("[Prompanion ChatGPT] Is conversation page:", isConversationPage);
  
  const messages = [];
  
  try {
    // First, try to find the thread container (ChatGPT uses id="thread")
    const threadContainer = document.getElementById("thread");
    console.log("[Prompanion ChatGPT] Thread container found:", !!threadContainer);
    
    // Also check for the XPath container the user provided: //*[@id="thread"]/div/div[1]/div/div/div[2]
    let xpathContainer = null;
    try {
      const xpathResult = document.evaluate('//*[@id="thread"]/div/div[1]/div/div/div[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      xpathContainer = xpathResult.singleNodeValue;
      console.log("[Prompanion ChatGPT] XPath container found:", !!xpathContainer);
      if (xpathContainer) {
        console.log("[Prompanion ChatGPT] XPath container details:", {
          tagName: xpathContainer.tagName,
          className: xpathContainer.className,
          childCount: xpathContainer.children.length,
          innerHTMLLength: xpathContainer.innerHTML.length,
          hasText: (xpathContainer.innerText || xpathContainer.textContent || "").trim().length > 0
        });
      }
    } catch (xpathError) {
      console.warn("[Prompanion ChatGPT] XPath evaluation failed:", xpathError);
    }
    if (threadContainer) {
      console.log("[Prompanion ChatGPT] Thread container details:", {
        id: threadContainer.id,
        className: threadContainer.className,
        childCount: threadContainer.children.length,
        innerHTMLLength: threadContainer.innerHTML.length,
        hasText: (threadContainer.innerText || threadContainer.textContent || "").trim().length > 0
      });
      
      // Try to find messages using the XPath structure: //*[@id="thread"]/div/div[1]/div/div/div[2]
      // This suggests messages are in nested divs within thread
      const threadDivs = threadContainer.querySelectorAll("div");
      console.log(`[Prompanion ChatGPT] Found ${threadDivs.length} divs within thread container`);
      
      // Look for divs that contain substantial text (likely messages)
      const potentialMessageDivs = Array.from(threadDivs).filter(div => {
        const text = (div.innerText || div.textContent || "").trim();
        // Messages typically have substantial text but aren't UI elements
        return text.length > 30 && text.length < 50000 &&
               !div.closest("button") &&
               !div.closest("nav") &&
               !div.closest("header") &&
               !div.closest("footer") &&
               !div.closest("aside") &&
               div.children.length > 0;
      });
      
      console.log(`[Prompanion ChatGPT] Found ${potentialMessageDivs.length} potential message divs in thread`);
      if (potentialMessageDivs.length > 0) {
        console.log("[Prompanion ChatGPT] Sample potential messages:", potentialMessageDivs.slice(0, 3).map(div => ({
          textPreview: (div.innerText || div.textContent || "").substring(0, 100),
          className: div.className,
          id: div.id,
          dataAttributes: Array.from(div.attributes).filter(attr => attr.name.startsWith("data-")).map(attr => `${attr.name}="${attr.value}"`)
        })));
      }
    }
    
    // Determine the best search root - prefer XPath container, then thread container, then document
    let searchRoot = document;
    if (xpathContainer) {
      searchRoot = xpathContainer;
      console.log("[Prompanion ChatGPT] Using XPath container as search root");
    } else if (threadContainer) {
      searchRoot = threadContainer;
      console.log("[Prompanion ChatGPT] Using thread container as search root");
    } else {
      console.warn("[Prompanion ChatGPT] ⚠️ Neither XPath container nor thread container found - searching entire document");
    }
    
    // ChatGPT-specific selectors - try multiple patterns to handle DOM changes
    const assistantSelectors = [
      "[data-message-author-role='assistant']",
      "[data-testid='assistant-turn']",
      "[data-author='assistant']",
      "div[data-message-author-role='assistant']",
      "article[data-message-author-role='assistant']",
      "[class*='assistant'][class*='message']",
      "[class*='assistant'][class*='turn']",
      "div[class*='assistant-message']",
      "div[class*='assistant-turn']"
    ];
    
    const userSelectors = [
      "[data-message-author-role='user']",
      "[data-testid='user-turn']",
      "[data-author='user']",
      "div[data-message-author-role='user']",
      "article[data-message-author-role='user']",
      "[class*='user'][class*='message']",
      "[class*='user'][class*='turn']",
      "div[class*='user-message']",
      "div[class*='user-turn']"
    ];
    
    console.log("[Prompanion ChatGPT] Searching for messages with multiple selector strategies");
    
    // Try each selector pattern and combine results
    let assistantElements = [];
    let userElements = [];
    
    for (const selector of assistantSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[Prompanion ChatGPT] ✓ Found ${found.length} assistant messages with selector: ${selector}`);
          assistantElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[Prompanion ChatGPT] Selector failed: ${selector}`, e);
      }
    }
    
    for (const selector of userSelectors) {
      try {
        const found = Array.from(searchRoot.querySelectorAll(selector));
        if (found.length > 0) {
          console.log(`[Prompanion ChatGPT] ✓ Found ${found.length} user messages with selector: ${selector}`);
          userElements = found;
          break; // Use first selector that finds elements
        }
      } catch (e) {
        console.warn(`[Prompanion ChatGPT] Selector failed: ${selector}`, e);
      }
    }
    
    console.log("[Prompanion ChatGPT] Final element counts after standard selectors:", {
      assistantCount: assistantElements.length,
      userCount: userElements.length,
      totalElements: assistantElements.length + userElements.length
    });
    
    // If no elements found with standard selectors, try searching within thread container
    if (assistantElements.length === 0 && userElements.length === 0 && threadContainer) {
      console.warn("[Prompanion ChatGPT] ⚠️ No messages found with standard selectors, searching within thread container...");
      
      // Look for all divs within thread that might be messages
      // ChatGPT typically structures messages as divs within the thread
      const allDivsInThread = threadContainer.querySelectorAll("div");
      console.log(`[Prompanion ChatGPT] Found ${allDivsInThread.length} divs within thread container`);
      
      // Look for message-like structures - ChatGPT messages are typically in nested divs
      // Try to find divs that contain substantial text and aren't UI elements
      const potentialMessages = Array.from(allDivsInThread).filter(div => {
        const text = (div.innerText || div.textContent || "").trim();
        // Look for divs with substantial text (likely messages) but not UI elements
        return text.length > 20 && text.length < 50000 && 
               !div.closest("button") && 
               !div.closest("nav") && 
               !div.closest("header") &&
               !div.closest("footer") &&
               !div.closest("aside") &&
               div.children.length > 0;
      });
      
      console.log(`[Prompanion ChatGPT] Found ${potentialMessages.length} potential message divs in thread`);
      
      // Sort potential messages by their position in the DOM (top to bottom)
      const sortedMessages = potentialMessages.sort((a, b) => {
        const posA = getElementPosition(a);
        const posB = getElementPosition(b);
        return posA - posB;
      });
      
      // Use alternating pattern: ChatGPT typically starts with user, then assistant, etc.
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
            console.log(`[Prompanion ChatGPT] Added assistant message from thread search (${text.substring(0, 50)}...)`);
          } else if (hasUserMarker && userElements.length < maxMessages) {
            userElements.push(msg);
            console.log(`[Prompanion ChatGPT] Added user message from thread search (${text.substring(0, 50)}...)`);
          } else {
            // No clear markers - use alternating pattern
            // ChatGPT conversations typically start with user, then assistant, then user, etc.
            const totalFound = assistantElements.length + userElements.length;
            if (totalFound % 2 === 0 && userElements.length < maxMessages) {
              // Even index (0, 2, 4...) = user message
              userElements.push(msg);
              console.log(`[Prompanion ChatGPT] Added user message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            } else if (assistantElements.length < maxMessages) {
              // Odd index (1, 3, 5...) = assistant message
              assistantElements.push(msg);
              console.log(`[Prompanion ChatGPT] Added assistant message (alternating pattern #${totalFound}, ${text.substring(0, 50)}...)`);
            }
          }
        }
      }
      
      console.log(`[Prompanion ChatGPT] After thread search: ${assistantElements.length} assistant, ${userElements.length} user messages`);
    }
    
    // If still no elements found, try alternative approach with other containers
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[Prompanion ChatGPT] ⚠️ Still no messages found, trying broader search...");
      
      // Try finding messages by looking for conversation containers
      const conversationContainers = document.querySelectorAll("main, [role='main'], [class*='conversation'], [class*='chat'], [id*='conversation'], [id*='chat']");
      console.log("[Prompanion ChatGPT] Found conversation containers:", conversationContainers.length);
      
      // Log container structure for debugging
      if (conversationContainers.length > 0) {
        const firstContainer = conversationContainers[0];
        console.log("[Prompanion ChatGPT] First container structure:", {
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
        console.log(`[Prompanion ChatGPT] Found ${potentialMessages.length} potential message elements in container`);
        
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
              console.log(`[Prompanion ChatGPT] Added assistant element from fallback search`);
            } else if (!isLikelyAssistant && userElements.length < maxMessages) {
              userElements.push(msg);
              console.log(`[Prompanion ChatGPT] Added user element from fallback search`);
            }
          }
        }
      }
    }
    
    // Last resort: search for any divs with substantial text that might be messages
    if (assistantElements.length === 0 && userElements.length === 0) {
      console.warn("[Prompanion ChatGPT] ⚠️ Still no messages found, trying last-resort search...");
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
      console.log(`[Prompanion ChatGPT] Last-resort search found ${foundCount} potential messages`);
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
    
    console.log("[Prompanion ChatGPT] Processing", allElements.length, "message elements");
    
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
            console.log(`[Prompanion ChatGPT] Extracted content using selector "${selector}": ${content.substring(0, 50)}...`);
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
        if (content.length > 3 && !/^(copy|regenerate|thumbs up|thumbs down|share)$/i.test(content)) {
          messages.push({
            role: role === 'assistant' ? 'assistant' : 'user',
            content: content,
            timestamp: Date.now()
          });
          console.log(`[Prompanion ChatGPT] Added ${role} message (${content.length} chars): ${content.substring(0, 50)}...`);
        } else {
          console.log(`[Prompanion ChatGPT] Skipped ${role} message - too short or UI-only: "${content.substring(0, 30)}"`);
        }
      } else {
        console.warn(`[Prompanion ChatGPT] Could not extract content from ${role} message element:`, {
          tagName: el.tagName,
          className: el.className,
          hasChildren: el.children.length > 0,
          innerTextLength: (el.innerText || "").length,
          textContentLength: (el.textContent || "").length
        });
      }
    }
    
    console.log(`[Prompanion ChatGPT] ✓ Captured ${messages.length} messages from ChatGPT conversation`);
    if (messages.length === 0) {
      console.warn("[Prompanion ChatGPT] ⚠️ No messages captured - check if conversation elements exist in DOM");
      console.warn("[Prompanion ChatGPT] DOM Diagnostic Info:", {
        bodyChildren: document.body?.children?.length || 0,
        mainElements: document.querySelectorAll("main").length,
        articles: document.querySelectorAll("article").length,
        divsWithDataRole: document.querySelectorAll("div[data-role], div[data-author], div[data-message-author-role]").length,
        allDivs: document.querySelectorAll("div").length,
        sampleDivClasses: Array.from(document.querySelectorAll("div")).slice(0, 10).map(d => d.className).filter(c => c),
        url: window.location.href
      });
      
      // Try one more aggressive search: look for any divs with substantial text that might be messages
      console.warn("[Prompanion ChatGPT] Attempting final aggressive search for message-like content...");
      const allTextDivs = Array.from(document.querySelectorAll("div")).filter(div => {
        const text = (div.innerText || div.textContent || "").trim();
        return text.length > 20 && text.length < 10000 && 
               !div.closest("button") && 
               !div.closest("nav") && 
               !div.closest("header") &&
               !div.closest("footer") &&
               !div.closest("aside") &&
               div.children.length > 0;
      });
      
      console.warn(`[Prompanion ChatGPT] Found ${allTextDivs.length} potential message divs in final search`);
      if (allTextDivs.length > 0) {
        console.warn("[Prompanion ChatGPT] Sample divs found:", allTextDivs.slice(0, 5).map(div => ({
          className: div.className,
          id: div.id,
          textPreview: (div.innerText || div.textContent || "").substring(0, 100),
          dataAttributes: Array.from(div.attributes).filter(attr => attr.name.startsWith("data-")).map(attr => `${attr.name}="${attr.value}"`)
        })));
      }
    }
    return messages;
  } catch (error) {
    console.error("[Prompanion ChatGPT] ✗ Error capturing GPT chat history:", error);
    console.error("[Prompanion ChatGPT] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return [];
  }
}

// Floating button positioning functions - based on Grok adapter pattern
function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  if (!floatingButtonWrapper) return;
  
  // Find the form container
  const form = document.querySelector('main form, form[data-testid="composer"]');
  if (!form) {
    console.warn("[Prompanion ChatGPT] Form not found, will retry...");
    if (inputNode && floatingButtonWrapper) {
      setTimeout(() => {
        positionFloatingButton(inputNode, null);
      }, 100);
    }
    return;
  }
  
  // Find the microphone/dictate button to position relative to it
  let targetButton = null;
  
  // Look for button with microphone/voice/dictate attributes
  const micButton = form.querySelector('button[aria-label*="voice"], button[aria-label*="dictate"], button[aria-label*="microphone"], button[aria-label*="Voice"], button svg[class*="mic"], button svg[class*="voice"]');
  if (micButton && micButton.offsetParent) {
    targetButton = micButton;
  } else {
    // Try to find the last button in the form (often the microphone button is last)
    const allButtons = form.querySelectorAll('button');
    const visibleButtons = Array.from(allButtons).filter(btn => btn.offsetParent);
    if (visibleButtons.length > 0) {
      // Prefer buttons that look like microphone buttons
      const micLikeButtons = visibleButtons.filter(btn => {
        const label = (btn.getAttribute('aria-label') || "").toLowerCase();
        return label.includes('voice') || label.includes('dictate') || 
               btn.querySelector('svg[class*="mic"], svg[class*="voice"]');
      });
      if (micLikeButtons.length > 0) {
        targetButton = micLikeButtons[micLikeButtons.length - 1]; // Last microphone-like button
      } else {
        targetButton = visibleButtons[visibleButtons.length - 1]; // Last visible button
      }
    }
  }
  
  // Find the container that holds the buttons (form or a specific div within form)
  let buttonContainer = form;
  if (targetButton) {
    // Try to find a container div that holds the buttons
    let current = targetButton.parentElement;
    while (current && current !== form) {
      if (current.tagName === 'DIV' && current.querySelectorAll('button').length > 1) {
        buttonContainer = current;
        break;
      }
      current = current.parentElement;
    }
  }
  
  // Ensure container has relative positioning
  const containerStyle = getComputedStyle(buttonContainer);
  if (containerStyle.position === "static") {
    buttonContainer.style.position = "relative";
  }
  
  // Calculate spacing
  let spacing = 10; // Default spacing from right edge
  
  if (targetButton) {
    const targetRect = targetButton.getBoundingClientRect();
    const containerRect = buttonContainer.getBoundingClientRect();
    
    // Calculate target button's right edge relative to container's right edge
    const targetRightFromContainer = containerRect.right - targetRect.right;
    const targetButtonWidth = targetRect.width;
    const ourButtonWidth = BUTTON_SIZE.wrapper || 40;
    const spacingBetween = 10; // 10px spacing between buttons
    
    spacing = targetRightFromContainer + targetButtonWidth + spacingBetween;
    
    console.log("[Prompanion ChatGPT] Target button found, positioning relative to it:", {
      targetButtonWidth: targetButtonWidth,
      ourButtonWidth: ourButtonWidth,
      targetRightFromContainer: targetRightFromContainer,
      calculatedSpacing: spacing,
      targetButtonAriaLabel: targetButton.getAttribute('aria-label')
    });
  } else {
    console.warn("[Prompanion ChatGPT] Target button not found, using default spacing");
  }
  
  // Move button to container
  if (floatingButtonWrapper.parentElement !== buttonContainer) {
    buttonContainer.append(floatingButtonWrapper);
  }
  
  // Apply positioning styles
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = "50%";
  floatingButtonWrapper.style.right = `${spacing}px`;
  floatingButtonWrapper.style.transform = "translateY(-50%)";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.bottom = "auto";
  floatingButtonWrapper.style.margin = "0";
  floatingButtonWrapper.style.display = "flex";
  
  // Also schedule for next frame to override any code that runs after this
  requestAnimationFrame(() => {
    if (!floatingButtonWrapper || !buttonContainer) return;
    
    // Force move again in case something moved it
    if (floatingButtonWrapper.parentElement !== buttonContainer) {
      buttonContainer.append(floatingButtonWrapper);
    }
    
    // Force apply styles again to override anything that changed them
    floatingButtonWrapper.style.position = "absolute";
    floatingButtonWrapper.style.top = "50%";
    floatingButtonWrapper.style.right = `${spacing}px`;
    floatingButtonWrapper.style.transform = "translateY(-50%)";
    floatingButtonWrapper.style.left = "auto";
    floatingButtonWrapper.style.bottom = "auto";
    floatingButtonWrapper.style.margin = "0";
  });
  
  console.log("[Prompanion ChatGPT] Button positioned in container:", {
    containerWidth: buttonContainer.getBoundingClientRect().width,
    containerHeight: buttonContainer.getBoundingClientRect().height,
    buttonRight: spacing,
    containerElement: buttonContainer
  });
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    positionFloatingButton(floatingButtonTargetInput, null);
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
  console.log("%c[Prompanion ChatGPT] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion ChatGPT] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  console.log("%c[Prompanion ChatGPT] ========== submitSelectionToSideChat CALLED ==========", "color: red; font-size: 16px; font-weight: bold;");
  
  const snippet = typeof text === "string" ? text.trim() : "";
  console.log("[Prompanion ChatGPT] Snippet:", snippet?.substring(0, 50));
  console.log("[Prompanion ChatGPT] selectionAskInFlight:", selectionAskInFlight);
  
  if (!snippet || selectionAskInFlight) {
    console.log("[Prompanion ChatGPT] Exiting early - snippet:", !!snippet, "inFlight:", selectionAskInFlight);
    return;
  }
  selectionAskInFlight = true;
  
  try {
    // Capture chat history from ChatGPT conversation for context
    let chatHistory = [];
    console.log("%c[Prompanion ChatGPT] Attempting to capture chat history...", "color: orange; font-size: 14px; font-weight: bold;");
    try {
      chatHistory = captureGPTChatHistory(20);
      console.log(`%c[Prompanion ChatGPT] ✓ Captured ${chatHistory.length} messages from conversation for SideChat context`, 
        chatHistory.length > 0 ? "color: green; font-size: 14px; font-weight: bold;" : "color: red; font-size: 14px; font-weight: bold;");
      
      // Log sample of captured history for debugging
      if (chatHistory.length > 0) {
        console.log("[Prompanion ChatGPT] Sample captured messages:", {
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
        console.warn("[Prompanion ChatGPT] ⚠️ captureGPTChatHistory returned empty array - no messages found in DOM");
      }
    } catch (error) {
      console.error("[Prompanion ChatGPT] ✗ Failed to capture chat history:", error);
      console.error("[Prompanion ChatGPT] Error stack:", error.stack);
      // Continue with empty array - better than failing completely
      chatHistory = [];
    }
    
    console.log("[Prompanion ChatGPT] ========== SENDING PROMPANION_SIDECHAT_REQUEST ==========");
    console.log("[Prompanion ChatGPT] Sending PROMPANION_SIDECHAT_REQUEST with:", {
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
      console.log("[Prompanion ChatGPT] ========== PROMPANION_SIDECHAT_REQUEST RESPONSE ==========");
      console.log("[Prompanion ChatGPT] Response:", response);
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
  console.log("[Prompanion ChatGPT] ========== ELABORATE BUTTON CLICKED ==========");
  console.log("[Prompanion ChatGPT] Event:", event);
  console.log("[Prompanion ChatGPT] Current URL:", window.location.href);
  event.preventDefault();
  event.stopPropagation();
  const text = selectionToolbarText;
  console.log("[Prompanion ChatGPT] Selected text:", text?.substring(0, 50));
  console.log("[Prompanion ChatGPT] About to call submitSelectionToSideChat...");
  hideSelectionToolbar();
  submitSelectionToSideChat(text);
  console.log("[Prompanion ChatGPT] submitSelectionToSideChat called");
}

function handleSelectionChange() {
  console.log("[Prompanion] handleSelectionChange fired");
  AdapterBase.requestSelectionToolbarUpdate();
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
      const errorMessage = error?.message || "";
      if (errorMessage.includes("Extension context invalidated")) {
        console.error("[Prompanion ChatGPT] Extension context invalidated - user should reload page");
        // The notification is already shown by AdapterBase._showContextInvalidatedNotification()
      } else {
        console.warn("[Prompanion ChatGPT] Enhancement request failed:", error);
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
// This wrapper maintains ChatGPT-specific logging
function setComposerText(node, text) {
  return AdapterBase.setEditableElementText(node, text, { verbose: true });
}

function buildButton() {
  AdapterBase.ensureStyle();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.append(createIcon());
  // Use AdapterBase for generic hover tooltip
  AdapterBase.attachTooltip(button, "Open Prompanion to enhance your prompts for the best response.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("Prompanion: failed to open sidebar from ChatGPT adapter", e)));
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
  AdapterBase.ensureStyle();
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
  // CRITICAL: Always call positionFloatingButton which will find the correct container
  positionFloatingButton(inputNode, null);
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  const observer = new MutationObserver(() => {
    AdapterBase.requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
      placeButton(composer.container, composer.input);
      setupEnhanceTooltip(composer.input, composer.container);
    }
    // Recalculate button position when DOM changes (in case buttons move)
    if (floatingButtonTargetInput) {
      refreshFloatingButtonPosition();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  console.log("[Prompanion ChatGPT] locateComposer called");
  const wrappers = ["[data-testid='conversation-turn-textbox']", "[data-testid='composer-container']", "main form"]
    .map(sel => document.querySelector(sel)).filter(Boolean);
  console.log("[Prompanion ChatGPT] Found wrappers:", wrappers.length);
  let input = null;
  for (const wrapper of wrappers) {
    const editable = wrapper.querySelector("[data-testid='textbox'][contenteditable='true']") ??
                     wrapper.querySelector("div[contenteditable='true']");
    if (editable instanceof HTMLElement) { 
      input = editable; 
      console.log("[Prompanion ChatGPT] Found input in wrapper:", input);
      break; 
    }
  }
  if (!input) {
    const textarea = document.querySelector("[data-testid='conversation-turn-textbox'] textarea:not([readonly])");
    if (textarea instanceof HTMLTextAreaElement && !textarea.className.includes("_fallbackTextarea")) {
      input = textarea;
      console.log("[Prompanion ChatGPT] Found textarea input:", textarea);
    }
  }
  if (!input) {
    console.warn("[Prompanion ChatGPT] No input found in locateComposer");
    return null;
  }
  const container = input.closest("[data-testid='composer-footer']") ??
                    input.closest("[data-testid='composer-container']") ??
                    input.parentElement ?? document.body;
  console.log("[Prompanion ChatGPT] Composer located:", { input, container });
  return { input, container };
}

function init() {
  console.log("[Prompanion ChatGPT] init() called");
  const composer = locateComposer();
  AdapterBase.requestSelectionToolbarUpdate();
  if (composer) {
    console.log("[Prompanion ChatGPT] Composer found, calling placeButton");
    placeButton(composer.container, composer.input);
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  console.warn("[Prompanion ChatGPT] Composer not found in init()");
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
  // Don't hide tooltip yet - wait to see if there's a limit error
  console.log("[Prompanion] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      if (!result || !result.ok) {
        enhanceActionInFlight = false;
        if (result?.reason === "EXTENSION_CONTEXT_INVALIDATED") {
          console.error("[Prompanion ChatGPT] Cannot enhance prompt - extension context invalidated. Please reload the page.");
          enhanceTooltipDismissed = true;
          hideEnhanceTooltip();
        } else if (result?.error === "LIMIT_REACHED") {
          // Show upgrade button in tooltip instead of hiding
          console.log("[Prompanion] Limit reached, showing upgrade button");
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
      console.error("Prompanion: refine request threw", error);
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
  } else {
    // If no action button exists, just add the dismiss button
    enhanceTooltipElement.appendChild(dismiss);
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

/**
 * ChatGPT History Catcher
 * Captures chat history from ChatGPT conversations for SideChat context
 * Extends the base ChatHistoryExtractor class with ChatGPT-specific DOM selectors
 */

import { ChatHistoryExtractor } from "../../Base/chatHistoryCapture.js";

/**
 * ChatGPT-specific chat history extractor
 */
export class GPTHistoryCatcher extends ChatHistoryExtractor {
  constructor(config = {}) {
    super("chatgpt", config);
  }

  /**
   * Gets ChatGPT-specific DOM selectors for messages
   * @returns {Object} Object with userSelector, assistantSelector, containerSelector
   */
  getMessageSelectors() {
    return {
      // Assistant messages - multiple selectors for different ChatGPT UI versions
      assistantSelector: [
        "[data-message-author-role='assistant']",
        "[data-testid='assistant-turn']",
        "div[data-message-author-role='assistant']"
      ].join(", "),

      // User messages
      userSelector: [
        "[data-message-author-role='user']",
        "[data-testid='user-turn']",
        "div[data-message-author-role='user']"
      ].join(", "),

      // Main conversation container
      containerSelector: "main, [role='main'], #__next main"
    };
  }

  /**
   * Extracts message content from ChatGPT DOM element
   * @param {HTMLElement} element - Message DOM element
   * @param {string} role - 'user' or 'assistant'
   * @returns {string|null} Extracted message content
   */
  extractMessageContent(element, role) {
    if (!element || !element.isConnected) {
      return null;
    }

    // Try multiple strategies to extract content
    let content = null;

    // Strategy 1: Look for text content in common ChatGPT message structures
    // ChatGPT often uses divs with text nodes or specific content containers
    const contentSelectors = [
      "[data-message-content]",
      ".markdown",
      ".prose",
      "[class*='markdown']",
      "[class*='message']",
      "div[class*='text']"
    ];

    for (const selector of contentSelectors) {
      const contentEl = element.querySelector(selector);
      if (contentEl) {
        // Get text content, preserving line breaks where possible
        const text = contentEl.innerText || contentEl.textContent;
        if (text && text.trim().length > 0) {
          content = text.trim();
          break;
        }
      }
    }

    // Strategy 2: If no specific content element found, try to get text from the element itself
    if (!content) {
      // Look for direct text content, but avoid getting text from nested interactive elements
      const textNodes = [];
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            // Skip text in buttons, inputs, and other interactive elements
            const parent = node.parentElement;
            if (
              parent &&
              (parent.tagName === "BUTTON" ||
                parent.tagName === "INPUT" ||
                parent.tagName === "TEXTAREA" ||
                parent.closest("button") ||
                parent.closest("input") ||
                parent.closest("textarea"))
            ) {
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

    // Strategy 3: Fallback to innerText/textContent of the element
    if (!content) {
      content = element.innerText || element.textContent;
      if (content) {
        content = content.trim();
      }
    }

    // Clean up the content - remove excessive whitespace
    if (content) {
      content = content.replace(/\s+/g, " ").trim();
    }

    // Filter out very short or likely non-message content
    if (!content || content.length < 3) {
      return null;
    }

    // Filter out common UI elements that might be captured
    const uiPatterns = [
      /^(copy|regenerate|thumbs up|thumbs down|share)$/i,
      /^[\s\-\•]*$/ // Only whitespace and bullets
    ];

    for (const pattern of uiPatterns) {
      if (pattern.test(content)) {
        return null;
      }
    }

    return content;
  }

  /**
   * Detects conversation ID from ChatGPT page
   * ChatGPT URLs can contain conversation IDs in various formats
   * @returns {string|null} Conversation ID or null
   */
  getConversationId() {
    try {
      const url = window.location.href;

      // Strategy 1: Extract from URL path
      // ChatGPT URLs can be: https://chatgpt.com/c/{conversation-id}
      const urlMatch = url.match(/\/c\/([a-f0-9-]+)/i);
      if (urlMatch && urlMatch[1]) {
        return `chatgpt-${urlMatch[1]}`;
      }

      // Strategy 2: Extract from URL hash or query params
      const hashMatch = url.match(/[#&]conversation[=:]([a-f0-9-]+)/i);
      if (hashMatch && hashMatch[1]) {
        return `chatgpt-${hashMatch[1]}`;
      }

      // Strategy 3: Try to find conversation ID in DOM
      // ChatGPT sometimes stores conversation data in script tags or data attributes
      const scriptTags = document.querySelectorAll('script[type="application/json"]');
      for (const script of scriptTags) {
        try {
          const data = JSON.parse(script.textContent);
          // Look for conversation ID in common locations
          if (data?.conversationId) {
            return `chatgpt-${data.conversationId}`;
          }
          if (data?.conversation?.id) {
            return `chatgpt-${data.conversation.id}`;
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      // Strategy 4: Generate ID from URL if it's a unique conversation page
      // Use a hash of the URL as fallback
      if (url.includes("chatgpt.com") || url.includes("chat.openai.com")) {
        // Create a stable ID from the current URL
        const urlHash = this.hashString(url);
        return `chatgpt-url-${urlHash}`;
      }

      return null;
    } catch (error) {
      console.warn("[Prompanion GPT History] Failed to get conversation ID:", error);
      return null;
    }
  }

  /**
   * Simple string hash function
   * @param {string} str - String to hash
   * @returns {string} Hash string
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Detects message role (user or assistant) from ChatGPT DOM element
   * @param {HTMLElement} element - Message DOM element
   * @returns {string|null} 'user' or 'assistant' or null
   */
  detectMessageRole(element) {
    if (!element) {
      return null;
    }

    // Strategy 1: Check data attributes (most reliable)
    const authorRole = element.getAttribute("data-message-author-role");
    if (authorRole === "assistant" || authorRole === "user") {
      return authorRole;
    }

    // Check if element or parent has the role attribute
    const roleElement =
      element.closest("[data-message-author-role]") ||
      element.querySelector("[data-message-author-role]");
    if (roleElement) {
      const role = roleElement.getAttribute("data-message-author-role");
      if (role === "assistant" || role === "user") {
        return role;
      }
    }

    // Strategy 2: Check data-testid attributes
    if (element.closest("[data-testid='assistant-turn']")) {
      return "assistant";
    }
    if (element.closest("[data-testid='user-turn']")) {
      return "user";
    }

    // Strategy 3: Check class names (less reliable, but fallback)
    const classList = element.className || "";
    const classString = typeof classList === "string" ? classList : classList.toString();

    if (/assistant|ai|bot/i.test(classString) && !/user|human/i.test(classString)) {
      return "assistant";
    }
    if (/user|human|person/i.test(classString) && !/assistant|ai|bot/i.test(classString)) {
      return "user";
    }

    // Strategy 4: Check parent elements for role indicators
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      const parentRole = parent.getAttribute("data-message-author-role");
      if (parentRole === "assistant" || parentRole === "user") {
        return parentRole;
      }

      const parentTestId = parent.getAttribute("data-testid");
      if (parentTestId === "assistant-turn") {
        return "assistant";
      }
      if (parentTestId === "user-turn") {
        return "user";
      }

      parent = parent.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Override findMessageElements to handle ChatGPT's specific structure
   * ChatGPT may have messages in different containers or with different structures
   */
  findMessageElements() {
    const selectors = this.getMessageSelectors();
    const messages = new Set(); // Use Set to avoid duplicates

    // Find assistant messages
    if (selectors.assistantSelector) {
      try {
        const assistantElements = document.querySelectorAll(selectors.assistantSelector);
        assistantElements.forEach((el) => {
          if (el && el.isConnected) {
            // Find the root message container (usually the element with data-message-author-role)
            const rootMessage = el.closest("[data-message-author-role='assistant']") || el;
            if (rootMessage) {
              messages.add(rootMessage);
            }
          }
        });
      } catch (error) {
        console.warn("[Prompanion GPT History] Error finding assistant messages:", error);
      }
    }

    // Find user messages
    if (selectors.userSelector) {
      try {
        const userElements = document.querySelectorAll(selectors.userSelector);
        userElements.forEach((el) => {
          if (el && el.isConnected) {
            // Find the root message container
            const rootMessage = el.closest("[data-message-author-role='user']") || el;
            if (rootMessage) {
              messages.add(rootMessage);
            }
          }
        });
      } catch (error) {
        console.warn("[Prompanion GPT History] Error finding user messages:", error);
      }
    }

    return Array.from(messages);
  }
}


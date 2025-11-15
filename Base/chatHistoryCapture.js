/**
 * Chat History Capture Module
 * Captures LLM chat history from various platforms for SideChat context
 * Designed to be extensible for multiple adapter types (ChatGPT, Claude, etc.)
 */

/**
 * Default configuration for chat history capture
 */
const DEFAULT_CONFIG = {
  batchInterval: 2000, // Collect messages for 2 seconds before sending
  maxMessagesPerBatch: 10, // Maximum messages to batch at once
  deduplicationWindow: 5000, // Consider messages duplicate if within 5 seconds
  storageKey: "prompanion-chat-history", // Chrome storage key
  expirationHours: 48, // Auto-delete after 48 hours
  maxMessagesPerConversation: 50 // Limit stored messages per conversation
};

/**
 * Message deduplication using content hash
 */
class MessageDeduplicator {
  constructor(windowMs = DEFAULT_CONFIG.deduplicationWindow) {
    this.processedHashes = new Set();
    this.windowMs = windowMs;
    this.cleanupInterval = setInterval(() => this.cleanup(), windowMs * 2);
  }

  /**
   * Creates a hash from message content and timestamp
   * @param {string} content - Message content
   * @param {number} timestamp - Message timestamp
   * @returns {string} Hash string
   */
  createHash(content, timestamp) {
    const normalizedContent = content.trim().toLowerCase();
    const timeBucket = Math.floor(timestamp / this.windowMs);
    return `${timeBucket}-${normalizedContent.substring(0, 100)}`;
  }

  /**
   * Checks if a message has already been processed
   * @param {string} content - Message content
   * @param {number} timestamp - Message timestamp
   * @returns {boolean} True if message is a duplicate
   */
  isDuplicate(content, timestamp) {
    const hash = this.createHash(content, timestamp);
    if (this.processedHashes.has(hash)) {
      return true;
    }
    this.processedHashes.add(hash);
    return false;
  }

  /**
   * Cleans up old hashes to prevent memory leaks
   */
  cleanup() {
    const cutoff = Date.now() - this.windowMs * 10;
    // Simple cleanup - in production, could track timestamps per hash
    if (this.processedHashes.size > 1000) {
      this.processedHashes.clear();
    }
  }

  /**
   * Clears all processed hashes
   */
  clear() {
    this.processedHashes.clear();
  }
}

/**
 * Message batch collector - accumulates messages before sending
 */
class MessageBatchCollector {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.batch = [];
    this.batchTimer = null;
    this.onBatchReady = null;
  }

  /**
   * Adds a message to the current batch
   * @param {Object} message - Message object with role, content, timestamp
   */
  addMessage(message) {
    if (!message || !message.content || !message.role) {
      return;
    }

    this.batch.push({
      role: message.role,
      content: message.content.trim(),
      timestamp: message.timestamp || Date.now(),
      messageId: message.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    // Send batch if it reaches max size
    if (this.batch.length >= this.config.maxMessagesPerBatch) {
      this.flush();
      return;
    }

    // Start/reset batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.flush();
    }, this.config.batchInterval);
  }

  /**
   * Immediately sends current batch
   */
  flush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.batch.length === 0) {
      return;
    }

    const messagesToSend = [...this.batch];
    this.batch = [];

    if (this.onBatchReady && typeof this.onBatchReady === "function") {
      this.onBatchReady(messagesToSend);
    }
  }

  /**
   * Sets callback for when batch is ready to send
   * @param {Function} callback - Callback function
   */
  setBatchReadyCallback(callback) {
    this.onBatchReady = callback;
  }
}

/**
 * Base class for platform-specific chat history extractors
 * Extend this class for each LLM platform (ChatGPT, Claude, etc.)
 */
export class ChatHistoryExtractor {
  constructor(platformName, config = {}) {
    this.platformName = platformName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deduplicator = new MessageDeduplicator(this.config.deduplicationWindow);
    this.batchCollector = new MessageBatchCollector(this.config);
    this.observer = null;
    this.isCapturing = false;
    this.currentConversationId = null;
    this.lastUrl = null;
  }

  /**
   * Platform-specific: Get selectors for message elements
   * Must be implemented by subclasses
   * @returns {Object} Object with userSelector, assistantSelector, containerSelector
   */
  getMessageSelectors() {
    throw new Error("getMessageSelectors() must be implemented by subclass");
  }

  /**
   * Platform-specific: Extract message content from DOM element
   * Must be implemented by subclasses
   * @param {HTMLElement} element - Message DOM element
   * @param {string} role - 'user' or 'assistant'
   * @returns {string|null} Extracted message content
   */
  extractMessageContent(element, role) {
    throw new Error("extractMessageContent() must be implemented by subclass");
  }

  /**
   * Platform-specific: Detect conversation ID from page
   * Must be implemented by subclasses
   * @returns {string|null} Conversation ID or null
   */
  getConversationId() {
    throw new Error("getConversationId() must be implemented by subclass");
  }

  /**
   * Platform-specific: Detect message role from element
   * Must be implemented by subclasses
   * @param {HTMLElement} element - Message DOM element
   * @returns {string|null} 'user' or 'assistant' or null
   */
  detectMessageRole(element) {
    throw new Error("detectMessageRole() must be implemented by subclass");
  }

  /**
   * Finds all message elements in the DOM
   * @returns {Array<HTMLElement>} Array of message elements
   */
  findMessageElements() {
    const selectors = this.getMessageSelectors();
    const messages = [];

    // Find assistant messages
    if (selectors.assistantSelector) {
      const assistantElements = document.querySelectorAll(selectors.assistantSelector);
      assistantElements.forEach((el) => {
        if (el && !messages.includes(el)) {
          messages.push(el);
        }
      });
    }

    // Find user messages
    if (selectors.userSelector) {
      const userElements = document.querySelectorAll(selectors.userSelector);
      userElements.forEach((el) => {
        if (el && !messages.includes(el)) {
          messages.push(el);
        }
      });
    }

    return messages;
  }

  /**
   * Processes a single message element
   * @param {HTMLElement} element - Message DOM element
   * @returns {Object|null} Message object or null if invalid
   */
  processMessageElement(element) {
    if (!element || !element.isConnected) {
      return null;
    }

    const role = this.detectMessageRole(element);
    if (!role) {
      return null;
    }

    const content = this.extractMessageContent(element, role);
    if (!content || content.trim().length === 0) {
      return null;
    }

    const timestamp = Date.now();

    // Check for duplicates
    if (this.deduplicator.isDuplicate(content, timestamp)) {
      return null;
    }

    return {
      role,
      content: content.trim(),
      timestamp,
      messageId: `msg-${timestamp}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * Scans DOM for messages and processes them
   */
  scanForMessages() {
    if (!this.isCapturing) {
      return;
    }

    const conversationId = this.getConversationId();
    const currentUrl = window.location.href;

    // Detect conversation change
    if (conversationId !== this.currentConversationId || currentUrl !== this.lastUrl) {
      this.currentConversationId = conversationId;
      this.lastUrl = currentUrl;
      this.deduplicator.clear(); // Clear deduplication cache on conversation change
    }

    const messageElements = this.findMessageElements();
    const processedMessages = [];

    for (const element of messageElements) {
      const message = this.processMessageElement(element);
      if (message) {
        processedMessages.push(message);
      }
    }

    // Add messages to batch collector
    processedMessages.forEach((msg) => {
      this.batchCollector.addMessage(msg);
    });
  }

  /**
   * MutationObserver callback - triggered when DOM changes
   * @param {Array<MutationRecord>} mutations - Mutation records
   */
  handleMutation(mutations) {
    if (!this.isCapturing) {
      return;
    }

    // Debounce rapid mutations
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
    }

    this.scanTimer = setTimeout(() => {
      this.scanForMessages();
    }, 300); // Wait 300ms after last mutation
  }

  /**
   * Starts capturing chat history
   */
  startCapture() {
    if (this.isCapturing) {
      return;
    }

    this.isCapturing = true;
    this.currentConversationId = this.getConversationId();
    this.lastUrl = window.location.href;

    // Set up batch collector callback
    this.batchCollector.setBatchReadyCallback((messages) => {
      this.sendMessagesToBackground(messages);
    });

    // Initial scan
    this.scanForMessages();

    // Set up MutationObserver
    const selectors = this.getMessageSelectors();
    const container = selectors.containerSelector
      ? document.querySelector(selectors.containerSelector)
      : document.body;

    if (!container) {
      console.warn(`[Prompanion Chat History] Container not found for ${this.platformName}`);
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      this.handleMutation(mutations);
    });

    this.observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Periodic scan as backup (in case MutationObserver misses something)
    this.periodicScanInterval = setInterval(() => {
      this.scanForMessages();
    }, 5000); // Scan every 5 seconds

    console.log(`[Prompanion Chat History] Started capturing for ${this.platformName}`);
  }

  /**
   * Stops capturing chat history
   */
  stopCapture() {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;

    // Flush any pending messages
    this.batchCollector.flush();

    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear periodic scan
    if (this.periodicScanInterval) {
      clearInterval(this.periodicScanInterval);
      this.periodicScanInterval = null;
    }

    // Clear scan timer
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }

    console.log(`[Prompanion Chat History] Stopped capturing for ${this.platformName}`);
  }

  /**
   * Sends captured messages to background script for storage
   * @param {Array<Object>} messages - Array of message objects
   */
  sendMessagesToBackground(messages) {
    if (!messages || messages.length === 0) {
      return;
    }

    if (!chrome?.runtime?.sendMessage) {
      console.warn("[Prompanion Chat History] chrome.runtime.sendMessage not available");
      return;
    }

    const conversationId = this.getConversationId();
    const payload = {
      type: "PROMPANION_CHAT_HISTORY_UPDATE",
      platform: this.platformName,
      conversationId: conversationId || `conv-${Date.now()}`,
      url: window.location.href,
      messages: messages,
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Prompanion Chat History] Failed to send messages to background:",
          chrome.runtime.lastError.message
        );
      }
    });
  }

  /**
   * Cleanup - call when page unloads or adapter is destroyed
   */
  destroy() {
    this.stopCapture();
    this.deduplicator.clear();
    if (this.deduplicator.cleanupInterval) {
      clearInterval(this.deduplicator.cleanupInterval);
    }
  }
}

/**
 * Factory function to create platform-specific extractor
 * @param {string} platformName - Name of the platform ('chatgpt', 'claude', etc.)
 * @param {Object} config - Optional configuration overrides
 * @returns {ChatHistoryExtractor|null} Extractor instance or null if platform not supported
 */
export function createChatHistoryExtractor(platformName, config = {}) {
  // Platform-specific extractors will be imported here when implemented
  // For now, return null - adapters will need to provide their own implementation
  return null;
}

/**
 * Utility function to get chat history context for SideChat
 * This will be called from sideChat.js to get recent conversation context
 * @param {string} platform - Platform name
 * @param {string} conversationId - Optional conversation ID
 * @param {number} maxMessages - Maximum number of messages to return
 * @returns {Promise<Array>} Array of message objects
 */
export async function getChatHistoryContext(platform, conversationId = null, maxMessages = 10) {
  if (!chrome?.storage?.sync) {
    return [];
  }

  try {
    const result = await chrome.storage.sync.get(DEFAULT_CONFIG.storageKey);
    const history = result[DEFAULT_CONFIG.storageKey];

    if (!history || !Array.isArray(history.conversations)) {
      return [];
    }

    // Filter by platform and optionally conversation ID
    const conversations = history.conversations.filter((conv) => {
      if (conv.platform !== platform) {
        return false;
      }
      if (conversationId && conv.id !== conversationId) {
        return false;
      }
      return true;
    });

    // Get most recent conversation if no ID specified
    const targetConversation = conversationId
      ? conversations.find((c) => c.id === conversationId)
      : conversations.sort((a, b) => b.lastUpdated - a.lastUpdated)[0];

    if (!targetConversation || !Array.isArray(targetConversation.messages)) {
      return [];
    }

    // Return most recent messages
    const messages = targetConversation.messages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, maxMessages)
      .reverse(); // Reverse to get chronological order

    return messages;
  } catch (error) {
    console.error("[Prompanion Chat History] Failed to get context:", error);
    return [];
  }
}


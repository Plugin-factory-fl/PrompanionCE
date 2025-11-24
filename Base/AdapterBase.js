/**
 * AdapterBase - Base class for Prompanion adapters
 * Contains shared constants and configuration used across all adapters
 */

class AdapterBase {
  // Button configuration
  static BUTTON_ID = "prompanion-chatgpt-trigger";
  static BUTTON_CLASS = "prompanion-chatgpt-trigger";
  
  // Selection toolbar configuration
  static SELECTION_TOOLBAR_ID = "prompanion-selection-toolbar";
  static SELECTION_TOOLBAR_VISIBLE_CLASS = "is-visible";
  
  // ChatGPT-specific selectors for highlight button detection
  static HIGHLIGHT_BUTTON_SELECTORS = [
    "[data-testid='select-to-ask__ask-button']",
    "[data-testid='select-to-ask__askbutton']",
    "button[aria-label='Ask ChatGPT']",
    "button[aria-label='Ask ChatGPT automatically']"
  ];
  
  // Button size configuration
  static BUTTON_SIZE = {
    wrapper: "44px",
    element: "39px",
    icon: "34px"
  };
  
  /**
   * Get button ID - can be overridden by child classes
   * @returns {string}
   */
  static getButtonId() {
    return this.BUTTON_ID;
  }
  
  /**
   * Get button class - can be overridden by child classes
   * @returns {string}
   */
  static getButtonClass() {
    return this.BUTTON_CLASS;
  }
  
  /**
   * Get selection toolbar ID - can be overridden by child classes
   * @returns {string}
   */
  static getSelectionToolbarId() {
    return this.SELECTION_TOOLBAR_ID;
  }
  
  /**
   * Get selection toolbar visible class - can be overridden by child classes
   * @returns {string}
   */
  static getSelectionToolbarVisibleClass() {
    return this.SELECTION_TOOLBAR_VISIBLE_CLASS;
  }
  
  /**
   * Get highlight button selectors - can be overridden by child classes
   * @returns {string[]}
   */
  static getHighlightButtonSelectors() {
    return this.HIGHLIGHT_BUTTON_SELECTORS;
  }
  
  /**
   * Get button size configuration - can be overridden by child classes
   * @returns {Object}
   */
  static getButtonSize() {
    return this.BUTTON_SIZE;
  }
  
  // ============================================================================
  // Generic Hover Tooltip System
  // ============================================================================
  // This tooltip system provides generic hover tooltips for buttons.
  // It can be used by any adapter, while platform-specific tooltip features
  // (like the enhance/refine tooltip) remain in their respective adapters.
  // ============================================================================
  
  static tooltipRegistry = new WeakMap();
  
  /**
   * Attaches tooltip data to a button
   * @param {HTMLElement} button - The button element
   * @param {string} text - The tooltip text to display
   * @param {string} buttonId - Optional button ID for tooltip resources (uses this.BUTTON_ID if not provided)
   */
  static attachTooltip(button, text, buttonId = null) {
    const id = buttonId || this.BUTTON_ID;
    this.ensureTooltipResources(id);
    this.tooltipRegistry.set(button, { text });
  }
  
  /**
   * Ensures tooltip resources (CSS and container) are available
   * @param {string} buttonId - The button ID to use for resource IDs
   */
  static ensureTooltipResources(buttonId) {
    if (!document.getElementById(`${buttonId}-tooltip-style`)) {
      const style = document.createElement("style");
      style.id = `${buttonId}-tooltip-style`;
      style.textContent = `
        #${buttonId}-tooltip-layer {
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

    if (!document.getElementById(`${buttonId}-tooltip-layer`)) {
      const container = document.createElement("div");
      container.id = `${buttonId}-tooltip-layer`;
      document.body.append(container);
    }
  }
  
  /**
   * Shows the tooltip for a button
   * @param {HTMLElement} button - The button element
   * @param {string} buttonId - Optional button ID (uses this.BUTTON_ID if not provided)
   */
  static showTooltip(button, buttonId = null) {
    const id = buttonId || this.BUTTON_ID;
    const data = this.tooltipRegistry.get(button);
    const container = document.getElementById(`${id}-tooltip-layer`);
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
    this.positionTooltip(button, tooltip);
    tooltip.classList.add("is-visible");
  }
  
  /**
   * Hides the tooltip for a button
   * @param {HTMLElement} button - The button element
   */
  static hideTooltip(button) {
    const tooltip = button._prompanionTooltip;
    tooltip?.classList.remove("is-visible");
  }
  
  /**
   * Positions a tooltip relative to its button
   * @param {HTMLElement} button - The button element
   * @param {HTMLElement} tooltip - The tooltip element
   */
  static positionTooltip(button, tooltip) {
    const rect = button.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
  }
  
  // ============================================================================
  // Generic DOM Utilities
  // ============================================================================
  // These utilities provide generic DOM manipulation functions that work
  // across all platforms and can be used by any adapter.
  // ============================================================================
  
  /**
   * Converts a DOM node to an HTMLElement
   * Handles text nodes by returning their parent element
   * @param {Node} node - The DOM node to convert
   * @returns {HTMLElement|null} The element or null if not found
   */
  static getElementFromNode(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
    return node instanceof HTMLElement ? node : null;
  }
  
  /**
   * Gets the bounding rectangle from a Selection object
   * Falls back to clientRects if getBoundingClientRect fails
   * @param {Selection} selection - The Selection object
   * @returns {DOMRect|null} The bounding rectangle or null if not available
   */
  static getSelectionRect(selection) {
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
  
  /**
   * Sets button text content intelligently using TreeWalker
   * Preserves existing DOM structure by updating text nodes rather than replacing content
   * @param {HTMLElement} button - The button element
   * @param {string} text - The text to set
   */
  static setButtonTextContent(button, text) {
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
  
  /**
   * Injects CSS styles into the document head
   * Creates or updates a style element with the given ID
   * @param {string} styleId - The ID for the style element
   * @param {string} cssContent - The CSS content to inject
   */
  static injectStyle(styleId, cssContent) {
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.append(style);
    }
    if (style.textContent !== cssContent) {
      style.textContent = cssContent;
    }
  }
  
  // ============================================================================
  // Generic Message Listener System
  // ============================================================================
  // This system provides unified message handling for all adapters.
  // It consolidates duplicate listener registrations and provides
  // helper methods for sending messages with error handling.
  // ============================================================================
  
  // Internal message handler registry
  static _messageHandlers = new Map();
  static _listenerRegistered = false;
  
  /**
   * Registers a message handler for a specific message type
   * @param {string} messageType - The message type to handle (e.g., "PROMPANION_INSERT_TEXT")
   * @param {Function} handler - The handler function (message, sender, sendResponse) => void
   */
  static registerMessageHandler(messageType, handler) {
    if (typeof messageType !== "string" || typeof handler !== "function") {
      console.error("[AdapterBase] Invalid message handler registration:", { messageType, handler });
      return;
    }
    
    this._messageHandlers.set(messageType, handler);
    console.log(`[AdapterBase] Registered handler for message type: ${messageType}`);
    
    // Ensure listener is registered
    this._ensureMessageListener();
  }
  
  /**
   * Unregisters a message handler for a specific message type
   * @param {string} messageType - The message type to unregister
   */
  static unregisterMessageHandler(messageType) {
    this._messageHandlers.delete(messageType);
    console.log(`[AdapterBase] Unregistered handler for message type: ${messageType}`);
  }
  
  /**
   * Ensures the message listener is registered (singleton pattern)
   * @private
   */
  static _ensureMessageListener() {
    if (this._listenerRegistered) return;
    
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) {
      console.error("[AdapterBase] Cannot register message listener - chrome.runtime.onMessage not available");
      return;
    }
    
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Validate message
        if (!message || typeof message !== "object" || !message.type) {
          return false; // Let other listeners handle it
        }
        
        const handler = this._messageHandlers.get(message.type);
        if (!handler) {
          return false; // No handler for this message type
        }
        
        try {
          // Track if sendResponse was called
          let responseSent = false;
          let responseValue = null;
          const wrappedSendResponse = (response) => {
            if (responseSent) {
              console.warn(`[AdapterBase] Handler for ${message.type} called sendResponse multiple times`);
              return false;
            }
            responseSent = true;
            responseValue = response;
            try {
              return sendResponse(response);
            } catch (e) {
              console.error(`[AdapterBase] sendResponse failed for ${message.type}:`, e);
              return false;
            }
          };
          
          // Call the handler
          const result = handler(message, sender, wrappedSendResponse);
          
          // If handler returns true, keep channel open for async response
          // If handler returns false/undefined, close channel
          // If handler returns a Promise, wait for it
          if (result === true) {
            // Handler wants to keep channel open for async response
            // But if sendResponse was already called synchronously, we should return false
            // Chrome allows calling sendResponse before or after returning true
            if (responseSent) {
              // sendResponse was called synchronously, but handler returned true
              // This is fine - Chrome will still deliver the response
              console.log(`[AdapterBase] Handler for ${message.type} called sendResponse synchronously but returned true`);
            }
            return true; // Keep channel open
          } else if (result && typeof result.then === "function") {
            // Promise-based handler
            result
              .then((response) => {
                if (response !== undefined) {
                  sendResponse(response);
                }
              })
              .catch((error) => {
                console.error(`[AdapterBase] Handler error for ${message.type}:`, error);
                sendResponse({ ok: false, reason: error?.message ?? "HANDLER_ERROR" });
              });
            return true; // Keep channel open for promise
          } else {
            // Handler returned false/undefined
            if (!responseSent) {
              console.warn(`[AdapterBase] Handler for ${message.type} didn't call sendResponse and returned ${result}`);
              try {
                sendResponse({ ok: false, reason: "NO_RESPONSE" });
              } catch (e) {
                // Channel may already be closed
                console.error(`[AdapterBase] Failed to send NO_RESPONSE for ${message.type}:`, e);
              }
            } else {
              // sendResponse was called and handler returned false/undefined
              // This is correct - close the channel
              console.log(`[AdapterBase] Handler for ${message.type} returned ${result}, response sent:`, responseValue);
            }
            return false; // Close channel
          }
        } catch (error) {
          console.error(`[AdapterBase] Handler error for ${message.type}:`, error);
          try {
            if (!responseSent) {
              sendResponse({ ok: false, reason: error?.message ?? "HANDLER_ERROR" });
            }
          } catch (e) {
            // sendResponse may have already been called or channel closed
            console.error(`[AdapterBase] Failed to send error response for ${message.type}:`, e);
          }
          return false;
        }
      });
      
      this._listenerRegistered = true;
      console.log("[AdapterBase] ✓ Message listener registered successfully");
    } catch (error) {
      console.error("[AdapterBase] ✗ Failed to register message listener:", error);
    }
  }
  
  /**
   * Checks if the extension context is still valid
   * @returns {boolean} True if context is valid, false otherwise
   */
  static isExtensionContextValid() {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime) {
        return false;
      }
      // Try to access runtime.id - this will throw if context is invalidated
      const id = chrome.runtime.id;
      return typeof id === "string" && id.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sends a message to the background script
   * @param {Object} message - The message object (must have 'type' property)
   * @param {Function} [callback] - Optional callback for response
   * @returns {Promise} Promise that resolves with the response
   */
  static sendMessage(message, callback) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      const error = new Error("chrome.runtime.sendMessage not available");
      console.error("[AdapterBase] Cannot send message:", error);
      if (callback) {
        callback({ ok: false, reason: "CHROME_RUNTIME_UNAVAILABLE" });
      }
      return Promise.reject(error);
    }
    
    // Check if extension context is still valid
    if (!this.isExtensionContextValid()) {
      const error = new Error("Extension context invalidated. Please reload the page.");
      console.error("[AdapterBase] Extension context invalidated:", error);
      if (callback) {
        callback({ ok: false, reason: "EXTENSION_CONTEXT_INVALIDATED" });
      }
      return Promise.reject(error);
    }
    
    if (!message || typeof message !== "object" || !message.type) {
      const error = new Error("Invalid message: must have 'type' property");
      console.error("[AdapterBase] Invalid message:", error);
      if (callback) {
        callback({ ok: false, reason: "INVALID_MESSAGE" });
      }
      return Promise.reject(error);
    }
    
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            const errorMessage = error.message || "";
            
            // Check for extension context invalidated error
            if (errorMessage.includes("Extension context invalidated") || 
                errorMessage.includes("message port closed") ||
                errorMessage.includes("Could not establish connection")) {
              const contextError = new Error("Extension context invalidated. Please reload the page to continue using Prompanion.");
              console.error(`[AdapterBase] Extension context invalidated (${message.type}):`, contextError);
              
              // Show user-friendly notification
              this._showContextInvalidatedNotification();
              
              if (callback) {
                callback({ ok: false, reason: "EXTENSION_CONTEXT_INVALIDATED" });
              }
              reject(contextError);
              return;
            }
            
            console.warn(`[AdapterBase] Message send failed (${message.type}):`, error);
            if (callback) {
              callback({ ok: false, reason: errorMessage || "MESSAGE_SEND_FAILED" });
            }
            reject(error);
            return;
          }
          
          if (callback) {
            callback(response ?? { ok: false });
          }
          resolve(response ?? { ok: false });
        });
      } catch (error) {
        const errorMessage = error?.message || "";
        
        // Check for extension context invalidated error in exception
        if (errorMessage.includes("Extension context invalidated") || 
            errorMessage.includes("message port closed") ||
            errorMessage.includes("Could not establish connection")) {
          const contextError = new Error("Extension context invalidated. Please reload the page to continue using Prompanion.");
          console.error(`[AdapterBase] Extension context invalidated (${message.type}):`, contextError);
          
          // Show user-friendly notification
          this._showContextInvalidatedNotification();
          
          if (callback) {
            callback({ ok: false, reason: "EXTENSION_CONTEXT_INVALIDATED" });
          }
          reject(contextError);
          return;
        }
        
        console.error(`[AdapterBase] Exception sending message (${message.type}):`, error);
        if (callback) {
          callback({ ok: false, reason: errorMessage || "EXCEPTION" });
        }
        reject(error);
      }
    });
  }

  /**
   * Shows a user-friendly notification when extension context is invalidated
   * @private
   */
  static _showContextInvalidatedNotification() {
    // Check if notification already exists
    if (document.getElementById("prompanion-context-invalidated-notification")) {
      return;
    }

    const notification = document.createElement("div");
    notification.id = "prompanion-context-invalidated-notification";
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    `;
    
    notification.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px;">Prompanion Extension Reloaded</div>
      <div style="opacity: 0.95;">Please reload this page to continue using Prompanion features.</div>
      <button id="prompanion-reload-page" style="
        margin-top: 12px;
        padding: 8px 16px;
        background: white;
        color: #ff4444;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        font-size: 13px;
      ">Reload Page</button>
    `;
    
    document.body.appendChild(notification);
    
    // Add click handler for reload button
    const reloadButton = notification.querySelector("#prompanion-reload-page");
    if (reloadButton) {
      reloadButton.addEventListener("click", () => {
        window.location.reload();
      });
    }
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.opacity = "0";
        notification.style.transition = "opacity 0.3s ease";
        setTimeout(() => {
          if (notification.parentElement) {
            notification.remove();
          }
        }, 300);
      }
    }, 10000);
  }
  
  /**
   * Convenience method to send a toggle panel message
   * @returns {Promise} Promise that resolves with the response
   */
  static togglePanel() {
    return this.sendMessage({ type: "PROMPANION_TOGGLE_PANEL" });
  }

  /**
   * Sets text content in an editable element (textarea or contentEditable)
   * Attempts multiple methods to ensure compatibility with various editors (including ProseMirror)
   * @param {HTMLElement} node - The editable element (textarea or contentEditable)
   * @param {string} text - The text to insert
   * @param {Object} options - Optional configuration
   * @param {boolean} options.verbose - Whether to log detailed debug information
   * @returns {boolean} True if text was set successfully, false otherwise
   */
  static setEditableElementText(node, text, options = {}) {
    const verbose = options.verbose || false;
    
    if (verbose) {
      console.log("[AdapterBase] setEditableElementText called with node:", node, "text:", text);
    }
    
    if (!node) {
      if (verbose) {
        console.log("[AdapterBase] setEditableElementText: no node provided");
      }
      return false;
    }
    
    // Method 1: Handle HTMLTextAreaElement
    if (node instanceof HTMLTextAreaElement) {
      if (verbose) {
        console.log("[AdapterBase] setEditableElementText: using textarea method");
      }
      node.value = text;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    
    // Method 2: Handle contentEditable elements
    if (node.isContentEditable) {
      if (verbose) {
        console.log("[AdapterBase] setEditableElementText: node is contentEditable, class:", node.className);
      }
      node.focus();
      
      // Try ProseMirror API first (generic pattern - ProseMirror is used by many editors)
      let pmView = null;
      
      if (verbose) {
        console.log("[AdapterBase] Searching for ProseMirror view...");
      }
      
      if (node.pmViewDesc?.pmView) {
        pmView = node.pmViewDesc.pmView;
        if (verbose) {
          console.log("[AdapterBase] Found ProseMirror view via node.pmViewDesc");
        }
      } else if (node.parentElement?.pmViewDesc?.pmView) {
        pmView = node.parentElement.pmViewDesc.pmView;
        if (verbose) {
          console.log("[AdapterBase] Found ProseMirror view via parent.pmViewDesc");
        }
      } else {
        // Walk up the DOM to find ProseMirror view
        let current = node;
        let depth = 0;
        while (current && !pmView && depth < 10) {
          if (current.pmViewDesc?.pmView) {
            pmView = current.pmViewDesc.pmView;
            if (verbose) {
              console.log("[AdapterBase] Found ProseMirror view at depth", depth);
            }
          }
          current = current.parentElement;
          depth++;
        }
      }
      
      // Use ProseMirror transaction if available
      if (pmView && pmView.state && pmView.dispatch) {
        if (verbose) {
          console.log("[AdapterBase] Attempting ProseMirror transaction method");
        }
        try {
          const pmState = pmView.state;
          const tr = pmState.tr;
          const schema = pmState.schema;
          const textNode = schema.text(text);
          tr.replaceWith(0, pmState.doc.content.size, textNode);
          pmView.dispatch(tr);
          if (verbose) {
            console.log("[AdapterBase] Successfully set text via ProseMirror transaction");
          }
          return true;
        } catch (e) {
          if (verbose) {
            console.warn("[AdapterBase] ProseMirror transaction failed:", e);
          }
        }
      } else if (verbose) {
        console.log("[AdapterBase] ProseMirror view not found or invalid");
      }
      
      // Method 3: Keyboard simulation (generic fallback)
      if (verbose) {
        console.log("[AdapterBase] Attempting keyboard simulation method");
      }
      try {
        const selection = window.getSelection();
        selection.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.addRange(range);
        
        if (verbose) {
          console.log("[AdapterBase] Selected all text in node");
        }
        
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
        
        // Simulate typing the new text character by character
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
        
        if (verbose) {
          console.log("[AdapterBase] Dispatched keyboard simulation events");
        }
        return true;
      } catch (e) {
        if (verbose) {
          console.warn("[AdapterBase] Keyboard simulation method failed:", e);
        }
        // Final fallback: direct textContent
        node.textContent = text;
        node.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
        if (verbose) {
          console.log("[AdapterBase] Used final fallback: direct textContent");
        }
        return true;
      }
    }
    
    if (verbose) {
      console.log("[AdapterBase] setEditableElementText: node is not contentEditable or textarea");
    }
    return false;
  }
}

// Export for use in adapters
if (typeof module !== "undefined" && module.exports) {
  module.exports = AdapterBase;
} else {
  window.AdapterBase = AdapterBase;
}


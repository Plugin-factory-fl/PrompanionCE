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
}

// Export for use in adapters
if (typeof module !== "undefined" && module.exports) {
  module.exports = AdapterBase;
} else {
  window.AdapterBase = AdapterBase;
}


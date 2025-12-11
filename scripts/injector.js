/**
 * Injector Script
 * Handles side panel injection and management on web pages
 */

const PANEL_CONTAINER_ID = "prompanion-sidepanel-container";
const PANEL_VISIBLE_CLASS = "prompanion-sidepanel-visible";
const PANEL_PUSH_CLASS = "prompanion-sidepanel-push";

/**
 * Ensures panel styles are injected into the page
 */
function ensureStyles() {
  if (document.getElementById(`${PANEL_CONTAINER_ID}-style`)) {
    return;
  }

  const style = document.createElement("style");
  style.id = `${PANEL_CONTAINER_ID}-style`;
  style.textContent = `
    #${PANEL_CONTAINER_ID} {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: min(546px, 94vw);
      transform: translateX(100%);
      transition: transform 160ms ease-in-out;
      z-index: 2147483647;
      box-shadow: -12px 0 32px rgba(17, 24, 39, 0.24);
      display: flex;
      flex-direction: column;
      background: transparent;
      pointer-events: none;
    }

    #${PANEL_CONTAINER_ID}.${PANEL_VISIBLE_CLASS} {
      transform: translateX(0);
      pointer-events: auto;
    }

    #${PANEL_CONTAINER_ID} iframe {
      border: none;
      width: 100%;
      height: 100%;
      background: #f5f7fb;
    }

    #${PANEL_CONTAINER_ID} .prompanion-close {
      position: absolute;
      top: 12px;
      left: -52px;
      width: 40px;
      height: 40px;
      border-radius: 20px 0 0 20px;
      border: none;
      background: #1f2a44;
      color: #ffffff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: -8px 0 14px rgba(17, 24, 39, 0.35);
      padding: 0;
      font-size: 18px;
      visibility: hidden;
      pointer-events: none;
      transition: visibility 0s linear 160ms, opacity 160ms ease;
      opacity: 0;
    }

    #${PANEL_CONTAINER_ID} .prompanion-close:hover {
      background: #162036;
    }

    #${PANEL_CONTAINER_ID}.${PANEL_VISIBLE_CLASS} .prompanion-close {
      visibility: visible;
      pointer-events: auto;
      transition-delay: 0s;
      opacity: 1;
    }

    /* Only apply margin to body, not both html and body, to avoid doubling the push */
    body.${PANEL_PUSH_CLASS} {
      margin-right: min(546px, 94vw);
      transition: margin-right 160ms ease-in-out;
      overflow-x: hidden;
    }
  `;

  document.head.append(style);
}

/**
 * Creates the side panel container if it doesn't exist
 * @returns {HTMLElement} Panel container element
 */
function createPanel() {
  ensureStyles();

  let container = document.getElementById(PANEL_CONTAINER_ID);
  if (container) {
    return container;
  }

  container = document.createElement("div");
  container.id = PANEL_CONTAINER_ID;

  const closeButton = document.createElement("button");
  closeButton.className = "prompanion-close";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.title = "Close Prompanion";
  closeButton.addEventListener("click", () => {
    closePanel(container);
  });

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sidepanel.html");
  iframe.setAttribute("allow", "clipboard-write");

  container.append(closeButton, iframe);
  document.documentElement.append(container);
  return container;
}

/**
 * Updates CSS custom property for panel width
 * @param {HTMLElement} container - Panel container element
 * @param {boolean} willShow - Whether panel will be visible
 */
function updatePanelOffset(container, willShow) {
  const width = willShow ? container.getBoundingClientRect().width : 0;
  document.documentElement.style.setProperty("--prompanion-panel-width", `${width}px`);
}

/**
 * Dispatches panel resize event
 */
function notifyPanelResize() {
  window.dispatchEvent(new CustomEvent("prompanion-panel-resize"));
}


/**
 * Finds Gemini's main layout container
 * @returns {HTMLElement|null} The main element or null
 */
function findGeminiMainContainer() {
  // Target the main element directly - simpler and more reliable
  const container = document.querySelector('#app-root > main') ||
                    document.querySelector('#app-root main') ||
                    document.querySelector('main');
  return container;
}

/**
 * Finds DeepSeek's main layout container
 * @returns {HTMLElement|null} The main container element or null
 */
function findDeepseekMainContainer() {
  // Use XPath to find the main content container: //*[@id="root"]/div/div
  try {
    const xpathResult = document.evaluate(
      '//*[@id="root"]/div/div',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const container = xpathResult.singleNodeValue;
    if (container instanceof HTMLElement) {
      return container;
    }
  } catch (error) {
    console.warn('[Prompanion] XPath error finding DeepSeek container:', error);
  }
  
  // Fallback: try querySelector approach
  const root = document.getElementById('root');
  if (root) {
    const firstDiv = root.querySelector('div');
    if (firstDiv) {
      const secondDiv = firstDiv.querySelector('div');
      if (secondDiv) {
        return secondDiv;
      }
      return firstDiv;
    }
  }
  
  return null;
}

/**
 * Checks if the current site supports content pushing
 * Some sites (like Gemini) have layouts that don't respond well to margin changes
 * @returns {boolean} True if pushing should be attempted
 */
function shouldPushContent() {
  const hostname = window.location.hostname;
  // Gemini uses a special container, so we handle it separately
  if (hostname.includes('gemini.google.com')) {
    return true; // We'll handle Gemini specially
  }
  return true;
}

/**
 * Applies push effect to Gemini's main container
 * @param {boolean} shouldPush - Whether to apply or remove the push
 */
function applyGeminiPush(shouldPush) {
  const container = findGeminiMainContainer();
  if (!container) {
    // If container not found, fall back to standard behavior
    console.log('[Prompanion] Gemini main container not found, using overlay mode');
    return false;
  }
  
  const panelWidthCalc = 'min(546px, 94vw)';
  
  if (shouldPush) {
    // Store original margin-right if it exists
    const computedStyle = window.getComputedStyle(container);
    const currentMarginRight = computedStyle.marginRight;
    
    if (!container.dataset.prompanionOriginalMarginRight) {
      container.dataset.prompanionOriginalMarginRight = currentMarginRight || '0px';
    }
    
    // Try margin-right first - simple and effective
    container.style.setProperty('margin-right', panelWidthCalc, 'important');
    container.style.setProperty('transition', 'margin-right 160ms ease-in-out');
    container.dataset.prompanionPushed = 'true';
    
    console.log('[Prompanion] Applied push to Gemini main container:', container);
  } else {
    // Restore original margin-right
    if (container.dataset.prompanionPushed === 'true') {
      const originalMarginRight = container.dataset.prompanionOriginalMarginRight;
      
      if (originalMarginRight && originalMarginRight !== '0px') {
        container.style.setProperty('margin-right', originalMarginRight, 'important');
      } else {
        container.style.removeProperty('margin-right');
      }
      
      container.style.removeProperty('transition');
      delete container.dataset.prompanionPushed;
      delete container.dataset.prompanionOriginalMarginRight;
      
      console.log('[Prompanion] Removed push from Gemini main container');
    }
  }
  
  return true; // Container found and handled
}

/**
 * Applies push effect to DeepSeek's main container
 * @param {boolean} shouldPush - Whether to apply or remove the push
 */
function applyDeepseekPush(shouldPush) {
  const container = findDeepseekMainContainer();
  if (!container) {
    // If container not found, fall back to standard behavior
    console.log('[Prompanion] DeepSeek main container not found, using overlay mode');
    return false;
  }
  
  const panelWidthCalc = 'min(546px, 94vw)';
  
  if (shouldPush) {
    // Store original margin-right if it exists
    const computedStyle = window.getComputedStyle(container);
    const currentMarginRight = computedStyle.marginRight;
    
    if (!container.dataset.prompanionOriginalMarginRight) {
      container.dataset.prompanionOriginalMarginRight = currentMarginRight || '0px';
    }
    
    // Apply margin-right to push content left
    container.style.setProperty('margin-right', panelWidthCalc, 'important');
    container.style.setProperty('transition', 'margin-right 160ms ease-in-out');
    container.dataset.prompanionPushed = 'true';
    
    console.log('[Prompanion] Applied push to DeepSeek main container:', container);
  } else {
    // Restore original margin-right
    if (container.dataset.prompanionPushed === 'true') {
      const originalMarginRight = container.dataset.prompanionOriginalMarginRight;
      
      if (originalMarginRight && originalMarginRight !== '0px') {
        container.style.setProperty('margin-right', originalMarginRight, 'important');
      } else {
        container.style.removeProperty('margin-right');
      }
      
      container.style.removeProperty('transition');
      delete container.dataset.prompanionPushed;
      delete container.dataset.prompanionOriginalMarginRight;
      
      console.log('[Prompanion] Removed push from DeepSeek main container');
    }
  }
  
  return true; // Container found and handled
}

/**
 * Toggles the side panel visibility
 */
function togglePanel() {
  const container = createPanel();
  const willShow = !container.classList.contains(PANEL_VISIBLE_CLASS);
  const hostname = window.location.hostname;
  const isGemini = hostname.includes('gemini.google.com');
  const isDeepseek = hostname.includes('deepseek.com') || hostname.includes('chat.deepseek.com');
  
  container.classList.toggle(PANEL_VISIBLE_CLASS, willShow);
  
  if (isGemini) {
    // Handle Gemini specially using its main container
    applyGeminiPush(willShow);
  } else if (isDeepseek) {
    // Handle DeepSeek specially using its main container
    applyDeepseekPush(willShow);
  } else {
    // Standard push behavior for other sites
    if (shouldPushContent() && document.body) {
      if (willShow) {
        document.body.classList.add(PANEL_PUSH_CLASS);
      } else {
        document.body.classList.remove(PANEL_PUSH_CLASS);
      }
    }
  }
  
  requestAnimationFrame(() => {
    updatePanelOffset(container, willShow);
    notifyPanelResize();
    setTimeout(notifyPanelResize, 180);
  });
}

/**
 * Opens the side panel
 */
function openPanel() {
  const container = createPanel();
  container.classList.add(PANEL_VISIBLE_CLASS);
  const hostname = window.location.hostname;
  const isGemini = hostname.includes('gemini.google.com');
  const isDeepseek = hostname.includes('deepseek.com') || hostname.includes('chat.deepseek.com');
  
  if (isGemini) {
    // Handle Gemini specially using its main container
    applyGeminiPush(true);
  } else if (isDeepseek) {
    // Handle DeepSeek specially using its main container
    applyDeepseekPush(true);
  } else {
    // Standard push behavior for other sites
    if (shouldPushContent() && document.body) {
      document.body.classList.add(PANEL_PUSH_CLASS);
    }
  }
  
  requestAnimationFrame(() => {
    updatePanelOffset(container, true);
    notifyPanelResize();
    setTimeout(notifyPanelResize, 180);
  });
}

/**
 * Closes the side panel
 * @param {HTMLElement} container - Panel container element
 */
function closePanel(container) {
  container.classList.remove(PANEL_VISIBLE_CLASS);
  const hostname = window.location.hostname;
  const isGemini = hostname.includes('gemini.google.com');
  const isDeepseek = hostname.includes('deepseek.com') || hostname.includes('chat.deepseek.com');
  
  if (isGemini) {
    // Handle Gemini specially using its main container
    applyGeminiPush(false);
  } else if (isDeepseek) {
    // Handle DeepSeek specially using its main container
    applyDeepseekPush(false);
  } else {
    // Standard push behavior for other sites
    if (shouldPushContent() && document.body) {
      document.body.classList.remove(PANEL_PUSH_CLASS);
    }
  }
  
  requestAnimationFrame(() => {
    updatePanelOffset(container, false);
    notifyPanelResize();
    setTimeout(notifyPanelResize, 180);
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "PROMPANION_TOGGLE_PANEL") {
    togglePanel();
    return;
  }

  if (message.type === "PROMPANION_OPEN_PANEL") {
    openPanel();
  }
});


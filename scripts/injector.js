/**
 * Injector Script
 * Handles side panel injection and management on web pages
 */

console.log('[Prompanion Injector] Script loaded at:', window.location.href);

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
 * Finds Bolt.new's main layout container
 * @returns {HTMLElement|null} The main container element or null
 */
function findBoltMainContainer() {
  console.log('[Prompanion Injector] Finding Bolt container...');
  
  // Use XPath to find the main container: //*[@id="root"]/div[2]
  try {
    const xpathResult = document.evaluate(
      '//*[@id="root"]/div[2]',
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    const container = xpathResult.singleNodeValue;
    console.log('[Prompanion Injector] XPath result:', container);
    if (container instanceof HTMLElement) {
      console.log('[Prompanion Injector] Bolt container found via XPath:', {
        tagName: container.tagName,
        className: container.className,
        id: container.id
      });
      return container;
    }
  } catch (error) {
    console.warn('[Prompanion Injector] XPath error finding Bolt container:', error);
  }
  
  // Fallback: try querySelector approach
  const root = document.getElementById('root');
  console.log('[Prompanion Injector] Root element:', root, 'children count:', root?.children?.length);
  if (root && root.children.length >= 2) {
    const container = root.children[1];
    console.log('[Prompanion Injector] Bolt container found via fallback:', {
      tagName: container.tagName,
      className: container.className,
      id: container.id
    });
    return container;
  }
  
  console.warn('[Prompanion Injector] Bolt container not found');
  return null;
}

/**
 * Applies push effect to Bolt.new's main container
 * @param {boolean} shouldPush - Whether to apply or remove the push
 */
function applyBoltPush(shouldPush) {
  console.log('[Prompanion Injector] applyBoltPush called:', shouldPush);
  console.log('[Prompanion Injector] window.__prompanionApplyBoltPush:', window.__prompanionApplyBoltPush);
  
  // First try to use the adapter's function if available
  if (window.__prompanionApplyBoltPush && typeof window.__prompanionApplyBoltPush === 'function') {
    console.log('[Prompanion Injector] Using adapter push function');
    try {
      window.__prompanionApplyBoltPush(shouldPush);
      return true;
    } catch (error) {
      console.error('[Prompanion Injector] Error calling adapter push function:', error);
      // Fall through to injector implementation
    }
  }
  
  console.log('[Prompanion Injector] Using injector push function');
  
  // Fallback: implement push logic directly
  const container = findBoltMainContainer();
  if (!container) {
    console.warn('[Prompanion Injector] Bolt main container not found, retrying after delay...');
    // Retry after a short delay in case DOM isn't ready
    setTimeout(() => {
      const retryContainer = findBoltMainContainer();
      if (retryContainer) {
        console.log('[Prompanion Injector] Container found on retry, applying push');
        applyBoltPushDirectly(retryContainer, shouldPush);
      } else {
        console.warn('[Prompanion Injector] Bolt main container still not found after retry');
      }
    }, 100);
    return false;
  }
  
  return applyBoltPushDirectly(container, shouldPush);
}

function applyBoltPushDirectly(container, shouldPush) {
  
  const panelWidthCalc = 'min(546px, 94vw)';
  
  if (shouldPush) {
    // Store original styles
    const computedStyle = window.getComputedStyle(container);
    const currentWidth = computedStyle.width;
    const currentMaxWidth = computedStyle.maxWidth;
    
    if (!container.dataset.prompanionOriginalWidth) {
      container.dataset.prompanionOriginalWidth = currentWidth || '';
    }
    if (!container.dataset.prompanionOriginalMaxWidth) {
      container.dataset.prompanionOriginalMaxWidth = currentMaxWidth || '';
    }
    
    const currentBoxSizing = computedStyle.boxSizing;
    if (!container.dataset.prompanionOriginalBoxSizing) {
      container.dataset.prompanionOriginalBoxSizing = currentBoxSizing || 'border-box';
    }
    
    // Apply push styles
    container.style.setProperty('width', `calc(100% - ${panelWidthCalc})`, 'important');
    container.style.setProperty('max-width', `calc(100% - ${panelWidthCalc})`, 'important');
    container.style.setProperty('flex-basis', `calc(100% - ${panelWidthCalc})`, 'important');
    container.style.setProperty('box-sizing', 'border-box', 'important');
    container.style.setProperty('transition', 'width 160ms ease-in-out, max-width 160ms ease-in-out, flex-basis 160ms ease-in-out, box-sizing 160ms ease-in-out');
    container.dataset.prompanionPushed = 'true';
    
    console.log('[Prompanion Injector] Push applied to Bolt main container:', {
      container,
      width: `calc(100% - ${panelWidthCalc})`,
      maxWidth: `calc(100% - ${panelWidthCalc})`,
      flexBasis: `calc(100% - ${panelWidthCalc})`
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
      
      console.log('[Prompanion Injector] Push removed from Bolt main container');
    }
  }
  
  return true;
}

/**
 * Finds ChatGPT's main layout container
 * @returns {HTMLElement|null} The main container element or null
 */
function findChatGPTMainContainer() {
  // Target the first div child of body: /html/body/div[1]
  try {
    const xpathResult = document.evaluate(
      '/html/body/div[1]',
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
    console.warn('[Prompanion] XPath error finding ChatGPT container:', error);
  }
  
  // Fallback: try querySelector approach
  if (document.body && document.body.firstElementChild) {
    const firstDiv = document.body.firstElementChild;
    if (firstDiv instanceof HTMLDivElement) {
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
    
    // Push applied to Gemini main container
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
      
      // Push removed from Gemini main container
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
    
    // Push applied to DeepSeek main container
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
      
      // Push removed from DeepSeek main container
    }
  }
  
  return true; // Container found and handled
}

/**
 * Applies push effect to ChatGPT's main container
 * @param {boolean} shouldPush - Whether to apply or remove the push
 */
function applyChatGPTPush(shouldPush) {
  const container = findChatGPTMainContainer();
  if (!container) {
    // If container not found, fall back to standard behavior
    console.log('[Prompanion] ChatGPT main container not found, using overlay mode');
    return false;
  }
  
  const panelWidthCalc = 'min(546px, 94vw)';
  
  if (shouldPush) {
    // Store original styles
    const computedStyle = window.getComputedStyle(container);
    const currentMarginRight = computedStyle.marginRight;
    const currentWidth = computedStyle.width;
    
    if (!container.dataset.prompanionOriginalMarginRight) {
      container.dataset.prompanionOriginalMarginRight = currentMarginRight || '0px';
    }
    if (!container.dataset.prompanionOriginalWidth) {
      container.dataset.prompanionOriginalWidth = currentWidth || 'auto';
    }
    
    // ChatGPT container likely has w-screen (width: 100vw), so margin-right alone won't work
    // We need to adjust the width to account for the panel
    // Try both: reduce width AND add margin-right for compatibility
    container.style.setProperty('width', `calc(100vw - ${panelWidthCalc})`, 'important');
    container.style.setProperty('margin-right', panelWidthCalc, 'important');
    container.style.setProperty('transition', 'width 160ms ease-in-out, margin-right 160ms ease-in-out');
    container.dataset.prompanionPushed = 'true';
    
    // Push applied to ChatGPT main container
  } else {
    // Restore original styles
    if (container.dataset.prompanionPushed === 'true') {
      const originalMarginRight = container.dataset.prompanionOriginalMarginRight;
      const originalWidth = container.dataset.prompanionOriginalWidth;
      
      if (originalMarginRight && originalMarginRight !== '0px') {
        container.style.setProperty('margin-right', originalMarginRight, 'important');
      } else {
        container.style.removeProperty('margin-right');
      }
      
      if (originalWidth && originalWidth !== 'auto') {
        container.style.setProperty('width', originalWidth, 'important');
      } else {
        container.style.removeProperty('width');
      }
      
      container.style.removeProperty('transition');
      delete container.dataset.prompanionPushed;
      delete container.dataset.prompanionOriginalMarginRight;
      delete container.dataset.prompanionOriginalWidth;
      
      // Push removed from ChatGPT main container
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
  const isChatGPT = hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com') || hostname.includes('sora.chatgpt.com');
  const isBolt = hostname.includes('bolt.new');
  
  console.log('[Prompanion Injector] togglePanel - hostname:', hostname, 'isBolt:', isBolt);
  
  container.classList.toggle(PANEL_VISIBLE_CLASS, willShow);
  
  if (isGemini) {
    // Handle Gemini specially using its main container
    applyGeminiPush(willShow);
  } else if (isDeepseek) {
    // Handle DeepSeek specially using its main container
    applyDeepseekPush(willShow);
  } else if (isChatGPT) {
    // Handle ChatGPT specially using its main container
    applyChatGPTPush(willShow);
  } else if (isBolt) {
    // Handle Bolt.new specially using its main container
    console.log('[Prompanion Injector] Calling applyBoltPush for Bolt');
    applyBoltPush(willShow);
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
  const isChatGPT = hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com') || hostname.includes('sora.chatgpt.com');
  const isBolt = hostname.includes('bolt.new');
  
  if (isGemini) {
    // Handle Gemini specially using its main container
    applyGeminiPush(true);
  } else if (isDeepseek) {
    // Handle DeepSeek specially using its main container
    applyDeepseekPush(true);
  } else if (isChatGPT) {
    // Handle ChatGPT specially using its main container
    applyChatGPTPush(true);
  } else if (isBolt) {
    // Handle Bolt.new specially using its main container
    applyBoltPush(true);
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
  const isChatGPT = hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com') || hostname.includes('sora.chatgpt.com');
  const isBolt = hostname.includes('bolt.new');
  
  if (isGemini) {
    // Handle Gemini specially using its main container
    applyGeminiPush(false);
  } else if (isDeepseek) {
    // Handle DeepSeek specially using its main container
    applyDeepseekPush(false);
  } else if (isChatGPT) {
    // Handle ChatGPT specially using its main container
    applyChatGPTPush(false);
  } else if (isBolt) {
    // Handle Bolt.new specially using its main container
    applyBoltPush(false);
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

  console.log('[Prompanion Injector] Message received:', message.type, 'hostname:', window.location.hostname);

  if (message.type === "PROMPANION_TOGGLE_PANEL") {
    console.log('[Prompanion Injector] PROMPANION_TOGGLE_PANEL received, calling togglePanel()');
    togglePanel();
    return;
  }

  if (message.type === "PROMPANION_OPEN_PANEL") {
    console.log('[Prompanion Injector] PROMPANION_OPEN_PANEL received, calling openPanel()');
    openPanel();
  }
});


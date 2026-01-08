// ============================================================================
// LabsGoogle Adapter for labs.google.com
// ============================================================================

console.log("[PromptProfile™ LabsGoogle] ========== ADAPTER.JS LOADING ==========");
console.log("[PromptProfile™ LabsGoogle] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™ LabsGoogle] Location:", window.location.href);

// Import constants from AdapterBase
if (typeof AdapterBase === "undefined") {
  console.error("[PromptProfile™ LabsGoogle] AdapterBase is not available! Make sure Base/AdapterBase.js is loaded first.");
  throw new Error("AdapterBase must be loaded before adapter.js");
}

const BUTTON_ID = "promptprofile-labs-google-trigger";
const BUTTON_CLASS = AdapterBase.BUTTON_CLASS;
const SELECTION_TOOLBAR_ID = AdapterBase.SELECTION_TOOLBAR_ID;
const SELECTION_TOOLBAR_VISIBLE_CLASS = AdapterBase.SELECTION_TOOLBAR_VISIBLE_CLASS;
const BUTTON_SIZE = AdapterBase.BUTTON_SIZE;

let domObserverStarted = false;
let enhanceTooltipElement = null;
let enhanceTooltipTimer = null;
let enhanceTooltipDismissed = false;
let enhanceTooltipActiveTextarea = null;
let lastEnhanceTextSnapshot = "";
let enhanceTooltipResizeHandler = null;
let floatingButtonElement = null;
let floatingButtonWrapper = null;
let floatingButtonTargetInput = null;
let enhanceActionInFlight = false;

function ensureStyle() {
  AdapterBase.ensureStyle();
}

function nodeInComposer(node) {
  const element = AdapterBase.getElementFromNode(node);
  if (!element) return false;
  return !!(
    element.closest("textarea") ||
    element.closest("[contenteditable='true']") ||
    element.closest(".input-container")
  );
}

function selectionWithinComposer(selection) {
  return selection && (nodeInComposer(selection.anchorNode) || nodeInComposer(selection.focusNode));
}

function initSelectionToolbar() {
  AdapterBase.initSelectionToolbar({
    shouldShowToolbar: (selection) => {
      const text = selection?.toString().trim();
      return !!(selection && !selection.isCollapsed && text && 
                !selectionWithinComposer(selection));
    },
    onAction: (text) => {
      submitSelectionToSideChat(text);
    },
    buttonText: "Elaborate",
    toolbarId: SELECTION_TOOLBAR_ID,
    visibleClass: SELECTION_TOOLBAR_VISIBLE_CLASS
  });
}

async function submitSelectionToSideChat(text) {
  const snippet = typeof text === "string" ? text.trim() : "";
  if (!snippet) return;

  try {
    AdapterBase.sendMessage({ 
      type: "PROMPANION_SIDECHAT_REQUEST", 
      text: snippet,
      chatHistory: []
    }, (response) => {
      if (!response?.ok) {
        console.warn("PromptProfile™: sidechat request rejected", response?.reason);
      }
    }).catch((error) => {
      console.warn("PromptProfile™: failed to request sidechat from selection", error);
    });
  } catch (error) {
    console.error("PromptProfile™: sidechat request threw synchronously", error);
  }
}

function handleSelectionChange() {
  AdapterBase.requestSelectionToolbarUpdate();
}

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
      console.warn("[PromptProfile™ LabsGoogle] Enhancement request failed:", error);
      return { ok: false, reason: "UNKNOWN_ERROR" };
    });
}

function findComposerNode() {
  let composerNode = enhanceTooltipActiveTextarea ?? floatingButtonTargetInput;
  if (composerNode) return composerNode;

  const composer = locateComposer();
  return composer?.input || null;
}

function setComposerText(node, text) {
  return AdapterBase.setEditableElementText(node, text, { verbose: true });
}

function showLabsTooltip(button) {
  AdapterBase.ensureTooltipResources(BUTTON_ID);
  const data = AdapterBase.tooltipRegistry.get(button);
  const container = document.getElementById(`${BUTTON_ID}-tooltip-layer`);
  if (!data || !container) return;
  
  let tooltip = button._promptprofileTooltip;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "promptprofile-tooltip";
    tooltip.setAttribute("role", "tooltip");
    const text = document.createElement("span");
    text.textContent = data.text;
    const hidden = document.createElement("span");
    hidden.className = "promptprofile-visually-hidden";
    hidden.textContent = data.text;
    tooltip.append(text, hidden);
    button._promptprofileTooltip = tooltip;
    container.append(tooltip);
  }
  
  const rect = button.getBoundingClientRect();
  tooltip.style.top = `${rect.top + window.scrollY - 5}px`;
  tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
  tooltip.style.transform = "translate(-50%, -100%)";
  tooltip.classList.add("is-visible");
}

function buildButton() {
  ensureStyle();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  
  // Force critical styles to prevent site CSS overrides
  button.style.borderRadius = "50%";
  button.style.background = "linear-gradient(135deg, #10152b, #1f2a44)";
  button.style.border = "none";
  button.style.width = BUTTON_SIZE.element;
  button.style.height = BUTTON_SIZE.element;
  button.style.padding = "0";
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.boxShadow = "0 6px 16px rgba(31, 42, 68, 0.25)";
  button.style.cursor = "pointer";
  
  button.append(createIcon());
  AdapterBase.attachTooltip(button, "Open PromptProfile™ to enhance your prompts.", BUTTON_ID);
  button.addEventListener("click", () => AdapterBase.togglePanel()
    .catch((e) => console.error("PromptProfile™: failed to open sidebar", e)));
  button.addEventListener("mouseenter", () => showLabsTooltip(button));
  button.addEventListener("focus", () => showLabsTooltip(button));
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

function positionFloatingButton(inputNode) {
  if (!floatingButtonElement) ensureFloatingButton();
  
  let targetContainer = null;
  let referenceElement = null;
  
  try {
    // Try primary XPath first
    const xpath = '/html/body/app-root/app-main-page/div[2]/div/app-campaign-library/div/div[1]/div[2]/div[1]/div/button';
    const xpathResult = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    referenceElement = xpathResult.singleNodeValue;
    
    if (!referenceElement) {
      // Fallback: search for the specific button class from your code snippet
      referenceElement = document.querySelector("button.prompt-send-button");
    }
    
    if (referenceElement && referenceElement instanceof HTMLElement) {
      targetContainer = referenceElement.parentElement;
      console.log("[PromptProfile™ LabsGoogle] Target button found");
    }
  } catch (error) {
    console.warn("[PromptProfile™ LabsGoogle] Reference detection error:", error);
  }
  
  if (!targetContainer || !referenceElement) {
    // Even if no inputNode, keep retrying for the button
    setTimeout(() => positionFloatingButton(inputNode), 1000);
    return;
  }
  
  const containerStyle = getComputedStyle(targetContainer);
  if (containerStyle.position === "static") {
    targetContainer.style.position = "relative";
  }
  
  const referenceRect = referenceElement.getBoundingClientRect();
  const containerRect = targetContainer.getBoundingClientRect();
  
  // Calculate spacing - place 5px to the left of reference button
  const referenceLeftFromContainer = containerRect.right - referenceRect.left;
  const spacingBetween = 5; 
  const spacing = referenceLeftFromContainer + spacingBetween;
  
  let topOffset = "50%";
  const referenceCenter = referenceRect.top + referenceRect.height / 2;
  const containerTop = containerRect.top;
  topOffset = `${referenceCenter - containerTop}px`;
  
  ensureFloatingButton();
  
  if (floatingButtonWrapper.parentElement !== targetContainer) {
    targetContainer.appendChild(floatingButtonWrapper);
  }
  
  floatingButtonWrapper.style.position = "absolute";
  floatingButtonWrapper.style.top = topOffset;
  floatingButtonWrapper.style.right = `${spacing}px`;
  floatingButtonWrapper.style.transform = "translateY(-50%)";
  floatingButtonWrapper.style.left = "auto";
  floatingButtonWrapper.style.display = "flex";
  console.log("[PromptProfile™ LabsGoogle] Button positioned at:", spacing, "px from right");
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  let observerTimeout = null;
  const observer = new MutationObserver(() => {
    if (observerTimeout) clearTimeout(observerTimeout);
    observerTimeout = setTimeout(() => {
      if (document.hidden) return;
      const composer = locateComposer();
      if (composer) {
        setupEnhanceTooltip(composer.input, composer.container);
        positionFloatingButton(composer.input);
      } else {
        positionFloatingButton(null);
      }
    }, 500);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  const selectors = [
    "textarea.mat-mdc-input-element",
    "textarea#mat-input-0",
    "textarea[placeholder*='Describe']",
    "textarea"
  ];

  let input = null;
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      input = element;
      console.log("[PromptProfile™ LabsGoogle] Composer found with selector:", selector);
      break;
    }
  }

  if (!input) {
    console.warn("[PromptProfile™ LabsGoogle] No composer input found");
    return null;
  }

  const container = input.closest(".input-container") || 
                    input.closest("mat-form-field") ||
                    input.parentElement;
  
  return { input, container };
}

function init() {
  // Initialize sticky button (no injection logic needed)
  AdapterBase.initStickyButton({ position: 'bottom-right', offsetX: 250, offsetY: 250 });
  
  const composer = locateComposer();
  if (composer) {
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  ensureDomObserver();
  return false;
}

function handleInsertTextMessage(message, sender, sendResponse) {
  try {
    const textToInsert = typeof message.text === "string" ? message.text.trim() : "";
    if (!textToInsert) {
      sendResponse({ ok: false, reason: "EMPTY_TEXT" });
      return false;
    }

    const composerNode = findComposerNode();
    if (!composerNode) {
      sendResponse({ ok: false, reason: "NO_COMPOSER_NODE" });
      return false;
    }

    const success = setComposerText(composerNode, textToInsert);
    sendResponse({ ok: success });
    return false;
  } catch (error) {
    console.error("[PromptProfile™ LabsGoogle] Insert text handler failed", error);
    sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
    return false;
  }
}

AdapterBase.registerMessageHandler("PROMPANION_INSERT_TEXT", handleInsertTextMessage);

function bootstrap() {
  initSelectionToolbar();
  if (!init()) {
    const observer = new MutationObserver(() => {
      if (init()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function setupEnhanceTooltip(input, container) {
  if (!input) return;
  if (enhanceTooltipActiveTextarea !== input) {
    teardownEnhanceTooltip();
    enhanceTooltipActiveTextarea = input;
    enhanceTooltipDismissed = false;
    lastEnhanceTextSnapshot = "";
    ensureEnhanceTooltipElement();
    bindInputEvents(input);
  } else if (!enhanceTooltipElement || !enhanceTooltipElement.isConnected) {
    ensureEnhanceTooltipElement();
  }
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
  hideEnhanceTooltip();
  detachTooltipResizeHandler();
}

function ensureEnhanceTooltipElement() {
  if (enhanceTooltipElement) {
    if (!enhanceTooltipElement.isConnected) document.body.append(enhanceTooltipElement);
    return;
  }

  enhanceTooltipElement = document.createElement("div");
  enhanceTooltipElement.className = "promptprofile-enhance-tooltip";
  
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "promptprofile-enhance-tooltip__dismiss";
  dismiss.textContent = "×";
  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    enhanceTooltipDismissed = true;
    hideEnhanceTooltip();
  });

  const action = document.createElement("button");
  action.type = "button";
  action.className = "promptprofile-enhance-tooltip__action";
  AdapterBase.setButtonTextContent(action, "Refine");
  
  enhanceTooltipElement.append(dismiss, action);
  document.body.append(enhanceTooltipElement);
}

// Global mousedown capture for Refine button
document.addEventListener("mousedown", (e) => {
  const refineButton = e.target.closest(".promptprofile-enhance-tooltip__action");
  if (refineButton && !refineButton.classList.contains("promptprofile-enhance-tooltip__upgrade")) {
    handleRefineButtonClick(e);
  }
}, true);

document.addEventListener("click", (e) => {
  if (e.target.closest(".promptprofile-enhance-tooltip__action")) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

async function handleRefineButtonClick(e) {
  if (e && e.preventDefault) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (enhanceActionInFlight) return false;

  // Force a re-locate of the composer right now
  const composer = locateComposer();
  let composerNode = composer?.input || enhanceTooltipActiveTextarea || floatingButtonTargetInput;
  
  if (!composerNode) {
    console.error("[PromptProfile™ LabsGoogle] Refine failed: No composer node found");
    return false;
  }

  const promptText = (composerNode.value || composerNode.textContent || "").trim();
  if (!promptText) {
    console.warn("[PromptProfile™ LabsGoogle] Refine ignored: Text is empty");
    return false;
  }

  // Save current prompt version before refining
  AdapterBase.savePromptVersion(composerNode, promptText);

  console.log("[PromptProfile™ LabsGoogle] Text to refine:", promptText.substring(0, 50));
  enhanceActionInFlight = true;
  
  const actionButton = enhanceTooltipElement?.querySelector(".promptprofile-enhance-tooltip__action");
  if (actionButton) {
    actionButton.disabled = true;
    AdapterBase.setButtonTextContent(actionButton, "Refining...");
    enhanceTooltipElement.classList.add("is-loading");
  }

  try {
    const result = await requestPromptEnhancement(promptText);
    console.log("[PromptProfile™ LabsGoogle] Enhancement result received:", result);

    if (result && result.ok) {
      const refinedText = (result.optionA && typeof result.optionA === "string") ? result.optionA.trim() : promptText;
      
      const success = setComposerText(composerNode, refinedText);
      console.log("[PromptProfile™ LabsGoogle] Insertion success:", success);
      
      // Show undo button after successful refinement
      AdapterBase.showUndoButton(composerNode);
      
      hideEnhanceTooltip();
      enhanceTooltipDismissed = true;

      // Final UI polish for Angular/Material
      setTimeout(() => {
        composerNode.focus();
        composerNode.dispatchEvent(new Event("input", { bubbles: true }));
        composerNode.dispatchEvent(new Event("change", { bubbles: true }));
        // Some Angular components need a 'blur' and 'focus' to register external changes
        composerNode.dispatchEvent(new Event("blur", { bubbles: true }));
        composerNode.focus();
      }, 50);
    } else if (result?.error === "LIMIT_REACHED") {
      showUpgradeButtonInTooltip();
    }
  } catch (err) {
    console.error("[PromptProfile™ LabsGoogle] Refine process error:", err);
  } finally {
    enhanceActionInFlight = false;
    if (enhanceTooltipElement) {
      enhanceTooltipElement.classList.remove("is-loading");
      if (actionButton && !enhanceTooltipElement.classList.contains("show-upgrade")) {
        actionButton.disabled = false;
        AdapterBase.setButtonTextContent(actionButton, "Refine");
      }
    }
  }
}

function bindInputEvents(input) {
  input.addEventListener("input", handleInputChange);
  input.addEventListener("keyup", handleInputChange);
  input.addEventListener("focus", handleInputChange);
  input.addEventListener("blur", handleInputBlur);
  handleInputChange();
}

function handleInputChange() {
  if (!enhanceTooltipActiveTextarea) return;
  const rawText = "value" in enhanceTooltipActiveTextarea ? enhanceTooltipActiveTextarea.value : enhanceTooltipActiveTextarea.textContent ?? "";
  const text = rawText.trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (text === lastEnhanceTextSnapshot) return;
  
  // If user changed the text significantly, allow showing tooltip again
  if (enhanceTooltipDismissed && Math.abs(text.length - lastEnhanceTextSnapshot.length) > 5) {
    enhanceTooltipDismissed = false;
  }
  
  lastEnhanceTextSnapshot = text;

  if (wordCount < 3) {
    hideEnhanceTooltip();
    enhanceTooltipDismissed = false;
    clearTimeout(enhanceTooltipTimer);
    enhanceTooltipTimer = null;
    return;
  }

  if (enhanceTooltipDismissed) return;
  scheduleEnhanceTooltip();
}

function handleInputBlur() {
  if (enhanceActionInFlight) return;
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = null;
  hideEnhanceTooltip();
}

function scheduleEnhanceTooltip() {
  clearTimeout(enhanceTooltipTimer);
  enhanceTooltipTimer = window.setTimeout(() => {
    if (!enhanceTooltipActiveTextarea) return;
    const text = "value" in enhanceTooltipActiveTextarea ? enhanceTooltipActiveTextarea.value : enhanceTooltipActiveTextarea.textContent ?? "";
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount >= 3 && !enhanceTooltipDismissed) {
      showEnhanceTooltip();
    }
  }, 1000);
}

function showEnhanceTooltip() {
  if (!enhanceTooltipElement) ensureEnhanceTooltipElement();
  if (!enhanceTooltipElement) return;
  
  // Reset button state whenever showing
  const actionButton = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__action");
  if (actionButton && !enhanceActionInFlight) {
    actionButton.disabled = false;
    AdapterBase.setButtonTextContent(actionButton, "Refine");
  }

  if (enhanceTooltipElement.classList.contains("is-visible")) return;
  positionEnhanceTooltip();
  enhanceTooltipElement.classList.add("is-visible");
  attachTooltipResizeHandler();
}

function hideEnhanceTooltip() {
  if (!enhanceTooltipElement) return;
  enhanceTooltipElement.classList.remove("is-visible");
  enhanceTooltipElement.classList.remove("is-loading");
  enhanceActionInFlight = false;
  
  const actionButton = enhanceTooltipElement.querySelector(".promptprofile-enhance-tooltip__action");
  if (actionButton && !enhanceTooltipElement.classList.contains("show-upgrade")) {
    actionButton.disabled = false;
    AdapterBase.setButtonTextContent(actionButton, "Refine");
  }
  
  detachTooltipResizeHandler();
}

function showUpgradeButtonInTooltip() {
  // Ensure tooltip element exists and is visible
  if (!enhanceTooltipElement) {
    ensureEnhanceTooltipElement();
  }
  if (!enhanceTooltipElement) {
    console.error("[PromptProfile™ LabsGoogle] Cannot show upgrade button - tooltip element not found");
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
    // Remove old click handlers by cloning
    const newAction = action.cloneNode(true);
    action.replaceWith(newAction);
    
    // Update the new button
    newAction.className = "promptprofile-enhance-tooltip__action promptprofile-enhance-tooltip__upgrade";
    AdapterBase.setButtonTextContent(newAction, "Upgrade for more uses!");
    
    // Add upgrade click handler
    newAction.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await AdapterBase.handleStripeCheckout(newAction);
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

if (document.readyState === "complete" || document.readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}

document.addEventListener("selectionchange", handleSelectionChange);
window.addEventListener("scroll", handleSelectionChange, true);
window.addEventListener("resize", handleSelectionChange);


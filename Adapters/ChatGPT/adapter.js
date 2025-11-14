const BUTTON_ID = "prompanion-chatgpt-trigger";
const BUTTON_CLASS = "prompanion-chatgpt-trigger";
const SELECTION_TOOLBAR_ID = "prompanion-selection-toolbar";
const SELECTION_TOOLBAR_VISIBLE_CLASS = "is-visible";
const HIGHLIGHT_BUTTON_SELECTORS = [
  "[data-testid='select-to-ask__ask-button']",
  "[data-testid='select-to-ask__askbutton']",
  "button[aria-label='Ask ChatGPT']",
  "button[aria-label='Ask ChatGPT automatically']"
];

const BUTTON_SIZE = {
  wrapper: "44px",
  element: "39px",
  icon: "34px"
};
let domObserverStarted = false;
const tooltipRegistry = new WeakMap();

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

const styles = `
  .${BUTTON_CLASS} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    width: ${BUTTON_SIZE.wrapper};
    height: ${BUTTON_SIZE.wrapper};
    padding: 0;
    background: linear-gradient(135deg, #10152b, #1f2a44);
    box-shadow: 0 6px 16px rgba(31, 42, 68, 0.25);
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }

  .${BUTTON_CLASS}:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(31, 42, 68, 0.3);
  }

  .${BUTTON_CLASS}:focus-visible {
    outline: 2px solid #246bff;
    outline-offset: 2px;
  }

  .${BUTTON_CLASS}__icon {
    width: ${BUTTON_SIZE.icon};
    height: ${BUTTON_SIZE.icon};
    border-radius: 50%;
    display: block;
    background-color: #162036;
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .prompanion-enhance-tooltip {
    position: fixed;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: rgba(12, 18, 32, 0.9);
    color: #e9edff;
    box-shadow: 0 18px 40px rgba(8, 12, 28, 0.45);
    transform: translate(-50%, 6px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease, transform 140ms ease;
    z-index: 2147483000;
  }

  .prompanion-enhance-tooltip.is-visible {
    opacity: 1;
    transform: translate(-50%, 0);
    pointer-events: auto;
  }

  .prompanion-enhance-tooltip button {
    border: none;
    cursor: pointer;
  }

  .prompanion-enhance-tooltip__dismiss {
    width: 24px;
    height: 24px;
    border-radius: 12px;
    background: transparent;
    color: rgba(233, 237, 255, 0.6);
    display: grid;
    place-items: center;
    font-size: 14px;
    line-height: 1;
  }

  .prompanion-enhance-tooltip__dismiss:hover {
    background: rgba(233, 237, 255, 0.14);
    color: #ffffff;
  }

  .prompanion-enhance-tooltip__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 9999px;
    background: #3a7bff;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 10px 26px rgba(58, 123, 255, 0.35);
  }

  .prompanion-enhance-tooltip__action:hover {
    background: #2957c7;
  }

  #${SELECTION_TOOLBAR_ID} {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 0;
    background: rgba(12, 18, 32, 0.95);
    color: #f5f8ff;
    border-radius: 9999px;
    box-shadow: 0 12px 28px rgba(8, 12, 28, 0.45);
    padding: 0;
    margin: 0;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-6px);
    transition: opacity 140ms ease, transform 140ms ease;
    z-index: 2147483647;
  }

  #${SELECTION_TOOLBAR_ID}.${SELECTION_TOOLBAR_VISIBLE_CLASS} {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__button {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 9999px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__button:hover,
  #${SELECTION_TOOLBAR_ID} .prompanion-selection-toolbar__button:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }
`;

function ensureStyle() {
  let style = document.getElementById(`${BUTTON_ID}-style`);
  if (!style) {
    style = document.createElement("style");
    style.id = `${BUTTON_ID}-style`;
    document.head.append(style);
  }
  if (style.textContent !== styles) style.textContent = styles;
}

function getElementFromNode(node) {
  if (!node) return null;
  if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
  return node instanceof HTMLElement ? node : null;
}

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
  const element = getElementFromNode(node);
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
    if (getHighlightButton()) requestSelectionToolbarUpdate();
  });
  highlightObserver.observe(document.body, { childList: true, subtree: true });
}

function nodeInComposer(node) {
  const element = getElementFromNode(node);
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

function ensureSelectionToolbar() {
  if (selectionToolbarElement) return selectionToolbarElement;
  const toolbar = document.createElement("div");
  toolbar.id = SELECTION_TOOLBAR_ID;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "prompanion-selection-toolbar__button";
  button.textContent = "Ask Prompanion";
  button.addEventListener("pointerdown", (e) => e.preventDefault());
  button.addEventListener("mousedown", (e) => e.stopPropagation());
  button.addEventListener("click", handleSelectionToolbarAction);
  toolbar.append(button);
  document.body.append(toolbar);
  selectionToolbarElement = toolbar;
  selectionToolbarButton = button;
  return toolbar;
}

function hideSelectionToolbar() {
  if (selectionToolbarElement) {
    selectionToolbarElement.classList.remove(SELECTION_TOOLBAR_VISIBLE_CLASS);
    selectionToolbarElement.style.visibility = "";
  }
  selectionToolbarText = "";
}

function getSelectionRect(selection) {
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

function requestSelectionToolbarUpdate() {
  if (selectionUpdateRaf !== null) return;
  selectionUpdateRaf = window.requestAnimationFrame(() => {
    selectionUpdateRaf = null;
    updateSelectionToolbar();
  });
}

function updateSelectionToolbar() {
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!selection || selection.isCollapsed || !text || selectionWithinComposer(selection) || 
      !selectionTargetsAssistant(selection)) {
    hideSelectionToolbar();
    return;
  }
  const highlightButton = getHighlightButton();
  const rangeRect = getSelectionRect(selection);
  if (!highlightButton || !rangeRect) {
    hideSelectionToolbar();
    return;
  }

  const toolbar = ensureSelectionToolbar();
  if (selectionToolbarButton) {
    selectionToolbarButton.disabled = highlightButton.disabled ?? false;
  }
  selectionToolbarText = text;
  toolbar.style.visibility = "hidden";
  toolbar.classList.add(SELECTION_TOOLBAR_VISIBLE_CLASS);

  const { offsetWidth: w, offsetHeight: h } = toolbar;
  const { clientWidth: vw, clientHeight: vh } = document.documentElement;
  const { left: hl, width: hw, height: hh } = highlightButton.getBoundingClientRect();
  let left = Math.max(window.scrollX + 8, Math.min(window.scrollX + vw - w - 8, hl + hw / 2 + window.scrollX - w / 2));
  let top = Math.max(window.scrollY + 8, Math.min(window.scrollY + vh - h - 8, rangeRect.bottom + window.scrollY + hh + 8));
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  toolbar.style.visibility = "";
}

function submitSelectionToSideChat(text) {
  const snippet = typeof text === "string" ? text.trim() : "";
  if (!snippet || selectionAskInFlight) return;
  selectionAskInFlight = true;
  try {
    chrome.runtime.sendMessage({ type: "PROMPANION_SIDECHAT_REQUEST", text: snippet }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("Prompanion: failed to request sidechat from selection", chrome.runtime.lastError);
      } else if (!response?.ok) {
        console.warn("Prompanion: sidechat request rejected", response?.reason);
      }
      selectionAskInFlight = false;
    });
  } catch (error) {
    console.error("Prompanion: sidechat request threw synchronously", error);
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

function handleSelectionChange() {
  requestSelectionToolbarUpdate();
}

function setButtonTextContent(button, text) {
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
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "PROMPANION_PREPARE_ENHANCEMENT", prompt: promptText, openPanel: false },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Prompanion: enhancement request failed", chrome.runtime.lastError);
          resolve({ ok: false });
          return;
        }
        resolve(response ?? { ok: false });
      });
  });
}

function setComposerText(node, text) {
  if (!node) return false;
  if (node instanceof HTMLTextAreaElement) {
    node.value = text;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (node.isContentEditable) {
    node.focus();
    node.textContent = text;
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      selection.addRange(range);
    }
    node.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    return true;
  }
  return false;
}

function buildButton() {
  ensureStyle();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.append(createIcon());
  attachTooltip(button);
  button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "PROMPANION_TOGGLE_PANEL" })
    .catch((e) => console.error("Prompanion: failed to open sidebar from ChatGPT adapter", e)));
  button.addEventListener("mouseenter", () => showTooltip(button));
  button.addEventListener("focus", () => showTooltip(button));
  button.addEventListener("mouseleave", () => hideTooltip(button));
  button.addEventListener("blur", () => hideTooltip(button));
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
  positionFloatingButton(inputNode, floatingButtonTargetContainer);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  if (!floatingButtonWrapper) return;
  const target = containerNode ?? inputNode;
  if (!target) return;
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }
  if (floatingButtonWrapper.parentElement !== target) {
    target.append(floatingButtonWrapper);
  }
  floatingButtonWrapper.style.top = "50%";
  floatingButtonWrapper.style.right = "12px";
  floatingButtonWrapper.style.transform = "translateY(-50%)";
}

function refreshFloatingButtonPosition() {
  if (floatingButtonTargetInput) {
    positionFloatingButton(floatingButtonTargetInput, floatingButtonTargetContainer);
  }
}

function ensureDomObserver() {
  if (domObserverStarted) return;
  const observer = new MutationObserver(() => {
    requestSelectionToolbarUpdate();
    const composer = locateComposer();
    if (composer) {
      placeButton(composer.container, composer.input);
      setupEnhanceTooltip(composer.input, composer.container);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  domObserverStarted = true;
}

function locateComposer() {
  const wrappers = ["[data-testid='conversation-turn-textbox']", "[data-testid='composer-container']", "main form"]
    .map(sel => document.querySelector(sel)).filter(Boolean);
  let input = null;
  for (const wrapper of wrappers) {
    const editable = wrapper.querySelector("[data-testid='textbox'][contenteditable='true']") ??
                     wrapper.querySelector("div[contenteditable='true']");
    if (editable instanceof HTMLElement) { input = editable; break; }
  }
  if (!input) {
    const textarea = document.querySelector("[data-testid='conversation-turn-textbox'] textarea:not([readonly])");
    if (textarea instanceof HTMLTextAreaElement && !textarea.className.includes("_fallbackTextarea")) input = textarea;
  }
  if (!input) return null;
  return { input, container: input.closest("[data-testid='composer-footer']") ??
                             input.closest("[data-testid='composer-container']") ??
                             input.parentElement ?? document.body };
}

function init() {
  const composer = locateComposer();
  requestSelectionToolbarUpdate();
  if (composer) {
    placeButton(composer.container, composer.input);
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    return true;
  }
  ensureDomObserver();
  return false;
}

function bootstrap() {
  ensureHighlightObserver();
  if (!init()) {
    const observer = new MutationObserver(() => {
      if (init()) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function attachTooltip(button) {
  ensureTooltipResources();
  tooltipRegistry.set(button, { text: "Open Prompanion to enhance your prompts for the best response." });
}

function ensureTooltipResources() {
  if (!document.getElementById(`${BUTTON_ID}-tooltip-style`)) {
    const style = document.createElement("style");
    style.id = `${BUTTON_ID}-tooltip-style`;
    style.textContent = `
      #${BUTTON_ID}-tooltip-layer {
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

  if (!document.getElementById(`${BUTTON_ID}-tooltip-layer`)) {
    const container = document.createElement("div");
    container.id = `${BUTTON_ID}-tooltip-layer`;
    document.body.append(container);
  }
}

function showTooltip(button) {
  const data = tooltipRegistry.get(button);
  const container = document.getElementById(`${BUTTON_ID}-tooltip-layer`);
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
  positionTooltip(button, tooltip);
  tooltip.classList.add("is-visible");
}

function hideTooltip(button) {
  const tooltip = button._prompanionTooltip;
  tooltip?.classList.remove("is-visible");
}

function positionTooltip(button, tooltip) {
  const rect = button.getBoundingClientRect();
  tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
  tooltip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
}

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
    setButtonTextContent(action, "Refine");
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
    console.log("[Prompanion] Refine action already in flight, ignoring");
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
    console.log("[Prompanion] No prompt text, returning");
    return;
  }
  enhanceActionInFlight = true;
  enhanceTooltipDismissed = true;
  hideEnhanceTooltip();
  console.log("[Prompanion] Requesting prompt enhancement...");
  requestPromptEnhancement(promptText)
    .then((result) => {
      console.log("[Prompanion] Enhancement result:", result);
      const refinedText = result?.ok && typeof result.optionA === "string" && result.optionA.trim()
        ? result.optionA.trim() : promptText;
      console.log("[Prompanion] Setting refined text:", refinedText);
      const success = setComposerText(composerNode, refinedText);
      console.log("[Prompanion] setComposerText success:", success);
    })
    .catch((error) => console.error("Prompanion: refine request threw", error))
    .finally(() => { enhanceActionInFlight = false; });
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

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}

document.addEventListener("selectionchange", handleSelectionChange);
window.addEventListener("scroll", handleSelectionChange, true);
window.addEventListener("resize", handleSelectionChange);

window.addEventListener("prompanion-panel-resize", () => {
  refreshFloatingButtonPosition();
});

document.addEventListener("click", (e) => {
  const tooltipVisible = enhanceTooltipElement?.classList.contains("is-visible");
  if (tooltipVisible) {
    console.log("[Prompanion] ========== CLICK DETECTED (tooltip visible) ==========");
    const button = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__action");
    const buttonRect = button?.getBoundingClientRect();
    const clickX = e.clientX;
    const clickY = e.clientY;
    const inButtonBounds = buttonRect && clickX >= buttonRect.left && clickX <= buttonRect.right && 
                           clickY >= buttonRect.top && clickY <= buttonRect.bottom;
    const clickedButton = e.target.closest(".prompanion-enhance-tooltip__action");
    const clickedTooltip = e.target.closest(".prompanion-enhance-tooltip");
    
    console.log("[Prompanion] Target:", e.target);
    console.log("[Prompanion] Click coordinates:", clickX, clickY);
    console.log("[Prompanion] Button bounds:", buttonRect);
    console.log("[Prompanion] Click in button bounds:", inButtonBounds);
    console.log("[Prompanion] clickedButton (closest):", clickedButton);
    console.log("[Prompanion] clickedTooltip (closest):", clickedTooltip);
    
    if (clickedButton || inButtonBounds) {
      console.log("[Prompanion] ========== CLICK ON TOOLTIP/BUTTON CONFIRMED ==========");
      if (typeof handleRefineButtonClick === "function") {
        console.log("[Prompanion] Calling handleRefineButtonClick from global listener");
        handleRefineButtonClick(e);
      } else {
        console.error("[Prompanion] handleRefineButtonClick is not a function!");
      }
    }
  }
}, true);

window.addEventListener("click", (e) => {
  if (enhanceTooltipElement?.classList.contains("is-visible")) {
    console.log("[Prompanion] ========== WINDOW CLICK DETECTED (tooltip visible) ==========");
    console.log("[Prompanion] Target:", e.target);
    const button = enhanceTooltipElement.querySelector(".prompanion-enhance-tooltip__action");
    const clickedButton = e.target.closest(".prompanion-enhance-tooltip__action");
    if (clickedButton || button === e.target) {
      console.log("[Prompanion] ========== WINDOW CLICK ON BUTTON ==========");
      if (typeof handleRefineButtonClick === "function") {
        handleRefineButtonClick(e);
      }
    }
  }
}, true);

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
        if (buttonRef && !buttonRef.isConnected) {
          console.error("[Prompanion] BUTTON WAS REMOVED FROM DOM!");
        }
      }, 300);
    }
  }
}, true);

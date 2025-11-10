const BUTTON_ID = "prompanion-chatgpt-trigger";
const BUTTON_CLASS = "prompanion-chatgpt-trigger";
let domObserverStarted = false;
let buttonInitialized = false;
const tooltipRegistry = new WeakMap();
const debug = (...args) => console.log("[Prompanion][ChatGPT]", ...args);

debug("Adapter loaded", {
  location: window.location.href,
  documentReadyState: document.readyState
});

let enhanceTooltipElement = null;
let enhanceTooltipTimer = null;
let enhanceTooltipDismissed = false;
let enhanceTooltipActiveTextarea = null;
let enhanceTooltipContainer = null;
let lastEnhanceTextSnapshot = "";
let enhanceTooltipResizeHandler = null;
let floatingButtonElement = null;
let floatingButtonWrapper = null;
let floatingButtonPositionHandler = null;
let floatingButtonTargetContainer = null;

const styles = `
  .${BUTTON_CLASS} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
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
    width: 40px;
    height: 40px;
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
    background: rgba(10, 14, 26, 0.94);
    color: #ffffff;
    box-shadow: 0 12px 28px rgba(10, 14, 26, 0.32);
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
    color: rgba(255, 255, 255, 0.7);
    display: grid;
    place-items: center;
    font-size: 14px;
    line-height: 1;
  }

  .prompanion-enhance-tooltip__dismiss:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .prompanion-enhance-tooltip__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 12px;
    border-radius: 9999px;
    background: #246bff;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    box-shadow: 0 6px 16px rgba(36, 107, 255, 0.35);
  }

  .prompanion-enhance-tooltip__action:hover {
    background: #1e58d0;
  }
`;

function ensureStyle() {
  if (document.getElementById(`${BUTTON_ID}-style`)) {
    return;
  }
  const style = document.createElement("style");
  style.id = `${BUTTON_ID}-style`;
  style.textContent = styles;
  document.head.append(style);
}

function createIcon() {
  const icon = document.createElement("span");
  icon.className = `${BUTTON_CLASS}__icon`;
  icon.setAttribute("aria-hidden", "true");
  const assetUrl = chrome.runtime.getURL("/icons/icon48.png");
  icon.style.backgroundImage = `url('${assetUrl}')`;
  icon.dataset.iconUrl = assetUrl;
  return icon;
}

function buildButton() {
  ensureStyle();

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.append(createIcon());
  attachTooltip(button);

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "PROMPANION_TOGGLE_PANEL" }).catch((error) => {
      console.error("Prompanion: failed to open sidebar from ChatGPT adapter", error);
    });
  });

  button.addEventListener("mouseenter", () => showTooltip(button));
  button.addEventListener("focus", () => showTooltip(button));
  button.addEventListener("mouseleave", () => hideTooltip(button));
  button.addEventListener("blur", () => hideTooltip(button));

  buttonInitialized = true;
  return button;
}

function ensureFloatingButton() {
  if (floatingButtonWrapper && floatingButtonElement) {
    return;
  }

  floatingButtonWrapper = document.getElementById(`${BUTTON_ID}-wrapper`);

  if (!floatingButtonWrapper) {
    floatingButtonWrapper = document.createElement("div");
    floatingButtonWrapper.id = `${BUTTON_ID}-wrapper`;
    floatingButtonWrapper.style.position = "fixed";
    floatingButtonWrapper.style.zIndex = "2147483000";
    floatingButtonWrapper.style.pointerEvents = "auto";
    floatingButtonWrapper.style.display = "flex";
    floatingButtonWrapper.style.alignItems = "center";
    floatingButtonWrapper.style.justifyContent = "center";
    floatingButtonWrapper.style.width = "48px";
    floatingButtonWrapper.style.height = "48px";
    document.body.append(floatingButtonWrapper);
  }

  floatingButtonElement = document.getElementById(BUTTON_ID) ?? buildButton();

  if (!floatingButtonElement.isConnected) {
    floatingButtonWrapper.append(floatingButtonElement);
  }
}

function placeButton(targetContainer, inputNode) {
  if (!inputNode) {
    return;
  }

  ensureFloatingButton();
  floatingButtonTargetContainer = targetContainer ?? inputNode;
  positionFloatingButton(inputNode, floatingButtonTargetContainer);
  attachButtonPositionHandler(inputNode);
}

function positionFloatingButton(inputNode, containerNode = floatingButtonTargetContainer) {
  if (!floatingButtonWrapper) {
    return;
  }

  const attachmentButton =
    document.querySelector("#composer-plus-btn") ??
    document.querySelector("[data-testid='composer-plus-btn']") ??
    containerNode?.querySelector("[data-testid='composer-plus-btn']");

  const target = attachmentButton ?? containerNode ?? inputNode;
  const rect = target.getBoundingClientRect();
  const verticalOffset = 15;

  const left = rect.left;
  const top = rect.bottom + verticalOffset;

  floatingButtonWrapper.style.left = `${left}px`;
  floatingButtonWrapper.style.top = `${top}px`;
  floatingButtonWrapper.style.transform = "translate(0, 0)";
}

function attachButtonPositionHandler(inputNode) {
  if (floatingButtonPositionHandler) {
    return;
  }

  floatingButtonPositionHandler = () =>
    positionFloatingButton(inputNode, floatingButtonTargetContainer);
  window.addEventListener("resize", floatingButtonPositionHandler);
  window.addEventListener("scroll", floatingButtonPositionHandler, true);
}

function detachButtonPositionHandler() {
  if (!floatingButtonPositionHandler) {
    return;
  }
  window.removeEventListener("resize", floatingButtonPositionHandler);
  window.removeEventListener("scroll", floatingButtonPositionHandler, true);
  floatingButtonPositionHandler = null;
  floatingButtonTargetContainer = null;
}

function ensureDomObserver() {
  if (domObserverStarted) {
    return;
  }

  const observer = new MutationObserver(() => {
    const composer = locateComposer();
    debug("Mutation observed", {
      hasComposer: Boolean(composer),
      hasButton: Boolean(document.getElementById(BUTTON_ID))
    });

    if (!composer) {
      detachButtonPositionHandler();
      return;
    }

    placeButton(composer.container, composer.input);
    setupEnhanceTooltip(composer.input, composer.container);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  domObserverStarted = true;
}

function locateComposer() {
  const wrappers = [
    document.querySelector("[data-testid='conversation-turn-textbox']"),
    document.querySelector("[data-testid='composer-container']"),
    document.querySelector("main form")
  ].filter(Boolean);

  let input = null;

  for (const wrapper of wrappers) {
    const editable =
      wrapper.querySelector("[data-testid='textbox'][contenteditable='true']") ??
      wrapper.querySelector("div[contenteditable='true']");
    if (editable instanceof HTMLElement) {
      input = editable;
      break;
    }
  }

  if (!input) {
    const textarea = document.querySelector(
      "[data-testid='conversation-turn-textbox'] textarea:not([readonly])"
    );
    if (
      textarea instanceof HTMLTextAreaElement &&
      !textarea.className.includes("_fallbackTextarea")
    ) {
      input = textarea;
    }
  }

  if (!input) {
    return null;
  }

  const container =
    input.closest("[data-testid='composer-footer']") ??
    input.closest("[data-testid='composer-container']") ??
    input.parentElement ??
    document.body;

  debug("Composer located", {
    inputTag: input.tagName,
    inputClass: input.className,
    containerTag: container?.tagName ?? "UNKNOWN"
  });

  return { input, container };
}

function init() {
  const composer = locateComposer();
  debug("Init called", { hasComposer: Boolean(composer) });
  if (composer) {
    placeButton(composer.container, composer.input);
    setupEnhanceTooltip(composer.input, composer.container);
    ensureDomObserver();
    debug("Init successful");
    return true;
  }
  ensureDomObserver();
  return false;
}

function bootstrap() {
  debug("Bootstrap invoked", { readyState: document.readyState });
  if (!init()) {
    const observer = new MutationObserver(() => {
      debug("Bootstrap observer mutation triggered");
      if (init()) {
        debug("Deferred init succeeded via bootstrap observer");
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function attachTooltip(button) {
  ensureTooltipResources();

  tooltipRegistry.set(button, {
    text: "Open Prompanion to enhance your prompts for the best response."
  });
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
        background: rgba(10, 14, 26, 0.92);
        color: #ffffff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.35;
        box-shadow: 0 10px 24px rgba(10, 14, 26, 0.28);
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
        border-color: transparent transparent rgba(10, 14, 26, 0.92) transparent;
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
  if (!data) {
    return;
  }

  const container = document.getElementById(`${BUTTON_ID}-tooltip-layer`);
  if (!container) {
    return;
  }

  let tooltip = button._prompanionTooltip;
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "prompanion-tooltip";
    tooltip.setAttribute("role", "tooltip");

    const text = document.createElement("span");
    text.textContent = data.text;
    tooltip.append(text);

    const hidden = document.createElement("span");
    hidden.className = "prompanion-visually-hidden";
    hidden.textContent = data.text;
    tooltip.append(hidden);

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
  const top = rect.bottom + window.scrollY + 5;
  const left = rect.left + rect.width / 2 + window.scrollX;

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}

function setupEnhanceTooltip(input, container) {
  debug("Compose container detected", { hasInput: Boolean(input) });
  if (!input) {
    return;
  }

  if (enhanceTooltipActiveTextarea === input) {
    debug("Skipping tooltip setup; input already bound");
    return;
  }

  teardownEnhanceTooltip();
  enhanceTooltipActiveTextarea = input;
  enhanceTooltipContainer = input.parentElement || container;
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
    enhanceTooltipElement = document.createElement("div");
    enhanceTooltipElement.className = "prompanion-enhance-tooltip";

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "prompanion-enhance-tooltip__dismiss";
    dismiss.setAttribute("aria-label", "Dismiss prompt enhancement suggestion");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => {
      enhanceTooltipDismissed = true;
      hideEnhanceTooltip();
    });

    const action = document.createElement("button");
    action.type = "button";
    action.className = "prompanion-enhance-tooltip__action";
    action.textContent = "Enhance?";
    action.addEventListener("click", () => {
      const promptText = extractInputText();
      enhanceTooltipDismissed = true;
      hideEnhanceTooltip();
      chrome.runtime.sendMessage(
        {
          type: "PROMPANION_PREPARE_ENHANCEMENT",
          prompt: promptText
        },
        () => {
          if (chrome.runtime.lastError) {
            console.warn("Prompanion: failed to queue enhancement", chrome.runtime.lastError);
          }
          chrome.runtime
            .sendMessage({ type: "PROMPANION_TOGGLE_PANEL" })
            .catch((error) =>
              console.error("Prompanion: failed to open sidebar from enhance tooltip", error)
            );
        }
      );
    });

    enhanceTooltipElement.append(dismiss, action);
  }

  if (!enhanceTooltipElement.isConnected) {
    document.body.append(enhanceTooltipElement);
  }

  hideEnhanceTooltip();
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

  debug("Input listeners attached", { node: input });
  handleInputChange();
}

function extractInputText() {
  if (!enhanceTooltipActiveTextarea) {
    return "";
  }

  if ("value" in enhanceTooltipActiveTextarea) {
    return enhanceTooltipActiveTextarea.value;
  }

  return enhanceTooltipActiveTextarea.textContent ?? "";
}

function handleInputChange() {
  if (!enhanceTooltipActiveTextarea) {
    return;
  }

  const rawText = extractInputText();
  const sanitized =
    rawText.startsWith("window.__oai") || rawText.includes("__oai_logHTML")
      ? ""
      : rawText;
  const text = sanitized.trim();
  const words = text.split(/\s+/).filter(Boolean);

  debug("Input change detected", {
    rawText,
    wordCount: words.length,
    dismissed: enhanceTooltipDismissed
  });

  if (words.length < 3) {
    hideEnhanceTooltip();
    enhanceTooltipDismissed = false;
    clearTimeout(enhanceTooltipTimer);
    enhanceTooltipTimer = null;
    lastEnhanceTextSnapshot = "";
    return;
  }

  if (enhanceTooltipDismissed && text === lastEnhanceTextSnapshot) {
    return;
  }

  lastEnhanceTextSnapshot = text;
  enhanceTooltipDismissed = false;
  scheduleEnhanceTooltip();

  if (enhanceTooltipElement?.classList.contains("is-visible")) {
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
    if (!enhanceTooltipActiveTextarea) {
      return;
    }
    const text = extractInputText().trim();
    const words = text.split(/\s+/).filter(Boolean);

    if (words.length >= 3 && !enhanceTooltipDismissed) {
      debug("Showing enhance tooltip", { wordCount: words.length, text });
      showEnhanceTooltip();
    }
  }, 1000);
}

function showEnhanceTooltip() {
  if (!enhanceTooltipElement) {
    return;
  }
  positionEnhanceTooltip();
  debug("Enhance tooltip visible");
  enhanceTooltipElement.classList.add("is-visible");
  attachTooltipResizeHandler();
}

function hideEnhanceTooltip() {
  if (!enhanceTooltipElement) {
    return;
  }
  if (enhanceTooltipElement.classList.contains("is-visible")) {
    debug("Enhance tooltip hidden");
  }
  enhanceTooltipElement.classList.remove("is-visible");
  detachTooltipResizeHandler();
}

function positionEnhanceTooltip() {
  if (!enhanceTooltipElement || !enhanceTooltipActiveTextarea) {
    return;
  }

  const rect = enhanceTooltipActiveTextarea.getBoundingClientRect();
  const top = rect.top - 8;
  const left = rect.left + rect.width * 0.5;

  enhanceTooltipElement.style.top = `${top}px`;
  enhanceTooltipElement.style.left = `${left}px`;
  enhanceTooltipElement.style.transform = "translate(-50%, -100%)";
}

function attachTooltipResizeHandler() {
  if (enhanceTooltipResizeHandler) {
    return;
  }

  enhanceTooltipResizeHandler = () => positionEnhanceTooltip();
  window.addEventListener("resize", enhanceTooltipResizeHandler);
  window.addEventListener("scroll", enhanceTooltipResizeHandler, true);
}

function detachTooltipResizeHandler() {
  if (!enhanceTooltipResizeHandler) {
    return;
  }

  window.removeEventListener("resize", enhanceTooltipResizeHandler);
  window.removeEventListener("scroll", enhanceTooltipResizeHandler, true);
  enhanceTooltipResizeHandler = null;
}

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  debug("Waiting for DOMContentLoaded to bootstrap", { readyState });
  document.addEventListener("DOMContentLoaded", bootstrap);
}


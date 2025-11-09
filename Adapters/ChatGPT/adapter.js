const BUTTON_ID = "prompanion-chatgpt-trigger";
const BUTTON_CLASS = "prompanion-chatgpt-trigger";
let domObserverStarted = false;
const tooltipRegistry = new WeakMap();

const styles = `
  .${BUTTON_CLASS} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 9999px;
    width: 52px;
    height: 52px;
    background: linear-gradient(135deg, #10152b, #1f2a44);
    color: #ffffff;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    gap: 8px;
    box-shadow: 0 6px 16px rgba(31, 42, 68, 0.25);
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

  .${BUTTON_CLASS} svg {
    width: 18px;
    height: 18px;
    display: block;
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
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 32 32");

  const circle = document.createElementNS(svgNS, "rect");
  circle.setAttribute("x", "0");
  circle.setAttribute("y", "0");
  circle.setAttribute("width", "32");
  circle.setAttribute("height", "32");
  circle.setAttribute("rx", "12");
  circle.setAttribute("fill", "#246bff");

  const text = document.createElementNS(svgNS, "text");
  text.setAttribute("x", "16");
  text.setAttribute("y", "21");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "16");
  text.setAttribute("font-family", "Inter, system-ui, sans-serif");
  text.setAttribute("font-weight", "600");
  text.setAttribute("fill", "#ffffff");
  text.textContent = "P";

  svg.append(circle, text);
  return svg;
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

  return button;
}

function placeButton(targetContainer) {
  if (!targetContainer || document.getElementById(BUTTON_ID)) {
    return;
  }
  const button = buildButton();
  targetContainer.append(button);

  button.addEventListener("mouseenter", () => showTooltip(button));
  button.addEventListener("focus", () => showTooltip(button));
  button.addEventListener("mouseleave", () => hideTooltip(button));
  button.addEventListener("blur", () => hideTooltip(button));
}

function ensureDomObserver() {
  if (domObserverStarted) {
    return;
  }

  const observer = new MutationObserver(() => {
    const container = findComposeContainer();
    if (container && !document.getElementById(BUTTON_ID)) {
      placeButton(container);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  domObserverStarted = true;
}

function findComposeContainer() {
  const selectors = [
    "[data-testid='composer-container']",
    "[data-testid='conversation-compose-box']",
    "form[data-testid='conversation-turn']"
  ];

  for (const selector of selectors) {
    const match = document.querySelector(selector);
    if (match) {
      return match.parentElement ?? match;
    }
  }

  const textarea = document.querySelector("textarea:not([readonly])");
  if (!textarea) {
    return null;
  }

  let current = textarea.parentElement;
  while (current && current !== document.body) {
    const forms = current.querySelectorAll("form");
    if (forms.length) {
      return current;
    }
    current = current.parentElement;
  }
  return textarea.parentElement;
}

function init() {
  const container = findComposeContainer();
  if (container) {
    placeButton(container);
    ensureDomObserver();
    return true;
  }
  ensureDomObserver();
  return false;
}

function bootstrap() {
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

const readyState = document.readyState;
if (readyState === "complete" || readyState === "interactive") {
  bootstrap();
} else {
  document.addEventListener("DOMContentLoaded", bootstrap);
}


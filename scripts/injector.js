const PANEL_CONTAINER_ID = "prompanion-sidepanel-container";
const PANEL_VISIBLE_CLASS = "prompanion-sidepanel-visible";

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
    }

    #${PANEL_CONTAINER_ID} .prompanion-close:hover {
      background: #162036;
    }
  `;

  document.head.append(style);
}

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
    container.classList.remove(PANEL_VISIBLE_CLASS);
  });

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sidepanel.html");
  iframe.setAttribute("allow", "clipboard-write");

  container.append(closeButton, iframe);
  document.documentElement.append(container);
  return container;
}

function togglePanel() {
  const container = createPanel();
  container.classList.toggle(PANEL_VISIBLE_CLASS);
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "PROMPANION_TOGGLE_PANEL") {
    togglePanel();
  }
});


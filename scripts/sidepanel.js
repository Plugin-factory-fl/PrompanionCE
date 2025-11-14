/**
 * Side Panel Main Script
 * Initializes and coordinates all side panel functionality
 */

import {
  renderPrompts,
  handleEnhance,
  registerCopyHandlers,
  initTabs,
  registerEnhanceButton
} from "../Source/promptEnhancer.js";
import {
  renderChat,
  renderChatTabs,
  getActiveConversation,
  setActiveConversation,
  sendSideChatMessage,
  triggerAutoSideChat,
  processPendingSideChat,
  registerChatHandlers
} from "../Source/sideChat.js";
import {
  LIBRARY_SCHEMA_VERSION,
  createDefaultLibrary,
  normalizeLibrary,
  renderLibrary,
  registerLibraryHandlers
} from "../Source/promptLibrary.js";
import { registerAccountHandlers } from "../Source/LoginMenu.js";
import {
  detailLevelLabels,
  renderSettings,
  registerSettingsHandlers
} from "../Source/settingsPanel.js";

/**
 * Default application state structure
 */
const defaultState = {
  plan: "Freemium",
  enhancementsUsed: 3,
  enhancementsLimit: 10,
  activePlatform: "ChatGPT",
  originalPrompt:
    "Draft a customer support response thanking them for their feedback and promising a follow-up within 24 hours.",
  optionA: "",
  optionB: "",
  library: createDefaultLibrary(),
  settings: {
    tone: "neutral",
    style: "concise",
    complexity: 3,
    apiKey: "",
    model: "chatgpt",
    output: "text",
    contentType: "research"
  },
  conversations: [
    {
      id: `conv-${Date.now()}`,
      title: "Welcome",
      history: [
        {
          role: "agent",
          content:
            "Welcome back! Drop any snippet you'd like me to elaborate or clarify, and I'll help expand it on the spot.",
          timestamp: Date.now()
        }
      ]
    }
  ],
  activeConversationId: null,
  pendingSideChat: null
};

/**
 * Storage abstraction layer - uses Chrome sync storage if available, falls back to localStorage
 */
const storage = (() => {
  const hasChromeSync = Boolean(globalThis.chrome?.storage?.sync);

  return {
    async get(key) {
      if (hasChromeSync) {
        const result = await chrome.storage.sync.get(key);
        return result[key];
      }
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    },
    async set(key, value) {
      if (hasChromeSync) {
        await chrome.storage.sync.set({ [key]: value });
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    }
  };
})();

const STATE_KEY = "prompanion-sidepanel-state";
let currentState = null;

/**
 * Loads application state from storage, merging with defaults
 * @returns {Promise<Object>} Merged application state
 */
async function loadState() {
  const stored = await storage.get(STATE_KEY);
  if (!stored) {
    const initialState = structuredClone(defaultState);
    await storage.set(STATE_KEY, initialState);
    return initialState;
  }
  const storedLibraryVersion = Number.isFinite(stored.libraryVersion)
    ? stored.libraryVersion
    : 0;
  const normalizedLibrary = normalizeLibrary(stored.library ?? []);
  const mergedState = {
    ...structuredClone(defaultState),
    ...stored,
    settings: { ...defaultState.settings, ...stored.settings },
    conversations: stored.conversations ?? structuredClone(defaultState.conversations),
    activeConversationId: stored.activeConversationId ?? defaultState.conversations[0].id
  };

  if (storedLibraryVersion !== LIBRARY_SCHEMA_VERSION) {
    mergedState.library = createDefaultLibrary();
    mergedState.libraryVersion = LIBRARY_SCHEMA_VERSION;
  } else {
    mergedState.library = normalizedLibrary;
  }
  storage.set(STATE_KEY, mergedState).catch((error) => {
    console.warn("Prompanion: failed to persist normalized library", error);
  });
  return mergedState;
}

/**
 * Saves application state to storage
 * @param {Object} nextState - State object to save
 */
async function saveState(nextState) {
  await storage.set(STATE_KEY, nextState);
}

/**
 * Renders status information in the UI
 * @param {Object} status - Status object with plan, enhancementsUsed, enhancementsLimit, activePlatform
 */
function renderStatus({ plan, enhancementsUsed, enhancementsLimit, activePlatform }) {
  document.getElementById("user-plan").textContent = plan;
  document.getElementById("enhancements-count").textContent = enhancementsUsed;
  document.getElementById("enhancements-limit").textContent = enhancementsLimit;
  document.getElementById("active-platform").textContent = activePlatform;
}

/**
 * Registers event handlers to prevent section heading actions from triggering section collapse
 */
function registerSectionActionGuards() {
  document.querySelectorAll(".section-heading__actions").forEach((actions) => {
    ["pointerdown", "mousedown", "click", "touchstart", "keydown"].forEach((type) => {
      actions.addEventListener(
        type,
        (event) => {
          event.stopPropagation();
        },
        { passive: false }
      );
    });
  });
}

/**
 * Initializes the side panel application
 */
async function init() {
  currentState = await loadState();

  if (!currentState.activeConversationId) {
    currentState.activeConversationId = currentState.conversations[0]?.id;
  }

  const activeConversation = getActiveConversation(currentState);

  renderStatus(currentState);
  renderPrompts(currentState);
  renderSettings(currentState.settings);
  renderLibrary(currentState.library);
  renderChat(activeConversation?.history ?? []);
  renderChatTabs(currentState.conversations, currentState.activeConversationId);

  registerCopyHandlers();
  registerLibraryHandlers(currentState, {
    saveState,
    LIBRARY_SCHEMA_VERSION
  });
  registerSettingsHandlers(currentState, { saveState });
  registerAccountHandlers();
  registerChatHandlers(currentState, {
    renderStatus,
    saveState
  });
  initTabs();
  registerSectionActionGuards();
  processPendingSideChat(currentState, { saveState });

  registerEnhanceButton(currentState, {
    renderStatus,
    saveState,
    detailLevelLabels,
    defaultState
  });

  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "PROMPANION_REQUEST_STATE" }, (response) => {
      if (response?.ok && response.state) {
        Object.assign(currentState, response.state);
        renderPrompts(currentState);
        renderStatus(currentState);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "PROMPANION_STATE_PUSH") {
      if (!currentState) {
        return;
      }
      if (message.state && typeof message.state === "object") {
        Object.assign(currentState, message.state);
        renderPrompts(currentState);
        renderStatus(currentState);
        processPendingSideChat(currentState, { saveState });
      }
    }
    if (message.type === "PROMPANION_SIDECHAT_DELIVER") {
      if (!currentState) {
        return;
      }
      triggerAutoSideChat(currentState, message.text, {
        fromPending: Boolean(message.clearPending)
      }, { saveState });
    }
  });
}


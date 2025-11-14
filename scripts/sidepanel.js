/**
 * Side Panel Main Script
 * Initializes and coordinates all side panel functionality
 */

import {
  initPromptEnhancer,
  renderPrompts,
  handleEnhance,
  registerCopyHandlers,
  initTabs,
  registerEnhanceButton,
  handleStateRestore,
  handleStatePush
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
  originalPrompt: "",
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
  conversations: [],
  activeConversationId: null,
  pendingSideChat: null
};

/**
 * Storage abstraction layer - uses Chrome sync storage if available, falls back to localStorage
 */
const storage = {
  async get(key) {
    const result = await chrome.storage.sync.get(key);
    return result[key];
  },
  async set(key, value) {
    await chrome.storage.sync.set({ [key]: value });
  }
};

const STATE_KEY = "prompanion-sidepanel-state";
let currentState = null;
const pendingMessages = [];
const pendingStorageChanges = [];

/**
 * Conversation expiration time: 48 hours in milliseconds
 */
const CONVERSATION_EXPIRATION_MS = 48 * 60 * 60 * 1000;

/**
 * Filters out conversations that are older than 48 hours
 * @param {Array} conversations - Array of conversation objects
 * @returns {Array} Filtered array with only non-expired conversations
 */
function filterExpiredConversations(conversations) {
  if (!Array.isArray(conversations)) {
    return [];
  }
  const now = Date.now();
  return conversations.filter((conv) => {
    if (!conv || !conv.id) {
      return false;
    }
    // Extract timestamp from conversation ID (format: "conv-{timestamp}")
    const timestampMatch = conv.id.match(/^conv-(\d+)$/);
    if (!timestampMatch) {
      return false;
    }
    const conversationTimestamp = Number.parseInt(timestampMatch[1], 10);
    if (!Number.isFinite(conversationTimestamp)) {
      return false;
    }
    // Keep conversation if it's less than 48 hours old
    return (now - conversationTimestamp) < CONVERSATION_EXPIRATION_MS;
  });
}

/**
 * Creates a new conversation with the welcome message
 * @returns {Object} New conversation object
 */
function createNewConversation() {
  return {
    id: `conv-${Date.now()}`,
    title: "New chat",
    history: [
      {
        role: "agent",
        content:
          "Welcome to the Side Chat! This is where you can ask me questions to elaborate on ideas you aren't clear on. I open up automatically when you highlight any text response from your LLM in the browser and click the \"Elaborate\" button. I'm here to help!",
        timestamp: Date.now()
      }
    ]
  };
}

/**
 * Loads application state from storage, merging with defaults
 * @returns {Promise<Object>} Merged application state
 */
async function loadState() {
  const stored = await storage.get(STATE_KEY);
  if (!stored) {
    const initialState = structuredClone(defaultState);
    const newConversation = createNewConversation();
    initialState.conversations = [newConversation];
    initialState.activeConversationId = newConversation.id;
    await storage.set(STATE_KEY, initialState);
    return initialState;
  }
  const storedLibraryVersion = Number.isFinite(stored.libraryVersion)
    ? stored.libraryVersion
    : 0;
  const normalizedLibrary = normalizeLibrary(stored.library ?? []);
  
  // Filter out expired conversations (older than 48 hours)
  const validConversations = filterExpiredConversations(stored.conversations ?? []);
  
  const mergedState = {
    ...structuredClone(defaultState),
    ...stored,
    settings: { ...defaultState.settings, ...stored.settings },
    conversations: validConversations,
    activeConversationId: null // Will be set to new conversation in init()
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

  // Prevent info buttons from triggering section collapse
  document.querySelectorAll(".library-info-btn").forEach((button) => {
    ["pointerdown", "mousedown", "click", "touchstart", "keydown"].forEach((type) => {
      button.addEventListener(
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

  const hasSavedPrompts = currentState && (currentState.originalPrompt || currentState.optionA || currentState.optionB);
  if (hasSavedPrompts) {
    renderPrompts(currentState);
  } else {
    initPromptEnhancer(currentState);
  }

  // Always create a new conversation on load
  const newConversation = createNewConversation();
  currentState.conversations.push(newConversation);
  currentState.activeConversationId = newConversation.id;
  await saveState(currentState);

  const activeConversation = getActiveConversation(currentState);

  renderStatus(currentState);
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
    saveState
  });

  // Process any pending messages that arrived before initialization
  if (pendingMessages.length > 0) {
    pendingMessages.forEach((message) => {
      if (message.type === "PROMPANION_STATE_PUSH" && message.state) {
        const otherState = handleStatePush(currentState, message.state);
        Object.assign(currentState, otherState);
        renderStatus(currentState);
        processPendingSideChat(currentState, { saveState });
      }
    });
    pendingMessages.length = 0;
  }

  // Process any storage changes that happened before init completed
  if (pendingStorageChanges.length > 0) {
    pendingStorageChanges.forEach((newState) => {
      if (newState.originalPrompt || newState.optionA || newState.optionB) {
        const otherState = handleStatePush(currentState, newState);
        Object.assign(currentState, otherState);
        renderStatus(currentState);
        processPendingSideChat(currentState, { saveState });
      }
    });
    pendingStorageChanges.length = 0;
  }

  // Final check: re-read storage to catch any updates that happened during init
  const finalState = await loadState();
  if (finalState && (finalState.originalPrompt || finalState.optionA || finalState.optionB)) {
    const needsUpdate = 
      currentState.originalPrompt !== finalState.originalPrompt ||
      currentState.optionA !== finalState.optionA ||
      currentState.optionB !== finalState.optionB;
    if (needsUpdate) {
      const otherState = handleStatePush(currentState, finalState);
      Object.assign(currentState, otherState);
      renderStatus(currentState);
    }
  }

  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "PROMPANION_REQUEST_STATE" }, (response) => {
      if (response?.ok && response.state) {
        const hasRecentPrompts = response.state.originalPrompt && 
                                (response.state.optionA || response.state.optionB);
        if (hasRecentPrompts) {
          const otherState = handleStatePush(currentState, response.state);
          Object.assign(currentState, otherState);
        } else {
          handleStateRestore(currentState, response.state);
        }
        renderStatus(currentState);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

// Set up storage listener BEFORE init() to catch all changes
if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes[STATE_KEY]?.newValue) {
      const newState = changes[STATE_KEY].newValue;
      if (newState.originalPrompt || newState.optionA || newState.optionB) {
        if (currentState) {
          // Process immediately if currentState is ready
          const otherState = handleStatePush(currentState, newState);
          Object.assign(currentState, otherState);
          renderStatus(currentState);
          processPendingSideChat(currentState, { saveState });
        } else {
          // Queue for processing after init() completes
          pendingStorageChanges.push(newState);
        }
      }
    }
  });
}

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "PROMPANION_STATE_PUSH") {
      if (!currentState) {
        pendingMessages.push(message);
        return;
      }
      if (message.state && typeof message.state === "object") {
        const otherState = handleStatePush(currentState, message.state);
        Object.assign(currentState, otherState);
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


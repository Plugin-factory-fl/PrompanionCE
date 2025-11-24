/**
 * Side Panel Main Script
 * Initializes and coordinates all side panel functionality
 */

console.log("[Prompanion Sidepanel] ========== SIDEPANEL.JS LOADING ==========");
console.log("[Prompanion Sidepanel] Timestamp:", new Date().toISOString());
console.log("[Prompanion Sidepanel] Document ready state:", document.readyState);

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

// Make renderPrompts available globally for storage listener
window.renderPrompts = renderPrompts;

// Import sideChat dynamically to handle errors gracefully
// This prevents the entire side panel from failing if sideChat.js has issues
let sideChatModule = null;
let renderChat = () => {};
let renderChatTabs = () => {};
let getActiveConversation = (state) => state?.conversations?.[0] || null;
let setActiveConversation = () => {};
let sendSideChatMessage = async () => {};
let triggerAutoSideChat = async () => {};
let processPendingSideChat = () => {};
let registerChatHandlers = () => {};
let isFreshConversation = () => false;
let openSideChatSection = () => {};

// Load sideChat module asynchronously and initialize side chat when ready
// Use relative path since we're already in a module context
const sideChatLoadPromise = import("../Source/sideChat.js")
  .then((module) => {
    sideChatModule = module;
    renderChat = module.renderChat || renderChat;
    renderChatTabs = module.renderChatTabs || renderChatTabs;
    getActiveConversation = module.getActiveConversation || getActiveConversation;
    setActiveConversation = module.setActiveConversation || setActiveConversation;
    sendSideChatMessage = module.sendSideChatMessage || sendSideChatMessage;
    triggerAutoSideChat = module.triggerAutoSideChat || triggerAutoSideChat;
    processPendingSideChat = module.processPendingSideChat || processPendingSideChat;
    registerChatHandlers = module.registerChatHandlers || registerChatHandlers;
    isFreshConversation = module.isFreshConversation || isFreshConversation;
    openSideChatSection = module.openSideChatSection || openSideChatSection;
    console.log("[Prompanion Sidepanel] sideChat.js loaded successfully");
    
    // Initialize side chat after module loads
    if (typeof window.initSideChat === 'function') {
      window.initSideChat();
    }
    
    return module;
  })
  .catch((error) => {
    console.error("[Prompanion Sidepanel] Failed to load sideChat.js:", error);
    console.error("[Prompanion Sidepanel] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.log("[Prompanion Sidepanel] Continuing with stub functions - prompts should still work");
    return null;
  });
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
    complexity: 2,
    apiKey: "",
    model: "chatgpt",
    output: "text"
  },
  conversations: [],
  activeConversationId: null,
  pendingSideChat: null
};

/**
 * Checks if the extension context is still valid
 * @returns {boolean} True if context is valid, false otherwise
 */
function isExtensionContextValid() {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime) {
      return false;
    }
    // Try to access runtime.id - this will throw if context is invalidated
    const id = chrome.runtime.id;
    return typeof id === "string" && id.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Shows a user-friendly notification when extension context is invalidated
 */
function showContextInvalidatedNotification() {
  // Check if notification already exists
  if (document.getElementById("prompanion-context-invalidated-notification")) {
    return;
  }

  const notification = document.createElement("div");
  notification.id = "prompanion-context-invalidated-notification";
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff4444;
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    max-width: 400px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  `;
  
  notification.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px;">Prompanion Extension Reloaded</div>
    <div style="opacity: 0.95;">Please reload this page to continue using Prompanion features.</div>
    <button id="prompanion-reload-page" style="
      margin-top: 12px;
      padding: 8px 16px;
      background: white;
      color: #ff4444;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
    ">Reload Page</button>
  `;
  
  document.body.appendChild(notification);
  
  // Add click handler for reload button
  const reloadButton = notification.querySelector("#prompanion-reload-page");
  if (reloadButton) {
    reloadButton.addEventListener("click", () => {
      window.location.reload();
    });
  }
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.opacity = "0";
      notification.style.transition = "opacity 0.3s ease";
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 300);
    }
  }, 10000);
}

/**
 * Storage abstraction layer - uses Chrome sync storage if available, falls back to localStorage
 */
const storage = {
  async get(key) {
    try {
      if (!isExtensionContextValid()) {
        console.error("[Prompanion Sidepanel] Extension context invalidated - cannot access storage");
        showContextInvalidatedNotification();
        return undefined; // Return undefined to allow fallback to defaults
      }
      const result = await chrome.storage.sync.get(key);
      return result[key];
    } catch (error) {
      // Handle extension context invalidated errors gracefully
      if (error?.message?.includes("Extension context invalidated") || 
          error?.message?.includes("message port closed") ||
          !isExtensionContextValid()) {
        console.error("[Prompanion Sidepanel] Extension context invalidated during storage.get:", error);
        showContextInvalidatedNotification();
        return undefined; // Return undefined to allow fallback to defaults
      }
      // Re-throw other errors
      throw error;
    }
  },
  async set(key, value) {
    try {
      if (!isExtensionContextValid()) {
        console.error("[Prompanion Sidepanel] Extension context invalidated - cannot save to storage");
        showContextInvalidatedNotification();
        return; // Silently fail - can't save if context is invalidated
      }
      await chrome.storage.sync.set({ [key]: value });
    } catch (error) {
      // Handle extension context invalidated errors gracefully
      if (error?.message?.includes("Extension context invalidated") || 
          error?.message?.includes("message port closed") ||
          !isExtensionContextValid()) {
        console.error("[Prompanion Sidepanel] Extension context invalidated during storage.set:", error);
        showContextInvalidatedNotification();
        return; // Silently fail - can't save if context is invalidated
      }
      // Re-throw other errors
      throw error;
    }
  }
};

const STATE_KEY = "prompanion-sidepanel-state";
let currentState = null;
const pendingMessages = [];
const pendingStorageChanges = [];

/**
 * Checks if a state object has prompts
 * @param {Object} state - State object to check
 * @returns {boolean} True if state has any prompts
 */
function hasPrompts(state) {
  return !!(state?.originalPrompt || state?.optionA || state?.optionB);
}

/**
 * Checks if prompts need to be updated by comparing current and latest state
 * @param {Object} currentState - Current state object
 * @param {Object} latestState - Latest state object
 * @returns {boolean} True if prompts need updating
 */
function promptsNeedUpdate(currentState, latestState) {
  return (
    !currentState.originalPrompt || 
    !currentState.optionA || 
    !currentState.optionB ||
    currentState.originalPrompt !== latestState.originalPrompt ||
    currentState.optionA !== latestState.optionA ||
    currentState.optionB !== latestState.optionB
  );
}

/**
 * Updates currentState with new state and renders prompts
 * @param {Object} currentState - Current state object
 * @param {Object} newState - New state object to merge
 */
function updateAndRenderPrompts(currentState, newState) {
  const otherState = handleStatePush(currentState, newState);
  Object.assign(currentState, otherState);
  renderPrompts(currentState);
  renderStatus(currentState);
}

/**
 * Safely reads storage with error handling
 * @returns {Promise<Object|null>} Stored state or null if error
 */
async function readStorageSafely() {
  let rawStored = {};
  let storedState = null;
  try {
    if (isExtensionContextValid()) {
      rawStored = await chrome.storage.sync.get(STATE_KEY);
      storedState = rawStored[STATE_KEY];
    } else {
      console.warn("[Prompanion Sidepanel] Extension context invalidated, skipping storage read");
    }
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error reading storage:", error);
  }
  return storedState;
}

/**
 * Schedules a prompt check after a delay
 * @param {number} delay - Delay in milliseconds
 * @param {string} logMessage - Message to log when checking
 */
function schedulePromptCheck(delay, logMessage) {
  setTimeout(async () => {
    const latestState = await loadState();
    if (hasPrompts(latestState) && promptsNeedUpdate(currentState, latestState)) {
      console.log(logMessage);
      updateAndRenderPrompts(currentState, latestState);
    }
  }, delay);
}

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
 * Welcome message content for new conversations
 */
const WELCOME_MESSAGE = "Welcome to the Side Chat! This is where you can ask me questions to elaborate on ideas you aren't clear on. I open up automatically when you highlight any text response from your LLM in the browser and click the \"Elaborate\" button. I'm here to help!";

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
        content: WELCOME_MESSAGE,
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
  let stored;
  try {
    stored = await storage.get(STATE_KEY);
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error loading state from storage:", error);
    // If storage fails, use default state
    stored = null;
  }
  
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
  
  // CRITICAL: Preserve prompts from stored state - they should NEVER be overwritten by defaults
  const mergedState = {
    ...structuredClone(defaultState),
    ...stored,
    // Explicitly preserve prompt fields from stored state - use stored value if it exists (even if empty string)
    // Only use default if stored value is truly undefined
    originalPrompt: stored.hasOwnProperty('originalPrompt') ? stored.originalPrompt : defaultState.originalPrompt,
    optionA: stored.hasOwnProperty('optionA') ? stored.optionA : defaultState.optionA,
    optionB: stored.hasOwnProperty('optionB') ? stored.optionB : defaultState.optionB,
    settings: { ...defaultState.settings, ...stored.settings },
    conversations: validConversations,
    activeConversationId: null // Will be set to new conversation in init()
  };
  
  console.log("[Prompanion Sidepanel] loadState merge result:", {
    storedHasPrompts: hasPrompts(stored),
    mergedHasPrompts: hasPrompts(mergedState),
    storedOriginalPrompt: stored.originalPrompt?.substring(0, 50),
    storedOptionA: stored.optionA?.substring(0, 50),
    storedOptionB: stored.optionB?.substring(0, 50),
    mergedOriginalPrompt: mergedState.originalPrompt?.substring(0, 50),
    mergedOptionA: mergedState.optionA?.substring(0, 50),
    mergedOptionB: mergedState.optionB?.substring(0, 50),
    storedHasOriginalPrompt: stored.hasOwnProperty('originalPrompt'),
    storedHasOptionA: stored.hasOwnProperty('optionA'),
    storedHasOptionB: stored.hasOwnProperty('optionB')
  });

  if (storedLibraryVersion !== LIBRARY_SCHEMA_VERSION) {
    mergedState.library = createDefaultLibrary();
    mergedState.libraryVersion = LIBRARY_SCHEMA_VERSION;
  } else {
    mergedState.library = normalizedLibrary;
  }
  
  // CRITICAL: Don't overwrite prompts when saving merged state - preserve them from stored
  // Only save if we're not overwriting existing prompts
  if (hasPrompts(stored)) {
    // Preserve prompts from stored state
    mergedState.originalPrompt = stored.originalPrompt || mergedState.originalPrompt;
    mergedState.optionA = stored.optionA || mergedState.optionA;
    mergedState.optionB = stored.optionB || mergedState.optionB;
  }
  
  // Only save if library changed, not on every load (to avoid overwriting prompts)
  if (storedLibraryVersion !== LIBRARY_SCHEMA_VERSION) {
    storage.set(STATE_KEY, mergedState).catch((error) => {
      console.warn("Prompanion: failed to persist normalized library", error);
    });
  }
  
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
  
  // SIMPLIFIED: Read prompts directly from storage, bypass merge logic
  const storedState = await readStorageSafely();
  
  console.log("[Prompanion Sidepanel] ========== INIT START ==========");
  console.log("[Prompanion Sidepanel] Raw stored state:", {
    hasStored: !!storedState,
    hasOriginalPrompt: !!storedState?.originalPrompt,
    hasOptionA: !!storedState?.optionA,
    hasOptionB: !!storedState?.optionB,
    originalPrompt: storedState?.originalPrompt?.substring(0, 50),
    optionA: storedState?.optionA?.substring(0, 50),
    optionB: storedState?.optionB?.substring(0, 50)
  });

  // DIRECT: If storage has prompts, use them directly - NO MERGE LOGIC
  if (storedState && hasPrompts(storedState)) {
    console.log("[Prompanion Sidepanel] ========== FOUND PROMPTS IN STORAGE ==========");
    console.log("[Prompanion Sidepanel] Stored prompts:", {
      originalPrompt: storedState.originalPrompt?.substring(0, 100),
      optionA: storedState.optionA?.substring(0, 100),
      optionB: storedState.optionB?.substring(0, 100),
      originalPromptLength: storedState.originalPrompt?.length,
      optionALength: storedState.optionA?.length,
      optionBLength: storedState.optionB?.length
    });
    
    // DIRECT ASSIGNMENT - no merge, no checks, just assign
    currentState.originalPrompt = storedState.originalPrompt || "";
    currentState.optionA = storedState.optionA || "";
    currentState.optionB = storedState.optionB || "";
    
    console.log("[Prompanion Sidepanel] Assigned to currentState:", {
      originalPrompt: currentState.originalPrompt?.substring(0, 50),
      optionA: currentState.optionA?.substring(0, 50),
      optionB: currentState.optionB?.substring(0, 50)
    });
    
    // Render immediately and aggressively
    console.log("[Prompanion Sidepanel] Calling renderPrompts NOW");
    renderPrompts({
      originalPrompt: currentState.originalPrompt,
      optionA: currentState.optionA,
      optionB: currentState.optionB
    });
    
    // Also render multiple times to ensure it sticks
    [100, 500, 1000].forEach(delay => {
      setTimeout(() => {
        renderPrompts({
          originalPrompt: currentState.originalPrompt,
          optionA: currentState.optionA,
          optionB: currentState.optionB
        });
      }, delay);
    });
  } else {
    console.log("[Prompanion Sidepanel] No prompts in storage, initializing empty");
    initPromptEnhancer(currentState);
  }
  
  // Also check storage again after a short delay to catch any updates
  // This is important because enhancements might be generated while the side panel is loading
  schedulePromptCheck(500, "[Prompanion Sidepanel] Found updated prompts in storage after delay, updating and rendering...");
  
  // One more check after 1 second to be absolutely sure
  schedulePromptCheck(1000, "[Prompanion Sidepanel] Final delayed check - updating prompts...");

  // Check if there's already a fresh conversation (only welcome message)
  const existingFreshConversation = currentState.conversations.find((conv) => 
    isFreshConversation(conv)
  );

  if (existingFreshConversation) {
    // Use the existing fresh conversation instead of creating a new one
    currentState.activeConversationId = existingFreshConversation.id;
  } else {
    // Create a new conversation only if no fresh one exists
    const newConversation = createNewConversation();
    currentState.conversations.push(newConversation);
    currentState.activeConversationId = newConversation.id;
  }
  
  // CRITICAL: Before saving, check if storage has prompts that we don't have
  // This prevents us from overwriting prompts that were just saved by the background script
  const latestStorage = await storage.get(STATE_KEY);
  if (latestStorage && hasPrompts(latestStorage)) {
    if (!currentState.originalPrompt && !currentState.optionA && !currentState.optionB) {
      console.log("[Prompanion Sidepanel] Storage has prompts we don't have, preserving them before save");
      currentState.originalPrompt = latestStorage.originalPrompt || "";
      currentState.optionA = latestStorage.optionA || "";
      currentState.optionB = latestStorage.optionB || "";
    }
  }
  
  await saveState(currentState);

  const activeConversation = getActiveConversation(currentState);

  renderStatus(currentState);
  renderSettings(currentState.settings);
  renderLibrary(currentState.library);

  registerCopyHandlers();
  registerLibraryHandlers(currentState, {
    saveState,
    LIBRARY_SCHEMA_VERSION
  });
  registerSettingsHandlers(currentState, { saveState });
  registerAccountHandlers();
  initTabs();
  registerSectionActionGuards();
  
  // Initialize side chat after module loads (or immediately if already loaded)
  window.initSideChat = function() {
    console.log("[Prompanion Sidepanel] Initializing side chat...");
    const activeConv = getActiveConversation(currentState);
    renderChat(activeConv?.history ?? []);
    renderChatTabs(currentState.conversations, currentState.activeConversationId);
    registerChatHandlers(currentState, {
      renderStatus,
      saveState
    });
    
    // Check if there's a pending side chat message and open section if needed
    if (currentState.pendingSideChat?.text) {
      openSideChatSection();
    }
    
    processPendingSideChat(currentState, { saveState });
    console.log("[Prompanion Sidepanel] Side chat initialized");
  };
  
  // Wait for sideChat module to load, then initialize
  sideChatLoadPromise.then(() => {
    if (window.initSideChat) {
      window.initSideChat();
    }
  });

  registerEnhanceButton(currentState, {
    renderStatus,
    saveState
  });

  // Process any pending messages that arrived before initialization
  if (pendingMessages.length > 0) {
    pendingMessages.forEach((message) => {
      if (message.type === "PROMPANION_STATE_PUSH" && message.state) {
        updateAndRenderPrompts(currentState, message.state);
        processPendingSideChat(currentState, { saveState });
      }
    });
    pendingMessages.length = 0;
  }

  // Process any storage changes that happened before init completed
  if (pendingStorageChanges.length > 0) {
    console.log("[Prompanion Sidepanel] Processing pending storage changes:", pendingStorageChanges.length);
    pendingStorageChanges.forEach((newState) => {
      if (hasPrompts(newState)) {
        updateAndRenderPrompts(currentState, newState);
        processPendingSideChat(currentState, { saveState });
      }
    });
    pendingStorageChanges.length = 0;
  }

  // Final check: re-read storage to catch any updates that happened during init
  const finalState = await loadState();
  console.log("[Prompanion Sidepanel] Final state check:", {
    hasOriginalPrompt: !!finalState?.originalPrompt,
    hasOptionA: !!finalState?.optionA,
    hasOptionB: !!finalState?.optionB,
    originalPrompt: finalState?.originalPrompt?.substring(0, 50),
    optionA: finalState?.optionA?.substring(0, 50),
    optionB: finalState?.optionB?.substring(0, 50)
  });
  if (finalState && hasPrompts(finalState)) {
    if (promptsNeedUpdate(currentState, finalState)) {
      console.log("[Prompanion Sidepanel] State needs update, applying changes");
      updateAndRenderPrompts(currentState, finalState);
    }
  }

  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "PROMPANION_REQUEST_STATE" }, (response) => {
      if (response?.ok && response.state) {
        if (hasPrompts(response.state)) {
          const otherState = handleStatePush(currentState, response.state);
          Object.assign(currentState, otherState);
          renderPrompts(currentState);
        } else {
          handleStateRestore(currentState, response.state);
        }
        renderStatus(currentState);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

// Also listen for visibility changes to refresh prompts when side panel becomes visible
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && currentState) {
    console.log("[Prompanion Sidepanel] Side panel became visible, checking for updated prompts...");
    // Re-read storage and update prompts
    loadState().then((latestState) => {
      if (hasPrompts(latestState)) {
        if (promptsNeedUpdate(currentState, latestState)) {
          console.log("[Prompanion Sidepanel] Visibility change detected prompts update, rendering...");
          updateAndRenderPrompts(currentState, latestState);
        } else {
          console.log("[Prompanion Sidepanel] Visibility change - prompts already up to date, re-rendering anyway");
          renderPrompts(currentState);
        }
      } else {
        console.log("[Prompanion Sidepanel] Visibility change - no prompts found in storage");
      }
    });
  }
});

// Expose manual functions for debugging
window.refreshPrompts = async function() {
  console.log("[Prompanion Sidepanel] ========== MANUAL REFRESH TRIGGERED ==========");
  const storedState = await readStorageSafely();
  if (!storedState) {
    console.warn("[Prompanion Sidepanel] Extension context invalidated, cannot refresh prompts");
    return;
  }
  
  if (storedState && hasPrompts(storedState)) {
    currentState.originalPrompt = storedState.originalPrompt || "";
    currentState.optionA = storedState.optionA || "";
    currentState.optionB = storedState.optionB || "";
    console.log("[Prompanion Sidepanel] Updated currentState, calling renderPrompts");
    renderPrompts({
      originalPrompt: currentState.originalPrompt,
      optionA: currentState.optionA,
      optionB: currentState.optionB
    });
    console.log("[Prompanion Sidepanel] Manual refresh complete");
  } else {
    console.log("[Prompanion Sidepanel] No prompts in storage");
  }
};

window.testPrompts = function() {
  console.log("[Prompanion Sidepanel] ========== TEST PROMPTS ==========");
  const originalField = document.getElementById("original-prompt");
  const optionAField = document.getElementById("option-a");
  const optionBField = document.getElementById("option-b");
  console.log("[Prompanion Sidepanel] DOM elements:", {
    hasOriginal: !!originalField,
    hasOptionA: !!optionAField,
    hasOptionB: !!optionBField
  });
  if (optionAField) {
    optionAField.value = "TEST VALUE FOR OPTION A";
    console.log("[Prompanion Sidepanel] Set test value, field now has:", optionAField.value);
  }
  if (optionBField) {
    optionBField.value = "TEST VALUE FOR OPTION B";
    console.log("[Prompanion Sidepanel] Set test value, field now has:", optionBField.value);
  }
};

// Set up storage listener BEFORE init() to catch all changes
if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    console.log("[Prompanion Sidepanel] ========== STORAGE CHANGE DETECTED ==========");
    console.log("[Prompanion Sidepanel] Storage change detected:", {
      areaName,
      hasStateKey: !!changes[STATE_KEY],
      hasNewValue: !!changes[STATE_KEY]?.newValue,
      currentStateReady: !!currentState
    });
    
    if (areaName === "sync" && changes[STATE_KEY]?.newValue) {
      const newState = changes[STATE_KEY].newValue;
      console.log("[Prompanion Sidepanel] Storage change - new state:", {
        hasOriginalPrompt: !!newState.originalPrompt,
        hasOptionA: !!newState.optionA,
        hasOptionB: !!newState.optionB,
        originalPrompt: newState.originalPrompt?.substring(0, 50),
        optionA: newState.optionA?.substring(0, 50),
        optionB: newState.optionB?.substring(0, 50),
        originalPromptLength: newState.originalPrompt?.length,
        optionALength: newState.optionA?.length,
        optionBLength: newState.optionB?.length
      });
      
      if (hasPrompts(newState)) {
        if (currentState) {
          // Process immediately if currentState is ready
          console.log("[Prompanion Sidepanel] Storage change - currentState ready, updating prompts");
          // DIRECT UPDATE - don't use handleStatePush, just update directly
          currentState.originalPrompt = newState.originalPrompt || currentState.originalPrompt;
          currentState.optionA = newState.optionA || currentState.optionA;
          currentState.optionB = newState.optionB || currentState.optionB;
          
          console.log("[Prompanion Sidepanel] Calling renderPrompts after storage change");
          renderPrompts(currentState);
          renderStatus(currentState);
          processPendingSideChat(currentState, { saveState });
        } else {
          // Queue for processing after init() completes
          console.log("[Prompanion Sidepanel] Storage change queued for after init");
          pendingStorageChanges.push(newState);
        }
      } else {
        console.log("[Prompanion Sidepanel] Storage change - no prompts in new state");
      }
    }
  });
  console.log("[Prompanion Sidepanel] Storage change listener registered");
} else {
  console.warn("[Prompanion Sidepanel] chrome.storage.onChanged not available!");
}

// ALSO: Poll storage every 2 seconds as a backup (remove this once we confirm it's working)
setInterval(async () => {
  if (currentState) {
    const latestState = await loadState();
    if (hasPrompts(latestState) && promptsNeedUpdate(currentState, latestState)) {
      console.log("[Prompanion Sidepanel] Poll detected prompts update, rendering...");
      currentState.originalPrompt = latestState.originalPrompt || currentState.originalPrompt;
      currentState.optionA = latestState.optionA || currentState.optionA;
      currentState.optionB = latestState.optionB || currentState.optionB;
      renderPrompts(currentState);
    }
  }
}, 2000);

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
        console.log("[Prompanion Sidepanel] PROMPANION_STATE_PUSH received:", {
          hasOriginalPrompt: !!message.state.originalPrompt,
          hasOptionA: !!message.state.optionA,
          hasOptionB: !!message.state.optionB,
          originalPrompt: message.state.originalPrompt?.substring(0, 50),
          optionA: message.state.optionA?.substring(0, 50),
          optionB: message.state.optionB?.substring(0, 50)
        });
        const otherState = handleStatePush(currentState, message.state);
        Object.assign(currentState, otherState);
        // Ensure prompts are rendered (handleStatePush should do this, but double-check)
        renderPrompts(currentState);
        renderStatus(currentState);
        // Don't process pending side chat here - PROMPANION_SIDECHAT_DELIVER handles it directly
        // processPendingSideChat(currentState, { saveState });
      }
    }
    if (message.type === "PROMPANION_SIDECHAT_DELIVER") {
      console.log("[Prompanion Sidepanel] ========== PROMPANION_SIDECHAT_DELIVER RECEIVED ==========");
      console.log("[Prompanion Sidepanel] Message:", {
        hasText: !!message.text,
        textLength: message.text?.length,
        textPreview: message.text?.substring(0, 50),
        hasChatHistory: !!message.chatHistory,
        chatHistoryLength: message.chatHistory?.length || 0,
        clearPending: message.clearPending
      });
      
      if (!currentState) {
        console.error("[Prompanion Sidepanel] No currentState available!");
        return;
      }
      
      // Update currentState with pendingSideChat data from the message
      // This ensures the chat history is available when triggerAutoSideChat is called
      if (message.text) {
        currentState.pendingSideChat = {
          text: message.text,
          chatHistory: Array.isArray(message.chatHistory) ? message.chatHistory : [],
          timestamp: Date.now()
        };
        console.log("[Prompanion Sidepanel] Updated pendingSideChat from PROMPANION_SIDECHAT_DELIVER:", {
          hasText: !!message.text,
          textLength: message.text?.length,
          chatHistoryLength: message.chatHistory?.length || 0
        });
      } else {
        console.error("[Prompanion Sidepanel] PROMPANION_SIDECHAT_DELIVER has no text!");
        return;
      }
      
      // Wait for sideChat module to load before using it
      sideChatLoadPromise.then(async () => {
        // CRITICAL: Use the text from currentState.pendingSideChat as the source of truth
        // This ensures we have the latest data, even if message.text is stale
        const textToSend = currentState.pendingSideChat?.text || message.text;
        
        if (!textToSend || !textToSend.trim()) {
          console.error("[Prompanion Sidepanel] PROMPANION_SIDECHAT_DELIVER: No valid text to send!", {
            hasPendingSideChat: !!currentState.pendingSideChat,
            pendingText: currentState.pendingSideChat?.text?.substring(0, 50),
            messageText: message.text?.substring(0, 50)
          });
          return;
        }
        
        console.log("[Prompanion Sidepanel] Sending text to triggerAutoSideChat:", {
          textLength: textToSend.length,
          textPreview: textToSend.substring(0, 50),
          source: currentState.pendingSideChat?.text ? "pendingSideChat" : "message.text"
        });
        
        // IMPORTANT: Open the Side Chat section FIRST and wait for it to be ready
        // This ensures the user can see the interaction happening
        const sectionOpened = await openSideChatSection();
        
        if (!sectionOpened) {
          console.warn("[Prompanion Sidepanel] Failed to open side chat section, proceeding anyway");
        }
        
        // Wait for the section to be fully expanded and DOM to be ready
        // Use a more robust waiting mechanism
        await new Promise(resolve => {
          let attempts = 0;
          const maxAttempts = 20; // 2 seconds max wait
          const checkReady = () => {
            attempts++;
            const sideChatSection = document.getElementById("side-chat-section");
            const chatMessage = document.getElementById("chat-message");
            const detailsElement = document.querySelector(".panel__section--chat details");
            const isExpanded = detailsElement?.open || detailsElement?.classList.contains("is-expanded");
            
            if (isExpanded && chatMessage) {
              console.log("[Prompanion Sidepanel] Side chat section ready after", attempts * 100, "ms");
              resolve();
            } else if (attempts >= maxAttempts) {
              console.warn("[Prompanion Sidepanel] Side chat section not ready after max attempts, proceeding anyway");
              resolve();
            } else {
              setTimeout(checkReady, 100);
            }
          };
          checkReady();
        });
        
        // Now trigger the auto chat - everything should be ready
        triggerAutoSideChat(currentState, textToSend, {
          fromPending: Boolean(message.clearPending),
          startFresh: true // Always start a fresh conversation when Elaborate button is pressed
        }, { saveState });
      }).catch((error) => {
        console.error("[Prompanion Sidepanel] Failed to load sideChat for PROMPANION_SIDECHAT_DELIVER:", error);
      });
    }
  });
}


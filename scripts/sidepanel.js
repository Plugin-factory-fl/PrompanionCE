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
import { cleanupStorage, getStorageInfo } from "./storageCleanup.js";
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
  enhancementsUsed: 0, // Will be updated from server
  enhancementsLimit: 10, // Will be updated from server
  activePlatform: "ChatGPT",
  originalPrompt: "",
  optionA: "",
  optionB: "",
  library: createDefaultLibrary(),
  settings: {
    complexity: 2,
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

// Flag to prevent save loops
let isSaving = false;
let lastSaveTime = 0;
const SAVE_DEBOUNCE_MS = 100; // Minimum time between saves

/**
 * Saves application state to storage
 * @param {Object} nextState - State object to save
 */
async function saveState(nextState) {
  // Prevent rapid successive saves (rate limiting)
  const now = Date.now();
  if (isSaving) {
    console.log("[Prompanion Sidepanel] Save already in progress, skipping...");
    return;
  }
  if (now - lastSaveTime < SAVE_DEBOUNCE_MS) {
    console.log("[Prompanion Sidepanel] Save debounced, too soon after last save");
    return;
  }
  
  isSaving = true;
  try {
  await storage.set(STATE_KEY, nextState);
    lastSaveTime = Date.now();
  } catch (error) {
    // Handle extension context invalidated
    if (error?.message?.includes("Extension context invalidated")) {
      console.error("[Prompanion Sidepanel] Extension context invalidated during storage.set:", error);
      showContextInvalidatedNotification();
      isSaving = false;
      return; // Silently fail - can't save if context is invalidated
    }
    
    // Handle quota exceeded errors
    if (error?.message?.includes("quota") || error?.message?.includes("QUOTA_BYTES")) {
      console.warn("[Prompanion Sidepanel] Storage quota exceeded, running cleanup...");
      try {
        const cleanupResult = await cleanupStorage();
        if (cleanupResult.cleaned) {
          console.log("[Prompanion Sidepanel] Cleanup saved", cleanupResult.saved, "bytes, retrying save...");
          // Retry saving after cleanup
          try {
            await storage.set(STATE_KEY, nextState);
            lastSaveTime = Date.now();
            console.log("[Prompanion Sidepanel] State saved after cleanup");
          } catch (retryError) {
            console.error("[Prompanion Sidepanel] Still can't save after cleanup:", retryError);
            // Don't clear prompts - just fail silently to prevent data loss
            console.warn("[Prompanion Sidepanel] Save failed, but preserving prompts in memory");
          }
        } else {
          console.error("[Prompanion Sidepanel] Cleanup failed or didn't free enough space");
        }
      } catch (cleanupError) {
        console.error("[Prompanion Sidepanel] Error during cleanup:", cleanupError);
      }
    } else {
      // Re-throw other errors
      throw error;
    }
  } finally {
    isSaving = false;
  }
}

/**
 * Fetches user usage data from the backend API
 * @returns {Promise<Object|null>} Usage object with enhancementsUsed and enhancementsLimit, or null if not logged in
 */
async function fetchUserUsage(retryCount = 0) {
  const MAX_RETRIES = 2;
  try {
    if (!isExtensionContextValid()) {
      if (retryCount < MAX_RETRIES) {
        console.warn(`[Prompanion Sidepanel] Extension context invalidated, retrying fetch (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        // Retry after a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchUserUsage(retryCount + 1);
      } else {
        console.warn("[Prompanion Sidepanel] Extension context invalidated after max retries, returning defaults");
        return { enhancementsUsed: 0, enhancementsLimit: 10 }; // Return defaults
      }
    }

    // Get auth token
    const result = await new Promise((resolve, reject) => {
      try {
        if (!chrome?.storage?.local) {
          reject(new Error("chrome.storage.local not available"));
          return;
        }
        chrome.storage.local.get(["authToken"], (items) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(items || { authToken: null });
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    if (!result.authToken) {
      // Not logged in - return default values
      return { enhancementsUsed: 0, enhancementsLimit: 10 };
    }

    // Fetch usage from API
    const BACKEND_URL = "https://prompanionce.onrender.com";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${BACKEND_URL}/api/user/usage`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${result.authToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          // Token invalid, return defaults
          return { enhancementsUsed: 0, enhancementsLimit: 10 };
        }
        console.warn("[Prompanion Sidepanel] Failed to fetch usage:", response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      console.log("[Prompanion Sidepanel] Fetched usage data from API:", {
        enhancementsUsed: data.enhancementsUsed,
        enhancementsLimit: data.enhancementsLimit,
        fullResponse: data
      });
      return {
        enhancementsUsed: data.enhancementsUsed ?? 0,
        enhancementsLimit: data.enhancementsLimit ?? 10
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.warn("[Prompanion Sidepanel] Usage fetch timed out");
        return null;
      } else {
        throw fetchError;
      }
    }
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error fetching user usage:", error);
    return null;
  }
}

// Prevent multiple simultaneous calls to updateEnhancementsDisplay
let isUpdatingEnhancements = false;

/**
 * Updates the enhancements count display with real data from the server
 */
async function updateEnhancementsDisplay() {
  // Prevent multiple simultaneous calls
  if (isUpdatingEnhancements) {
    console.log("[Prompanion Sidepanel] Enhancement display update already in progress, skipping");
    return;
  }
  
  isUpdatingEnhancements = true;
  try {
    const usage = await fetchUserUsage();
    if (usage) {
      // Update currentState
      if (currentState) {
        currentState.enhancementsUsed = usage.enhancementsUsed;
        currentState.enhancementsLimit = usage.enhancementsLimit;
      }
      // Update UI
      const countEl = document.getElementById("enhancements-count");
      const limitEl = document.getElementById("enhancements-limit");
      if (countEl) {
        countEl.textContent = usage.enhancementsUsed;
        console.log("[Prompanion Sidepanel] Updated enhancements count display:", usage.enhancementsUsed);
      }
      if (limitEl) {
        limitEl.textContent = usage.enhancementsLimit;
      }
    }
  } finally {
    isUpdatingEnhancements = false;
  }
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

// Expose renderStatus globally so Side Chat can use it
window.renderStatus = renderStatus;

/**
 * Updates the user status display based on authentication state
 */
async function updateUserStatus() {
  const userStatusEl = document.getElementById("user-status");
  if (!userStatusEl) return;

  try {
    // Check if extension context is valid first
    if (!isExtensionContextValid()) {
      console.warn("[Prompanion Sidepanel] Extension context invalidated, retrying updateUserStatus in 1 second");
      setTimeout(() => updateUserStatus(), 1000);
      return;
    }

    // Check for auth token in chrome.storage.local with timeout and error handling
    let result;
    try {
      result = await Promise.race([
        new Promise((resolve, reject) => {
          try {
            if (!chrome?.storage?.local) {
              reject(new Error("chrome.storage.local not available"));
              return;
            }
            chrome.storage.local.get(["authToken"], (items) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(items || { authToken: null });
              }
            });
          } catch (error) {
            reject(error);
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Storage timeout")), 2000)
        )
      ]);
    } catch (error) {
      console.warn("[Prompanion Sidepanel] Storage access failed:", error.message);
      // If context is invalidated, retry later
      if (error.message?.includes("Extension context invalidated") || 
          error.message?.includes("message port closed") ||
          !isExtensionContextValid()) {
        setTimeout(() => updateUserStatus(), 1000);
        return;
      }
      result = { authToken: null };
    }

    if (!result.authToken) {
      userStatusEl.textContent = "Not Logged In";
      return;
    }

    // Fetch user profile from backend with timeout
    const BACKEND_URL = "https://prompanionce.onrender.com";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/profile`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${result.authToken}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // If token is invalid, clear it and show not logged in
        if (response.status === 401) {
          try {
            chrome.storage.local.remove(["authToken"], () => {
              console.log("[Prompanion Sidepanel] Auth token removed due to 401");
            });
          } catch (error) {
            console.error("[Prompanion Sidepanel] Error removing auth token:", error);
          }
          userStatusEl.textContent = "Not Logged In";
        } else {
          console.warn("[Prompanion Sidepanel] Failed to fetch user profile:", response.status, response.statusText);
          userStatusEl.textContent = "Not Logged In";
        }
        return;
      }

      const data = await response.json();
      const user = data.user;

      // Display name if available (check for null, undefined, or empty string), otherwise email
      const userName = user.name?.trim();
      
      if (userName && userName.length > 0) {
        userStatusEl.textContent = userName;
      } else if (user.email) {
        userStatusEl.textContent = user.email;
      } else {
        userStatusEl.textContent = "Not Logged In";
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.warn("[Prompanion Sidepanel] User profile fetch timed out");
        userStatusEl.textContent = "Not Logged In";
      } else {
        throw fetchError;
      }
    }
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error updating user status:", error);
    userStatusEl.textContent = "Not Logged In";
  }
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
  // SETUP ACCOUNT BUTTON IMMEDIATELY - before anything else
  console.log("[Prompanion Sidepanel] ========== SETTING UP ACCOUNT BUTTON IMMEDIATELY ==========");
  try {
    const accountButton = document.getElementById("open-account");
    const accountDialog = document.getElementById("account-dialog");
    console.log("[Prompanion Sidepanel] Account elements check:", { 
      hasButton: !!accountButton, 
      hasDialog: !!accountDialog,
      buttonId: accountButton?.id,
      dialogId: accountDialog?.id
    });
    
    if (accountButton && accountDialog) {
      // DON'T add handlers here - LoginMenu.js will handle the account button click
      // LoginMenu.js needs to check login status and show the correct view
      console.log("[Prompanion Sidepanel] Account button found, LoginMenu.js will handle clicks");
    } else {
      console.error("[Prompanion Sidepanel] Account button or dialog missing! Button:", !!accountButton, "Dialog:", !!accountDialog);
    }
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error setting up account button:", error);
  }
  
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
    // Limit conversations to 7, deleting oldest if needed
    const MAX_CONVERSATIONS = 7;
    if (currentState.conversations.length > MAX_CONVERSATIONS) {
      // Sort by timestamp (oldest first) and keep only the most recent 7
      const sorted = [...currentState.conversations].sort((a, b) => {
        const timestampA = Number.parseInt(a.id.match(/^conv-(\d+)$/)?.[1] || "0", 10);
        const timestampB = Number.parseInt(b.id.match(/^conv-(\d+)$/)?.[1] || "0", 10);
        return timestampA - timestampB;
      });
      currentState.conversations = sorted.slice(-MAX_CONVERSATIONS);
      // If active conversation was deleted, switch to most recent
      if (!currentState.conversations.find(c => c.id === currentState.activeConversationId)) {
        currentState.activeConversationId = currentState.conversations[currentState.conversations.length - 1]?.id || null;
      }
    }
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

  // Fetch and display real usage data from server
  await updateEnhancementsDisplay();

  renderStatus(currentState);
  // Update user login status - try immediately and also after delays
  updateUserStatus();
  setTimeout(() => updateUserStatus(), 500);
  setTimeout(() => updateUserStatus(), 2000);
  // Also update enhancements display after delays to ensure it's current
  setTimeout(() => updateEnhancementsDisplay(), 500);
  setTimeout(() => updateEnhancementsDisplay(), 2000);
  renderSettings(currentState.settings);
  renderLibrary(currentState.library);

  // Check storage and cleanup if needed - run this more aggressively
  try {
    const storageInfo = await getStorageInfo();
    if (storageInfo) {
      console.log("[Prompanion Sidepanel] Storage info:", {
        totalSize: storageInfo.totalSize,
        stateSize: storageInfo.stateSize,
        conversations: storageInfo.conversations,
        libraryFolders: storageInfo.libraryFolders
      });
      
      // Lower threshold - clean up at 70KB instead of 80KB
      if (storageInfo.totalSize > 70000) {
        console.warn("[Prompanion Sidepanel] Storage approaching limit (" + storageInfo.totalSize + " bytes), running cleanup...");
        const cleanupResult = await cleanupStorage();
        if (cleanupResult.cleaned) {
          console.log("[Prompanion Sidepanel] Storage cleaned:", cleanupResult.saved, "bytes saved");
        }
      }
    }
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error during storage cleanup:", error);
    // Try cleanup anyway if we can't get info
    try {
      await cleanupStorage();
    } catch (cleanupError) {
      console.error("[Prompanion Sidepanel] Cleanup also failed:", cleanupError);
    }
  }

  registerCopyHandlers();
  registerLibraryHandlers(currentState, {
    saveState,
    LIBRARY_SCHEMA_VERSION
  });
  registerSettingsHandlers(currentState, { saveState });
  
  // Setup account button handler - do this FIRST and independently
  const setupAccountButtonDirectly = () => {
    console.log("[Prompanion Sidepanel] ========== SETTING UP ACCOUNT BUTTON ==========");
    const accountButton = document.getElementById("open-account");
    const accountDialog = document.getElementById("account-dialog");
    
    console.log("[Prompanion Sidepanel] Elements found:", {
      hasButton: !!accountButton,
      hasDialog: !!accountDialog,
      button: accountButton,
      dialog: accountDialog
    });
    
    if (!accountButton || !accountDialog) {
      console.error("[Prompanion Sidepanel] Missing elements! Button:", !!accountButton, "Dialog:", !!accountDialog);
      return false;
    }
    
    // DON'T add handlers here - let LoginMenu.js handle it
    // The LoginMenu.js handler will check login status and show the correct view
    console.log("[Prompanion Sidepanel] Account button found, LoginMenu.js will handle clicks");
    
    console.log("[Prompanion Sidepanel] Account button handlers attached!");
    return true;
  };
  
  // Try immediately
  if (!setupAccountButtonDirectly()) {
    console.warn("[Prompanion Sidepanel] Initial setup failed, retrying...");
    setTimeout(() => setupAccountButtonDirectly(), 100);
    setTimeout(() => setupAccountButtonDirectly(), 500);
    setTimeout(() => setupAccountButtonDirectly(), 1000);
  }
  
  // Also try registerAccountHandlers (but don't depend on it)
  try {
    console.log("[Prompanion Sidepanel] Calling registerAccountHandlers...");
  registerAccountHandlers();
    console.log("[Prompanion Sidepanel] registerAccountHandlers completed");
  } catch (error) {
    console.error("[Prompanion Sidepanel] Error in registerAccountHandlers (non-fatal):", error);
  }
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
    saveState,
    updateEnhancementsDisplay // Pass function to update usage after enhancement
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

// Setup account button as early as possible
function setupAccountButtonEarly() {
  console.log("[Prompanion Sidepanel] ========== EARLY ACCOUNT BUTTON SETUP ==========");
  const accountButton = document.getElementById("open-account");
  const accountDialog = document.getElementById("account-dialog");
  
  if (accountButton && accountDialog) {
    console.log("[Prompanion Sidepanel] Early setup: Found button and dialog");
    // DON'T add handlers here - LoginMenu.js will handle the account button click
    // LoginMenu.js needs to check login status and show the correct view
    console.log("[Prompanion Sidepanel] Early setup complete, LoginMenu.js will handle clicks");
  } else {
    console.warn("[Prompanion Sidepanel] Early setup: Elements not found yet");
  }
}

// Try immediately if DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupAccountButtonEarly);
} else {
  setupAccountButtonEarly();
}

// Also try after a short delay
setTimeout(setupAccountButtonEarly, 100);
setTimeout(setupAccountButtonEarly, 500);

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
    // Update user status when side panel becomes visible
    updateUserStatus();
    // Also update enhancements display when side panel becomes visible
    updateEnhancementsDisplay();
  }
});

// Expose cleanup function globally
window.cleanupStorage = async function() {
  console.log("[Prompanion Sidepanel] Manual storage cleanup triggered");
  try {
    const info = await getStorageInfo();
    console.log("[Prompanion Sidepanel] Storage before cleanup:", info);
    console.log("[Prompanion Sidepanel] Detailed breakdown:", JSON.stringify(info.breakdown, null, 2));
    const result = await cleanupStorage();
    console.log("[Prompanion Sidepanel] Cleanup result:", result);
    const infoAfter = await getStorageInfo();
    console.log("[Prompanion Sidepanel] Storage after cleanup:", infoAfter);
    console.log("[Prompanion Sidepanel] Detailed breakdown after:", JSON.stringify(infoAfter.breakdown, null, 2));
    alert(`Storage cleaned! Saved ${result.saved} bytes.\n\nBefore: ${info.totalSize} bytes\nAfter: ${infoAfter.totalSize} bytes`);
  } catch (error) {
    console.error("[Prompanion Sidepanel] Cleanup error:", error);
    alert("Error during cleanup: " + error.message);
  }
};

// Expose storage inspector
window.inspectStorage = async function() {
  try {
    const info = await getStorageInfo();
    console.log("[Prompanion Sidepanel] ========== STORAGE INSPECTION ==========");
    console.log("[Prompanion Sidepanel] Total size:", info.totalSize, "bytes");
    console.log("[Prompanion Sidepanel] State size:", info.stateSize, "bytes");
    console.log("[Prompanion Sidepanel] Detailed breakdown:", JSON.stringify(info.breakdown, null, 2));
    console.log("[Prompanion Sidepanel] Conversations:", info.conversations);
    console.log("[Prompanion Sidepanel] Library folders:", info.libraryFolders);
    
    // Get the actual state to see what's in it
    const result = await chrome.storage.sync.get(STATE_KEY);
    const state = result[STATE_KEY];
    if (state) {
      console.log("[Prompanion Sidepanel] Full state object:", state);
      console.log("[Prompanion Sidepanel] Conversations details:", state.conversations?.map(c => ({
        id: c.id,
        historyLength: c.history?.length || 0,
        historySize: JSON.stringify(c.history || []).length
      })));
    }
    
    return info;
  } catch (error) {
    console.error("[Prompanion Sidepanel] Inspection error:", error);
    return null;
  }
};

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

// Set up storage listener for auth token changes
if (chrome?.storage?.local?.onChanged) {
  chrome.storage.local.onChanged.addListener(async (changes, areaName) => {
    if (areaName === "local" && changes.authToken) {
      // Update user status when auth token changes
      updateUserStatus();
      // Also update enhancements display when login status changes
      updateEnhancementsDisplay();
    }
  });
}

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
          // Don't call processPendingSideChat here - it can trigger saveState and create a loop
          // processPendingSideChat(currentState, { saveState });
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
    
    // Handle usage updates from enhancements (e.g., Refine button)
    if (message.type === "PROMPANION_USAGE_UPDATE") {
      console.log("[Prompanion Sidepanel] ========== USAGE UPDATE RECEIVED ==========");
      console.log("[Prompanion Sidepanel] Usage data:", {
        enhancementsUsed: message.enhancementsUsed,
        enhancementsLimit: message.enhancementsLimit
      });
      
      if (message.enhancementsUsed !== undefined && message.enhancementsLimit !== undefined) {
        // Update state
        if (currentState) {
          currentState.enhancementsUsed = message.enhancementsUsed;
          currentState.enhancementsLimit = message.enhancementsLimit;
        }
        // Update UI directly
        const countEl = document.getElementById("enhancements-count");
        const limitEl = document.getElementById("enhancements-limit");
        if (countEl) {
          countEl.textContent = message.enhancementsUsed;
          console.log("[Prompanion Sidepanel] Updated enhancements count from message:", message.enhancementsUsed);
        }
        if (limitEl) {
          limitEl.textContent = message.enhancementsLimit;
        }
        // Also update via renderStatus
        renderStatus({
          ...currentState,
          enhancementsUsed: message.enhancementsUsed,
          enhancementsLimit: message.enhancementsLimit
        });
      }
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
        chatHistoryIsArray: Array.isArray(message.chatHistory),
        chatHistoryLength: message.chatHistory?.length || 0,
        chatHistoryType: typeof message.chatHistory,
        chatHistoryPreview: Array.isArray(message.chatHistory) && message.chatHistory.length > 0 ? {
          firstMessage: {
            role: message.chatHistory[0].role,
            contentPreview: message.chatHistory[0].content?.substring(0, 50)
          },
          totalMessages: message.chatHistory.length
        } : null,
        clearPending: message.clearPending
      });
      
      if (!currentState) {
        console.error("[Prompanion Sidepanel] No currentState available!");
        return;
      }
      
      // Store only the text snippet (not chat history) - chat history is passed directly in message
      if (message.text) {
        const chatHistoryArray = Array.isArray(message.chatHistory) ? message.chatHistory : [];
        currentState.pendingSideChat = {
          text: message.text,
          // Don't store chatHistory - it's passed directly in the message
          timestamp: Date.now()
        };
        console.log("[Prompanion Sidepanel] Updated pendingSideChat from PROMPANION_SIDECHAT_DELIVER:", {
          hasText: !!message.text,
          textLength: message.text?.length,
          chatHistoryLength: chatHistoryArray.length,
          chatHistoryIsArray: Array.isArray(chatHistoryArray),
          firstMessageRole: chatHistoryArray[0]?.role,
          firstMessagePreview: chatHistoryArray[0]?.content?.substring(0, 50),
          note: "Chat history passed directly in message, not stored"
        });
      } else {
        console.error("[Prompanion Sidepanel] PROMPANION_SIDECHAT_DELIVER has no text!");
        return;
      }
      
      // Wait for sideChat module to load before using it
      sideChatLoadPromise.then(async () => {
        // CRITICAL: Use the text from currentState.pendingSideChat as the source of truth
        // Chat history comes directly from the message, not from storage
        const textToSend = currentState.pendingSideChat?.text || message.text;
        const chatHistoryFromMessage = Array.isArray(message.chatHistory) ? message.chatHistory : [];
        
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
        
        // Now trigger the auto chat - pass chat history directly from message (not from storage)
        triggerAutoSideChat(currentState, textToSend, {
          fromPending: Boolean(message.clearPending),
          startFresh: true, // Always start a fresh conversation when Elaborate button is pressed
          llmChatHistory: chatHistoryFromMessage // Pass chat history directly from message
        }, { saveState });
      }).catch((error) => {
        console.error("[Prompanion Sidepanel] Failed to load sideChat for PROMPANION_SIDECHAT_DELIVER:", error);
      });
    }
  });
}


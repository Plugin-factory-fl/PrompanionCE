/**
 * Side Panel Main Script
 * Initializes and coordinates all side panel functionality
 */

console.log("[PromptProfile™ Sidepanel] ========== SIDEPANEL.JS LOADING ==========");
console.log("[PromptProfile™ Sidepanel] Timestamp:", new Date().toISOString());
console.log("[PromptProfile™ Sidepanel] Document ready state:", document.readyState);

import {
  initPromptEnhancer,
  renderPrompts,
  handleEnhance,
  registerCopyHandlers,
  initTabs,
  registerEnhanceButton,
  handleStateRestore,
  handleStatePush,
  handleSaveToLibrary
} from "../Source/promptEnhancer.js";
import { initPromptCreator } from "../Source/promptCreator.js";

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
    console.log("[PromptProfile™ Sidepanel] sideChat.js loaded successfully");
    
    // Initialize side chat after module loads
    if (typeof window.initSideChat === 'function') {
      window.initSideChat();
    }
    
    return module;
  })
  .catch((error) => {
    console.error("[PromptProfile™ Sidepanel] Failed to load sideChat.js:", error);
    console.error("[PromptProfile™ Sidepanel] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.log("[PromptProfile™ Sidepanel] Continuing with stub functions - prompts should still work");
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
  registerSettingsHandlers,
  getModelDisplayName
} from "../Source/settingsPanel.js";

/**
 * Default application state structure
 */
const defaultState = {
  plan: "Freemium",
  subscriptionStatus: "freemium", // Always default to freemium
  enhancementsUsed: 0, // Will be updated from server
  enhancementsLimit: 10, // Will be updated from server
  activePlatform: "ChatGPT",
  originalPrompt: "",
  optionA: "",
  library: createDefaultLibrary(),
  settings: {
    complexity: 2,
    model: "chatgpt",
    output: "text",
    realTimeEvaluation: true
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
    <div style="font-weight: 600; margin-bottom: 8px;">PromptProfile™ Extension Reloaded</div>
    <div style="opacity: 0.95;">Please reload this page to continue using PromptProfile™ features.</div>
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
        console.error("[PromptProfile™ Sidepanel] Extension context invalidated - cannot access storage");
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
        console.error("[PromptProfile™ Sidepanel] Extension context invalidated during storage.get:", error);
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
        console.error("[PromptProfile™ Sidepanel] Extension context invalidated - cannot save to storage");
        showContextInvalidatedNotification();
        return; // Silently fail - can't save if context is invalidated
      }
    await chrome.storage.sync.set({ [key]: value });
    } catch (error) {
      // Handle extension context invalidated errors gracefully
      if (error?.message?.includes("Extension context invalidated") || 
          error?.message?.includes("message port closed") ||
          !isExtensionContextValid()) {
        console.error("[PromptProfile™ Sidepanel] Extension context invalidated during storage.set:", error);
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
  return !!(state?.originalPrompt || state?.optionA);
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
    currentState.originalPrompt !== latestState.originalPrompt ||
    currentState.optionA !== latestState.optionA
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
      console.warn("[PromptProfile™ Sidepanel] Extension context invalidated, skipping storage read");
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error reading storage:", error);
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
const WELCOME_MESSAGE = "Welcome to the Side Chat!\n\nThis is where you can ask me questions to elaborate on ideas you aren't clear on. I open up automatically when you highlight any text response from your LLM in the browser and click the \"Elaborate\" button. I'm here to help!";

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
    console.error("[PromptProfile™ Sidepanel] Error loading state from storage:", error);
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
    // Always use ChatGPT - model selection removed
    settings: { 
      ...defaultState.settings, 
      ...(stored.settings || {}),
      model: "chatgpt" // Always ChatGPT, ignore stored model
    },
    conversations: validConversations,
    activeConversationId: null, // Will be set to new conversation in init()
    // Reset subscriptionStatus to default - it will be updated from API
    // Don't trust stored subscriptionStatus as it might be stale
    subscriptionStatus: defaultState.subscriptionStatus
  };
  
  // Always set activePlatform to ChatGPT - model selection removed
  mergedState.activePlatform = "ChatGPT";
  
  // Ensure settings object exists with defaults
  if (!mergedState.settings) {
    mergedState.settings = { ...defaultState.settings };
  }
  
  // loadState merge result - verbose logging removed

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
    console.log("[PromptProfile™ Sidepanel] Save already in progress, skipping...");
    return;
  }
  if (now - lastSaveTime < SAVE_DEBOUNCE_MS) {
    console.log("[PromptProfile™ Sidepanel] Save debounced, too soon after last save");
    return;
  }
  
  isSaving = true;
  try {
  await storage.set(STATE_KEY, nextState);
    lastSaveTime = Date.now();
  } catch (error) {
    // Handle extension context invalidated
    if (error?.message?.includes("Extension context invalidated")) {
      console.error("[PromptProfile™ Sidepanel] Extension context invalidated during storage.set:", error);
      showContextInvalidatedNotification();
      isSaving = false;
      return; // Silently fail - can't save if context is invalidated
    }
    
    // Handle quota exceeded errors
    if (error?.message?.includes("quota") || error?.message?.includes("QUOTA_BYTES")) {
      console.warn("[PromptProfile™ Sidepanel] Storage quota exceeded, running cleanup...");
      try {
        const cleanupResult = await cleanupStorage();
        if (cleanupResult.cleaned) {
          console.log("[PromptProfile™ Sidepanel] Cleanup saved", cleanupResult.saved, "bytes, retrying save...");
          // Retry saving after cleanup
          try {
            await storage.set(STATE_KEY, nextState);
            lastSaveTime = Date.now();
            console.log("[PromptProfile™ Sidepanel] State saved after cleanup");
          } catch (retryError) {
            console.error("[PromptProfile™ Sidepanel] Still can't save after cleanup:", retryError);
            // Don't clear prompts - just fail silently to prevent data loss
            console.warn("[PromptProfile™ Sidepanel] Save failed, but preserving prompts in memory");
          }
        } else {
          console.error("[PromptProfile™ Sidepanel] Cleanup failed or didn't free enough space");
        }
      } catch (cleanupError) {
        console.error("[PromptProfile™ Sidepanel] Error during cleanup:", cleanupError);
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
        console.warn(`[PromptProfile™ Sidepanel] Extension context invalidated, retrying fetch (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        // Retry after a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return fetchUserUsage(retryCount + 1);
      } else {
        console.warn("[PromptProfile™ Sidepanel] Extension context invalidated after max retries, returning defaults");
        return { 
          enhancementsUsed: 0, 
          enhancementsLimit: 10,
          subscriptionStatus: "freemium"
        }; // Return defaults
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
      // Not logged in - return default values with explicit freemium status
      return { 
        enhancementsUsed: 0, 
        enhancementsLimit: 10,
        subscriptionStatus: "freemium"
      };
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
          // Token invalid, return defaults with explicit freemium status
          return { 
            enhancementsUsed: 0, 
            enhancementsLimit: 10,
            subscriptionStatus: "freemium"
          };
        }
        console.warn("[PromptProfile™ Sidepanel] Failed to fetch usage:", response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      // Normalize subscription status - only "premium" is premium, everything else is freemium
      const rawSubscriptionStatus = data.subscriptionStatus;
      const subscriptionStatus = (rawSubscriptionStatus === "premium") ? "premium" : "freemium";
      
      console.log("[PromptProfile™ Sidepanel] Fetched usage data from API:", {
        enhancementsUsed: data.enhancementsUsed,
        enhancementsLimit: data.enhancementsLimit,
        rawSubscriptionStatus: rawSubscriptionStatus,
        normalizedSubscriptionStatus: subscriptionStatus,
        fullResponse: data
      });
      return {
        enhancementsUsed: data.enhancementsUsed ?? 0,
        enhancementsLimit: data.enhancementsLimit ?? 10,
        subscriptionStatus: subscriptionStatus
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.warn("[PromptProfile™ Sidepanel] Usage fetch timed out");
        return null;
      } else {
        throw fetchError;
      }
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error fetching user usage:", error);
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
    console.log("[PromptProfile™ Sidepanel] Enhancement display update already in progress, skipping");
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
        // subscriptionStatus is the source of truth - ensure it's always set
        currentState.subscriptionStatus = usage.subscriptionStatus || "freemium";
        // Don't set plan here - let renderStatus determine it from subscriptionStatus
      }
      // Update UI
      const countEl = document.getElementById("enhancements-count");
      const limitEl = document.getElementById("enhancements-limit");
      if (countEl) {
        countEl.textContent = usage.enhancementsUsed;
        console.log("[PromptProfile™ Sidepanel] Updated enhancements count display:", usage.enhancementsUsed);
      }
      if (limitEl) {
        limitEl.textContent = usage.enhancementsLimit;
      }
      
      // Re-render status to ensure premium UI is shown/hidden correctly
      // Only re-render if we have valid subscription status data
      if (currentState && usage.subscriptionStatus !== undefined) {
        // Use a debounce to prevent rapid re-renders
        clearTimeout(window._renderStatusTimeout);
        window._renderStatusTimeout = setTimeout(() => {
          renderStatus(currentState);
        }, 100);
      }
    }
  } finally {
    isUpdatingEnhancements = false;
  }
}

/**
 * Renders status information in the UI
 * @param {Object} status - Status object with plan, enhancementsUsed, enhancementsLimit, activePlatform, and optionally settings
 */
function renderStatus(status) {
  // Handle both direct status object and full state object
  // Always check currentState as fallback for subscription status
  // Get subscription status from the most reliable source
  let subscriptionStatus = status?.subscriptionStatus ?? currentState?.subscriptionStatus ?? "freemium";
  
  // Normalize subscription status - only "premium" is premium, everything else is freemium
  // This prevents issues with undefined, null, or other values
  if (subscriptionStatus !== "premium") {
    subscriptionStatus = "freemium";
  }
  
  console.log("[PromptProfile™ Sidepanel] renderStatus called with:", {
    statusSubscriptionStatus: status?.subscriptionStatus,
    currentStateSubscriptionStatus: currentState?.subscriptionStatus,
    normalizedSubscriptionStatus: subscriptionStatus
  });
  
  // Determine plan from subscription status - subscription status is the source of truth
  // Only use "premium" status to show "Pro", everything else is "Freemium"
  let plan = "Freemium";
  if (subscriptionStatus === "premium") {
    plan = "Pro";
  }
  
  const enhancementsUsed = status?.enhancementsUsed ?? currentState?.enhancementsUsed ?? 0;
  const enhancementsLimit = status?.enhancementsLimit ?? currentState?.enhancementsLimit ?? 10;
  const isPremium = subscriptionStatus === "premium";
  
  console.log("[PromptProfile™ Sidepanel] Rendering status:", {
    plan,
    isPremium,
    subscriptionStatus,
    enhancementsUsed,
    enhancementsLimit
  });
  
  document.getElementById("user-plan").textContent = plan;
  document.getElementById("enhancements-count").textContent = enhancementsUsed;
  document.getElementById("enhancements-limit").textContent = enhancementsLimit;
  
  // Show/hide "Unlimited free uses!" badge for Prompt Creator (only for non-pro users)
  const promptCreatorBadge = document.getElementById("prompt-creator-free-badge");
  if (promptCreatorBadge) {
    if (isPremium) {
      promptCreatorBadge.style.display = "none";
    } else {
      promptCreatorBadge.style.display = "inline-block";
    }
  }
  
  // Show/hide upgrade button based on plan and login status with graceful fade-in
  const upgradeBtn = document.getElementById("status-upgrade-btn");
  const isFreemium = !isPremium && (plan.toLowerCase() === "freemium" || plan.toLowerCase() === "free");
  
  // Hide upgrade button for premium users
  if (isPremium && upgradeBtn) {
    upgradeBtn.style.display = "none";
    upgradeBtn.classList.remove("btn--upgrade--visible", "btn--upgrade--fade-in");
    upgradeBtn.style.opacity = "0";
  }
  
  if (upgradeBtn) {
    // Reset button text if it's stuck on "Loading..."
    if (upgradeBtn.textContent === "Loading..." && !upgradeBtn.disabled) {
      upgradeBtn.textContent = "Get Pro";
    }
    
    // Check login status - use DOM as primary check, but verify with storage asynchronously
    const userStatus = document.getElementById("user-status")?.textContent;
    const isLoggedInFromDOM = userStatus && userStatus !== "Not Logged In";
    
    // If button is already visible and conditions seem right, keep it visible
    // This prevents the button from disappearing due to race conditions
    const buttonWasVisible = upgradeBtn.classList.contains("btn--upgrade--visible") || 
                             upgradeBtn.classList.contains("btn--upgrade--fade-in");
    
    // Verify login status with storage (non-blocking)
    chrome.storage.local.get("authToken", (result) => {
      const isLoggedInFromStorage = !!result.authToken;
      const shouldShow = isLoggedInFromStorage && isFreemium;
      
      if (shouldShow) {
        // Always show button if conditions are met
        if (!upgradeBtn.classList.contains("btn--upgrade--visible") && 
            !upgradeBtn.classList.contains("btn--upgrade--fade-in")) {
          // Show button and trigger fade-in animation
          upgradeBtn.style.display = "inline-flex";
          upgradeBtn.style.opacity = "0";
          void upgradeBtn.offsetWidth; // Force reflow
          upgradeBtn.classList.add("btn--upgrade--fade-in");
          setTimeout(() => {
            upgradeBtn.classList.remove("btn--upgrade--fade-in");
            upgradeBtn.classList.add("btn--upgrade--visible");
            upgradeBtn.style.opacity = "1";
            // Ensure pulsating animation continues after fade-in
            upgradeBtn.style.animation = "pulsateUpgrade 2s ease-in-out infinite";
          }, 2000);
        } else {
          // Button already visible or animating, ensure it stays displayed
          upgradeBtn.style.display = "inline-flex";
          upgradeBtn.style.opacity = "1";
          if (!upgradeBtn.classList.contains("btn--upgrade--visible") && 
              !upgradeBtn.classList.contains("btn--upgrade--fade-in")) {
            upgradeBtn.classList.add("btn--upgrade--visible");
          }
          // Ensure pulsating animation is applied
          upgradeBtn.style.animation = "pulsateUpgrade 2s ease-in-out infinite";
        }
      } else if (!isLoggedInFromStorage && !isFreemium) {
        // Only hide if we're sure user is not logged in AND not on freemium
        // Don't hide if button was visible and we're just checking - might be a race condition
        if (!buttonWasVisible || (!isLoggedInFromStorage && !isFreemium)) {
          upgradeBtn.style.display = "none";
          upgradeBtn.classList.remove("btn--upgrade--visible", "btn--upgrade--fade-in");
          upgradeBtn.style.opacity = "0";
        }
      }
    });
    
    // Immediate check using DOM (for initial render)
    if (isLoggedInFromDOM && isFreemium) {
      // If button is not visible yet, show it (will be verified by storage check above)
      if (!upgradeBtn.classList.contains("btn--upgrade--visible") && 
          !upgradeBtn.classList.contains("btn--upgrade--fade-in")) {
        upgradeBtn.style.display = "inline-flex";
        upgradeBtn.style.opacity = "0";
        void upgradeBtn.offsetWidth;
        upgradeBtn.classList.add("btn--upgrade--fade-in");
        setTimeout(() => {
          upgradeBtn.classList.remove("btn--upgrade--fade-in");
          upgradeBtn.classList.add("btn--upgrade--visible");
          upgradeBtn.style.opacity = "1";
          // Ensure pulsating animation continues after fade-in
          upgradeBtn.style.animation = "pulsateUpgrade 2s ease-in-out infinite";
        }, 2000);
      } else {
        // Button already visible, ensure it stays visible
        upgradeBtn.style.display = "inline-flex";
        upgradeBtn.style.opacity = "1";
        if (!upgradeBtn.classList.contains("btn--upgrade--visible") && 
            !upgradeBtn.classList.contains("btn--upgrade--fade-in")) {
          upgradeBtn.classList.add("btn--upgrade--visible");
        }
      }
    } else if (!isLoggedInFromDOM && !isFreemium) {
      // Only hide if DOM clearly shows not logged in AND not freemium
      // But preserve button if it was already visible (might be a race condition)
      if (!buttonWasVisible) {
        upgradeBtn.style.display = "none";
        upgradeBtn.classList.remove("btn--upgrade--visible", "btn--upgrade--fade-in");
        upgradeBtn.style.opacity = "0";
      }
    }
  }
  
  // Show/hide enhancements card vs give feedback card based on subscription status
  const enhancementsCard = document.getElementById("enhancements-used-card");
  const giveFeedbackCard = document.getElementById("give-feedback-card");
  
  if (isPremium) {
    // Premium users: hide enhancements card, show give feedback card
    if (enhancementsCard) {
      enhancementsCard.style.display = "none";
    }
    if (giveFeedbackCard) {
      giveFeedbackCard.style.display = "block";
    }
  } else {
    // Freemium users: show enhancements card, hide give feedback card
    if (enhancementsCard) {
      enhancementsCard.style.display = "block";
    }
    if (giveFeedbackCard) {
      giveFeedbackCard.style.display = "none";
    }
  }
  
  // Model Being Used card removed - always uses ChatGPT
}

// Expose renderStatus globally so Side Chat can use it
window.renderStatus = renderStatus;

/**
 * Polling interval for checking login status (in milliseconds)
 */
let loginCheckInterval = null;
let loginPollingStorageListener = null;

/**
 * Checks if user is logged in and shows login dialog if not
 * Also sets up polling if dialog is closed without logging in
 */
async function checkAndShowLoginDialog() {
  try {
    // Check if user is logged in
    const authResult = await new Promise((resolve) => {
      chrome.storage.local.get(["authToken"], (items) => {
        resolve(items || { authToken: null });
      });
    });
    
    if (!authResult.authToken) {
      // User is not logged in - show login dialog
      const accountDialog = document.getElementById("account-dialog");
      if (accountDialog) {
        console.log("[PromptProfile™ Sidepanel] User not logged in, opening login dialog");
        
        // Ensure login view is shown
        const loginView = document.getElementById("account-form");
        const loggedInView = document.getElementById("account-logged-in-view");
        if (loginView) {
          loginView.hidden = false;
          loginView.style.display = "block";
        }
        if (loggedInView) {
          loggedInView.hidden = true;
          loggedInView.style.display = "none";
        }
        
        accountDialog.showModal();
        
        // Set up polling when dialog is closed
        setupLoginPolling(accountDialog);
      } else {
        console.warn("[PromptProfile™ Sidepanel] Account dialog not found, cannot auto-open login");
        // Still set up polling in case dialog appears later
        setTimeout(() => {
          const accountDialog = document.getElementById("account-dialog");
          if (accountDialog) {
            setupLoginPolling(accountDialog);
          }
        }, 1000);
      }
    } else {
      // User is logged in - stop any existing polling
      stopLoginPolling();
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error checking login status:", error);
  }
}

/**
 * Sets up polling to check login status every 10 seconds
 * Shows login dialog again if user is still not logged in
 */
function setupLoginPolling(accountDialog) {
  // Clear any existing interval
  stopLoginPolling();
  
  // Set up close event listener to start polling
  const handleDialogClose = async () => {
    console.log("[PromptProfile™ Sidepanel] Login dialog closed, checking login status");
    
    // Small delay to allow any login operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check immediately if they logged in while dialog was open
    const authResult = await new Promise((resolve) => {
      chrome.storage.local.get(["authToken"], (items) => {
        resolve(items || { authToken: null });
      });
    });
    
    if (authResult.authToken) {
      // User logged in - stop polling
      console.log("[PromptProfile™ Sidepanel] User logged in, stopping polling");
      stopLoginPolling();
      return;
    }
    
    // User is still not logged in - start polling
    console.log("[PromptProfile™ Sidepanel] User still not logged in, starting polling (will check every 10 seconds)");
    
    // Start polling every 10 seconds
    loginCheckInterval = setInterval(async () => {
      try {
        const authResult = await new Promise((resolve) => {
          chrome.storage.local.get(["authToken"], (items) => {
            resolve(items || { authToken: null });
          });
        });
        
        if (!authResult.authToken) {
          // Still not logged in - show dialog again
          console.log("[PromptProfile™ Sidepanel] User still not logged in, showing login dialog again");
          
          // Ensure login view is shown
          const loginView = document.getElementById("account-form");
          const loggedInView = document.getElementById("account-logged-in-view");
          if (loginView) {
            loginView.hidden = false;
            loginView.style.display = "block";
          }
          if (loggedInView) {
            loggedInView.hidden = true;
            loggedInView.style.display = "none";
          }
          
          accountDialog.showModal();
        } else {
          // User logged in - stop polling
          console.log("[PromptProfile™ Sidepanel] User logged in, stopping polling");
          stopLoginPolling();
        }
      } catch (error) {
        console.error("[PromptProfile™ Sidepanel] Error during login polling:", error);
      }
    }, 10000); // Check every 10 seconds
  };
  
  // Add event listener for dialog close (use once: false so it can fire multiple times)
  // But only add it once - check if it's already been added
  if (!accountDialog.hasAttribute('data-login-polling-setup')) {
    accountDialog.addEventListener("close", handleDialogClose);
    accountDialog.setAttribute('data-login-polling-setup', 'true');
  }
  
  // Set up storage listener to stop polling when user logs in (only once)
  if (!loginPollingStorageListener) {
    loginPollingStorageListener = (changes, areaName) => {
      if (areaName === 'local' && changes.authToken) {
        if (changes.authToken.newValue) {
          // User logged in - stop polling
          console.log("[PromptProfile™ Sidepanel] Auth token added, stopping login polling");
          stopLoginPolling();
        }
      }
    };
    chrome.storage.onChanged.addListener(loginPollingStorageListener);
  }
}

/**
 * Stops the login status polling
 */
function stopLoginPolling() {
  if (loginCheckInterval) {
    clearInterval(loginCheckInterval);
    loginCheckInterval = null;
    console.log("[PromptProfile™ Sidepanel] Login polling stopped");
  }
  
  // Remove storage listener if it exists
  if (loginPollingStorageListener) {
    chrome.storage.onChanged.removeListener(loginPollingStorageListener);
    loginPollingStorageListener = null;
  }
}

/**
 * Updates the user status display based on authentication state
 */
async function updateUserStatus() {
  const userStatusEl = document.getElementById("user-status");
  if (!userStatusEl) return;

  try {
    // Check if extension context is valid first
    if (!isExtensionContextValid()) {
      console.warn("[PromptProfile™ Sidepanel] Extension context invalidated, retrying updateUserStatus in 1 second");
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
      console.warn("[PromptProfile™ Sidepanel] Storage access failed:", error.message);
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
              console.log("[PromptProfile™ Sidepanel] Auth token removed due to 401");
            });
          } catch (error) {
            console.error("[PromptProfile™ Sidepanel] Error removing auth token:", error);
          }
          userStatusEl.textContent = "Not Logged In";
        } else {
          console.warn("[PromptProfile™ Sidepanel] Failed to fetch user profile:", response.status, response.statusText);
          userStatusEl.textContent = "Not Logged In";
        }
        return;
      }

      const data = await response.json();
      const user = data.user;

      // Always display email so user knows which account they're logged in with
      if (user.email) {
        userStatusEl.textContent = user.email;
      } else {
        userStatusEl.textContent = "Not Logged In";
      }
      
      // Update currentState with subscription status from user profile
      // Normalize subscription status - only "premium" is premium, everything else is freemium
      const rawSubscriptionStatus = user.subscription_status || user.subscriptionStatus;
      const subscriptionStatus = (rawSubscriptionStatus === "premium") ? "premium" : "freemium";
      console.log("[PromptProfile™ Sidepanel] User profile subscription status:", {
        raw: rawSubscriptionStatus,
        normalized: subscriptionStatus
      });
      if (currentState) {
        currentState.subscriptionStatus = subscriptionStatus;
        console.log("[PromptProfile™ Sidepanel] Updated currentState.subscriptionStatus to:", currentState.subscriptionStatus);
        // Re-render status to reflect correct plan
        renderStatus(currentState);
      }
      
      // Show/hide crown icon based on subscription status
      const crownIcon = document.getElementById("account-crown-icon");
      if (crownIcon) {
        if (subscriptionStatus === "premium") {
          crownIcon.style.display = "block";
        } else {
          crownIcon.style.display = "none";
        }
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.warn("[PromptProfile™ Sidepanel] User profile fetch timed out");
        userStatusEl.textContent = "Not Logged In";
      } else {
        throw fetchError;
      }
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error updating user status:", error);
    userStatusEl.textContent = "Not Logged In";
  }
}

/**
 * Handles upgrade button click - triggers Stripe checkout
 */
async function handleUpgradeClick() {
  const BACKEND_URL = "https://prompanionce.onrender.com";
  const upgradeBtn = document.getElementById("status-upgrade-btn");
  
  if (!upgradeBtn) {
    console.error("[PromptProfile™ Sidepanel] Upgrade button not found");
    return;
  }

  // Disable button to prevent double-clicks
  upgradeBtn.disabled = true;
  const originalText = upgradeBtn.textContent;
  upgradeBtn.textContent = "Loading...";

  try {
    // Get auth token
    const authToken = await chrome.storage.local.get("authToken");
    const token = authToken.authToken;

    if (!token) {
      alert("Please log in to upgrade your plan.");
      upgradeBtn.disabled = false;
      upgradeBtn.textContent = originalText;
      return;
    }

    // Create checkout session
    const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "Failed to create checkout session");
    }

    const data = await response.json();

    // Redirect to Stripe Checkout
    if (data.url) {
      // Open in new tab since we're in a sidepanel
      chrome.tabs.create({ url: data.url });
      // Reset button after successful checkout session creation
      upgradeBtn.disabled = false;
      upgradeBtn.textContent = "Get Pro";
    } else {
      throw new Error("No checkout URL received");
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Checkout error:", error);
    alert("Failed to start checkout: " + error.message + "\n\nPlease try again or contact support.");
    upgradeBtn.disabled = false;
    upgradeBtn.textContent = "Get Pro";
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
  
  // Prevent email us button from triggering other handlers
  const emailUsBtn = document.getElementById("email-us-button");
  if (emailUsBtn) {
    ["pointerdown", "mousedown", "click", "touchstart", "keydown"].forEach((type) => {
      emailUsBtn.addEventListener(
        type,
        (event) => {
          event.stopPropagation();
        },
        { passive: false }
      );
    });
  }
}

/**
 * Registers event handlers for section info buttons
 */
function registerInfoButtonHandlers() {
  // Prompt Creator info button
  const promptCreatorInfoButton = document.getElementById("prompt-creator-info-btn");
  const promptCreatorInfoDialog = document.getElementById("prompt-creator-info-dialog");
  
  if (promptCreatorInfoButton && promptCreatorInfoDialog) {
    promptCreatorInfoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      promptCreatorInfoDialog.showModal();
    });
  }

  // Prompt Enhancer info button
  const promptEnhancerInfoButton = document.getElementById("prompt-enhancer-info-btn");
  const promptEnhancerInfoDialog = document.getElementById("prompt-enhancer-info-dialog");
  
  if (promptEnhancerInfoButton && promptEnhancerInfoDialog) {
    promptEnhancerInfoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      promptEnhancerInfoDialog.showModal();
    });
  }

  // Side Chat info button
  const sideChatInfoButton = document.getElementById("side-chat-info-btn");
  const sideChatInfoDialog = document.getElementById("side-chat-info-dialog");
  
  if (sideChatInfoButton && sideChatInfoDialog) {
    sideChatInfoButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      sideChatInfoDialog.showModal();
    });
  }
}

/**
 * Initializes the side panel application
 */
async function init() {
  // SETUP ACCOUNT BUTTON IMMEDIATELY - before anything else
  // Setting up account button immediately
  try {
    const accountButton = document.getElementById("open-account");
    const accountDialog = document.getElementById("account-dialog");
    console.log("[PromptProfile™ Sidepanel] Account elements check:", { 
      hasButton: !!accountButton, 
      hasDialog: !!accountDialog,
      buttonId: accountButton?.id,
      dialogId: accountDialog?.id
    });
    
    if (accountButton && accountDialog) {
      // DON'T add handlers here - LoginMenu.js will handle the account button click
      // LoginMenu.js needs to check login status and show the correct view
      console.log("[PromptProfile™ Sidepanel] Account button found, LoginMenu.js will handle clicks");
    } else {
      console.error("[PromptProfile™ Sidepanel] Account button or dialog missing! Button:", !!accountButton, "Dialog:", !!accountDialog);
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error setting up account button:", error);
  }
  
  currentState = await loadState();
  
  // SIMPLIFIED: Read prompts directly from storage, bypass merge logic
  const storedState = await readStorageSafely();
  
  // Init start
  console.log("[PromptProfile™ Sidepanel] Raw stored state:", {
    hasStored: !!storedState,
    hasOriginalPrompt: !!storedState?.originalPrompt,
    hasOptionA: !!storedState?.optionA,
    originalPrompt: storedState?.originalPrompt?.substring(0, 50),
    optionA: storedState?.optionA?.substring(0, 50)
  });

  // DIRECT: If storage has prompts, use them directly - NO MERGE LOGIC
  if (storedState && hasPrompts(storedState)) {
    // Found prompts in storage
    console.log("[PromptProfile™ Sidepanel] Stored prompts:", {
      originalPrompt: storedState.originalPrompt?.substring(0, 100),
      optionA: storedState.optionA?.substring(0, 100),
      originalPromptLength: storedState.originalPrompt?.length,
      optionALength: storedState.optionA?.length
    });
    
    // DIRECT ASSIGNMENT - no merge, no checks, just assign
    currentState.originalPrompt = storedState.originalPrompt || "";
    currentState.optionA = storedState.optionA || "";
    
    console.log("[PromptProfile™ Sidepanel] Assigned to currentState:", {
      originalPrompt: currentState.originalPrompt?.substring(0, 50),
      optionA: currentState.optionA?.substring(0, 50)
    });
    
    // Render immediately and aggressively
    // Calling renderPrompts
    renderPrompts({
      originalPrompt: currentState.originalPrompt,
      optionA: currentState.optionA
    });
    
    // Also render multiple times to ensure it sticks
    [100, 500, 1000].forEach(delay => {
    setTimeout(() => {
        renderPrompts({
          originalPrompt: currentState.originalPrompt,
          optionA: currentState.optionA
        });
      }, delay);
    });
  } else {
    console.log("[PromptProfile™ Sidepanel] No prompts in storage, initializing empty");
    initPromptEnhancer(currentState);
  }
  
  // Initialize Prompt Creator
  initPromptCreator(currentState);
  
  // Set dependencies for Prompt Creator save to library functionality
  if (typeof window.setPromptCreatorDependencies === 'function') {
    window.setPromptCreatorDependencies({
      renderLibrary,
      saveState,
      LIBRARY_SCHEMA_VERSION
    });
  }
  
  // Make handleSaveToLibrary available globally for Prompt Creator
  window.handleSaveToLibrary = handleSaveToLibrary;
  
  // Set dependencies for Prompt Creator save to library functionality
  if (typeof window.setPromptCreatorDependencies === 'function') {
    window.setPromptCreatorDependencies({
      renderLibrary,
      saveState,
      LIBRARY_SCHEMA_VERSION
    });
  }
  
  // Auto-open login dialog if user is not logged in
  checkAndShowLoginDialog();
  
  // Make handleSaveToLibrary available globally for Prompt Creator
  window.handleSaveToLibrary = handleSaveToLibrary;
  
  // Also check storage again after a short delay to catch any updates
  // This is important because enhancements might be generated while the side panel is loading
  schedulePromptCheck(500, "[PromptProfile™ Sidepanel] Found updated prompts in storage after delay, updating and rendering...");
  
  // One more check after 1 second to be absolutely sure
  schedulePromptCheck(1000, "[PromptProfile™ Sidepanel] Final delayed check - updating prompts...");

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
    if (!currentState.originalPrompt && !currentState.optionA) {
      console.log("[PromptProfile™ Sidepanel] Storage has prompts we don't have, preserving them before save");
      currentState.originalPrompt = latestStorage.originalPrompt || "";
      currentState.optionA = latestStorage.optionA || "";
    }
  }
  
  await saveState(currentState);

  const activeConversation = getActiveConversation(currentState);

  // Fetch and display real usage data from server (only if logged in)
  // Check if user is logged in before fetching usage
  try {
    const authResult = await new Promise((resolve) => {
      chrome.storage.local.get(["authToken"], (items) => {
        resolve(items || { authToken: null });
      });
    });
    
    if (authResult.authToken) {
      await updateEnhancementsDisplay();
    } else {
      // Not logged in - set defaults and render status
      if (currentState) {
        currentState.enhancementsUsed = 0;
        currentState.enhancementsLimit = 10;
        currentState.subscriptionStatus = "freemium";
      }
      renderStatus(currentState);
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error checking auth status:", error);
    // On error, still try to update (will handle not logged in case)
    await updateEnhancementsDisplay();
  }

  // Ensure activePlatform is always set from settings.model before rendering
  if (currentState.settings?.model) {
    currentState.activePlatform = getModelDisplayName(currentState.settings.model);
  } else if (!currentState.activePlatform) {
    currentState.activePlatform = "ChatGPT";
  }

  // Re-render status after updateEnhancementsDisplay to ensure subscription status is included
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
      console.log("[PromptProfile™ Sidepanel] Storage info:", {
        totalSize: storageInfo.totalSize,
        stateSize: storageInfo.stateSize,
        conversations: storageInfo.conversations,
        libraryFolders: storageInfo.libraryFolders
      });
      
      // Lower threshold - clean up at 70KB instead of 80KB
      if (storageInfo.totalSize > 70000) {
        console.warn("[PromptProfile™ Sidepanel] Storage approaching limit (" + storageInfo.totalSize + " bytes), running cleanup...");
        const cleanupResult = await cleanupStorage();
        if (cleanupResult.cleaned) {
          console.log("[PromptProfile™ Sidepanel] Storage cleaned:", cleanupResult.saved, "bytes saved");
        }
      }
    }
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error during storage cleanup:", error);
    // Try cleanup anyway if we can't get info
    try {
      await cleanupStorage();
    } catch (cleanupError) {
      console.error("[PromptProfile™ Sidepanel] Cleanup also failed:", cleanupError);
    }
  }

  registerCopyHandlers(currentState, {
    renderLibrary,
    saveState,
    LIBRARY_SCHEMA_VERSION
  });
  registerLibraryHandlers(currentState, {
    saveState,
    LIBRARY_SCHEMA_VERSION
  });
  registerSettingsHandlers(currentState, { saveState });
  
  // Setup account button handler - do this FIRST and independently
  const setupAccountButtonDirectly = () => {
    // Setting up account button
    const accountButton = document.getElementById("open-account");
    const accountDialog = document.getElementById("account-dialog");
    
    console.log("[PromptProfile™ Sidepanel] Elements found:", {
      hasButton: !!accountButton,
      hasDialog: !!accountDialog,
      button: accountButton,
      dialog: accountDialog
    });
    
    if (!accountButton || !accountDialog) {
      console.error("[PromptProfile™ Sidepanel] Missing elements! Button:", !!accountButton, "Dialog:", !!accountDialog);
      return false;
    }
    
    // DON'T add handlers here - let LoginMenu.js handle it
    // The LoginMenu.js handler will check login status and show the correct view
    console.log("[PromptProfile™ Sidepanel] Account button found, LoginMenu.js will handle clicks");
    
    console.log("[PromptProfile™ Sidepanel] Account button handlers attached!");
    return true;
  };
  
  // Try immediately
  if (!setupAccountButtonDirectly()) {
    console.warn("[PromptProfile™ Sidepanel] Initial setup failed, retrying...");
    setTimeout(() => setupAccountButtonDirectly(), 100);
    setTimeout(() => setupAccountButtonDirectly(), 500);
    setTimeout(() => setupAccountButtonDirectly(), 1000);
  }
  
  // Also try registerAccountHandlers (but don't depend on it)
  try {
    console.log("[PromptProfile™ Sidepanel] Calling registerAccountHandlers...");
    registerAccountHandlers();
    console.log("[PromptProfile™ Sidepanel] registerAccountHandlers completed");
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Error in registerAccountHandlers (non-fatal):", error);
    // Try again after a delay if it failed
    setTimeout(() => {
      try {
        registerAccountHandlers();
        console.log("[PromptProfile™ Sidepanel] registerAccountHandlers retry succeeded");
      } catch (retryError) {
        console.error("[PromptProfile™ Sidepanel] registerAccountHandlers retry also failed:", retryError);
      }
    }, 500);
  }
  initTabs();
  registerSectionActionGuards();
  registerInfoButtonHandlers();
  
  // Register upgrade button handler
  const upgradeBtn = document.getElementById("status-upgrade-btn");
  if (upgradeBtn) {
    upgradeBtn.addEventListener("click", handleUpgradeClick);
    console.log("[PromptProfile™ Sidepanel] Upgrade button handler registered");
  } else {
    console.warn("[PromptProfile™ Sidepanel] Upgrade button not found during init");
  }
  
  // Register email us button handler
  const emailUsBtn = document.getElementById("email-us-button");
  if (emailUsBtn) {
    emailUsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // Use anchor element approach for better compatibility
      const mailtoLink = document.createElement("a");
      mailtoLink.href = "mailto:megamix.ai.plugins@gmail.com?subject=PromptProfile Support Request";
      mailtoLink.target = "_blank";
      mailtoLink.rel = "noopener noreferrer";
      document.body.appendChild(mailtoLink);
      mailtoLink.click();
      document.body.removeChild(mailtoLink);
    }, { capture: true });
    console.log("[PromptProfile™ Sidepanel] Email Us button handler registered");
  }
  
  // Initialize side chat after module loads (or immediately if already loaded)
  window.initSideChat = function() {
    console.log("[PromptProfile™ Sidepanel] Initializing side chat...");
    const activeConv = getActiveConversation(currentState);
    renderChat(activeConv?.history ?? []);
    renderChatTabs(currentState.conversations, currentState.activeConversationId);
  registerChatHandlers(currentState, {
    renderStatus,
    saveState
  });
  
  // Don't auto-open sidechat on panel initialization - only open when "Elaborate" is pressed
  // The PROMPANION_SIDECHAT_DELIVER message handler will handle opening sidechat
  // when the user actually clicks "Elaborate"
  
  // Clear any stale pendingSideChat from storage to prevent auto-opening on next panel open
  if (currentState.pendingSideChat?.text) {
    console.log("[PromptProfile™ Sidepanel] Clearing stale pendingSideChat on panel initialization");
    currentState.pendingSideChat = null;
    saveState(currentState).catch(err => console.warn("Failed to clear pendingSideChat:", err));
  }
    console.log("[PromptProfile™ Sidepanel] Side chat initialized");
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
        // Don't process pendingSideChat here - PROMPANION_SIDECHAT_DELIVER handles it directly
        // processPendingSideChat(currentState, { saveState });
      }
    });
    pendingMessages.length = 0;
  }

  // Process any storage changes that happened before init completed
  if (pendingStorageChanges.length > 0) {
    console.log("[PromptProfile™ Sidepanel] Processing pending storage changes:", pendingStorageChanges.length);
    pendingStorageChanges.forEach((newState) => {
      if (hasPrompts(newState)) {
        updateAndRenderPrompts(currentState, newState);
        // Don't process pendingSideChat here - PROMPANION_SIDECHAT_DELIVER handles it directly
        // processPendingSideChat(currentState, { saveState });
      }
    });
    pendingStorageChanges.length = 0;
  }

  // Final check: re-read storage to catch any updates that happened during init
  // Add a small delay to ensure any background script saves have completed
  await new Promise(resolve => setTimeout(resolve, 100));
  const finalState = await loadState();
  console.log("[PromptProfile™ Sidepanel] Final state check:", {
    hasOriginalPrompt: !!finalState?.originalPrompt,
    hasOptionA: !!finalState?.optionA,
    originalPrompt: finalState?.originalPrompt?.substring(0, 50),
    optionA: finalState?.optionA?.substring(0, 50)
  });
  if (finalState && hasPrompts(finalState)) {
    // Always update prompts if they exist in storage, even if they match
    // This ensures we show the latest prompts even if currentState already has them
    console.log("[PromptProfile™ Sidepanel] Final state check - prompts found, ensuring they're displayed");
    updateAndRenderPrompts(currentState, finalState);
  } else {
    console.log("[PromptProfile™ Sidepanel] Final state check - no prompts in storage");
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
  // Early account button setup
  const accountButton = document.getElementById("open-account");
  const accountDialog = document.getElementById("account-dialog");
  
  if (accountButton && accountDialog) {
    console.log("[PromptProfile™ Sidepanel] Early setup: Found button and dialog");
    // DON'T add handlers here - LoginMenu.js will handle the account button click
    // LoginMenu.js needs to check login status and show the correct view
    console.log("[PromptProfile™ Sidepanel] Early setup complete, LoginMenu.js will handle clicks");
  } else {
    console.warn("[PromptProfile™ Sidepanel] Early setup: Elements not found yet");
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
    console.log("[PromptProfile™ Sidepanel] Side panel became visible, checking for updated prompts...");
    // Re-read storage and update prompts
    loadState().then((latestState) => {
      if (hasPrompts(latestState)) {
        if (promptsNeedUpdate(currentState, latestState)) {
          console.log("[PromptProfile™ Sidepanel] Visibility change detected prompts update, rendering...");
          updateAndRenderPrompts(currentState, latestState);
        } else {
          console.log("[PromptProfile™ Sidepanel] Visibility change - prompts already up to date, re-rendering anyway");
          renderPrompts(currentState);
        }
      } else {
        console.log("[PromptProfile™ Sidepanel] Visibility change - no prompts found in storage");
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
  console.log("[PromptProfile™ Sidepanel] Manual storage cleanup triggered");
  try {
    const info = await getStorageInfo();
    console.log("[PromptProfile™ Sidepanel] Storage before cleanup:", info);
    console.log("[PromptProfile™ Sidepanel] Detailed breakdown:", JSON.stringify(info.breakdown, null, 2));
    const result = await cleanupStorage();
    console.log("[PromptProfile™ Sidepanel] Cleanup result:", result);
    const infoAfter = await getStorageInfo();
    console.log("[PromptProfile™ Sidepanel] Storage after cleanup:", infoAfter);
    console.log("[PromptProfile™ Sidepanel] Detailed breakdown after:", JSON.stringify(infoAfter.breakdown, null, 2));
    alert(`Storage cleaned! Saved ${result.saved} bytes.\n\nBefore: ${info.totalSize} bytes\nAfter: ${infoAfter.totalSize} bytes`);
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Cleanup error:", error);
    alert("Error during cleanup: " + error.message);
  }
};

// Expose storage inspector
window.inspectStorage = async function() {
  try {
    const info = await getStorageInfo();
    console.log("[PromptProfile™ Sidepanel] ========== STORAGE INSPECTION ==========");
    console.log("[PromptProfile™ Sidepanel] Total size:", info.totalSize, "bytes");
    console.log("[PromptProfile™ Sidepanel] State size:", info.stateSize, "bytes");
    console.log("[PromptProfile™ Sidepanel] Detailed breakdown:", JSON.stringify(info.breakdown, null, 2));
    console.log("[PromptProfile™ Sidepanel] Conversations:", info.conversations);
    console.log("[PromptProfile™ Sidepanel] Library folders:", info.libraryFolders);
    
    // Get the actual state to see what's in it
    const result = await chrome.storage.sync.get(STATE_KEY);
    const state = result[STATE_KEY];
    if (state) {
      console.log("[PromptProfile™ Sidepanel] Full state object:", state);
      console.log("[PromptProfile™ Sidepanel] Conversations details:", state.conversations?.map(c => ({
        id: c.id,
        historyLength: c.history?.length || 0,
        historySize: JSON.stringify(c.history || []).length
      })));
    }
    
    return info;
  } catch (error) {
    console.error("[PromptProfile™ Sidepanel] Inspection error:", error);
    return null;
  }
};

// Expose manual functions for debugging
window.refreshPrompts = async function() {
  console.log("[PromptProfile™ Sidepanel] ========== MANUAL REFRESH TRIGGERED ==========");
  const storedState = await readStorageSafely();
  if (!storedState) {
    console.warn("[PromptProfile™ Sidepanel] Extension context invalidated, cannot refresh prompts");
    return;
  }
  
  if (storedState && hasPrompts(storedState)) {
    currentState.originalPrompt = storedState.originalPrompt || "";
    currentState.optionA = storedState.optionA || "";
    console.log("[PromptProfile™ Sidepanel] Updated currentState, calling renderPrompts");
    renderPrompts({
      originalPrompt: currentState.originalPrompt,
      optionA: currentState.optionA
    });
    console.log("[PromptProfile™ Sidepanel] Manual refresh complete");
  } else {
    console.log("[PromptProfile™ Sidepanel] No prompts in storage");
  }
};

window.testPrompts = function() {
  console.log("[PromptProfile™ Sidepanel] ========== TEST PROMPTS ==========");
  const originalField = document.getElementById("original-prompt");
  const optionAField = document.getElementById("option-a");
  console.log("[PromptProfile™ Sidepanel] DOM elements:", {
    hasOriginal: !!originalField,
    hasOptionA: !!optionAField
  });
  if (optionAField) {
    optionAField.value = "TEST VALUE FOR OPTION A";
    console.log("[PromptProfile™ Sidepanel] Set test value, field now has:", optionAField.value);
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
    console.log("[PromptProfile™ Sidepanel] ========== STORAGE CHANGE DETECTED ==========");
    console.log("[PromptProfile™ Sidepanel] Storage change detected:", {
      areaName,
      hasStateKey: !!changes[STATE_KEY],
      hasNewValue: !!changes[STATE_KEY]?.newValue,
      currentStateReady: !!currentState
    });
    
    if (areaName === "sync" && changes[STATE_KEY]?.newValue) {
      const newState = changes[STATE_KEY].newValue;
      console.log("[PromptProfile™ Sidepanel] Storage change - new state:", {
        hasOriginalPrompt: !!newState.originalPrompt,
        hasOptionA: !!newState.optionA,
        originalPrompt: newState.originalPrompt?.substring(0, 50),
        optionA: newState.optionA?.substring(0, 50),
        originalPromptLength: newState.originalPrompt?.length,
        optionALength: newState.optionA?.length
      });
      
      if (hasPrompts(newState)) {
        if (currentState) {
          // Process immediately if currentState is ready
          console.log("[PromptProfile™ Sidepanel] Storage change - currentState ready, updating prompts");
          // DIRECT UPDATE - don't use handleStatePush, just update directly
          currentState.originalPrompt = newState.originalPrompt || currentState.originalPrompt;
          currentState.optionA = newState.optionA || currentState.optionA;
          
          // Calling renderPrompts after storage change
          renderPrompts(currentState);
          renderStatus(currentState);
          // Don't call processPendingSideChat here - it can trigger saveState and create a loop
          // processPendingSideChat(currentState, { saveState });
        } else {
          // Queue for processing after init() completes
          console.log("[PromptProfile™ Sidepanel] Storage change queued for after init");
          pendingStorageChanges.push(newState);
        }
      } else {
        console.log("[PromptProfile™ Sidepanel] Storage change - no prompts in new state");
      }
    }
  });
  console.log("[PromptProfile™ Sidepanel] Storage change listener registered");
} else {
  console.warn("[PromptProfile™ Sidepanel] chrome.storage.onChanged not available!");
}

// ALSO: Poll storage every 2 seconds as a backup (remove this once we confirm it's working)
setInterval(async () => {
  if (currentState) {
    const latestState = await loadState();
    if (hasPrompts(latestState) && promptsNeedUpdate(currentState, latestState)) {
      console.log("[PromptProfile™ Sidepanel] Poll detected prompts update, rendering...");
      currentState.originalPrompt = latestState.originalPrompt || currentState.originalPrompt;
      currentState.optionA = latestState.optionA || currentState.optionA;
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
      console.log("[PromptProfile™ Sidepanel] ========== USAGE UPDATE RECEIVED ==========");
      console.log("[PromptProfile™ Sidepanel] Usage data:", {
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
          console.log("[PromptProfile™ Sidepanel] Updated enhancements count from message:", message.enhancementsUsed);
        }
        if (limitEl) {
          limitEl.textContent = message.enhancementsLimit;
        }
        // Also update via renderStatus
        renderStatus({
          ...currentState,
          enhancementsUsed: message.enhancementsUsed,
          enhancementsLimit: message.enhancementsLimit,
          subscriptionStatus: currentState.subscriptionStatus || message.subscriptionStatus
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
        console.log("[PromptProfile™ Sidepanel] PROMPANION_STATE_PUSH received:", {
          hasOriginalPrompt: !!message.state.originalPrompt,
          hasOptionA: !!message.state.optionA,
          originalPrompt: message.state.originalPrompt?.substring(0, 50),
          optionA: message.state.optionA?.substring(0, 50)
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
      console.log("[PromptProfile™ Sidepanel] ========== PROMPANION_SIDECHAT_DELIVER RECEIVED ==========");
      console.log("[PromptProfile™ Sidepanel] Message:", {
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
        console.error("[PromptProfile™ Sidepanel] No currentState available!");
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
        console.log("[PromptProfile™ Sidepanel] Updated pendingSideChat from PROMPANION_SIDECHAT_DELIVER:", {
          hasText: !!message.text,
          textLength: message.text?.length,
          chatHistoryLength: chatHistoryArray.length,
          chatHistoryIsArray: Array.isArray(chatHistoryArray),
          firstMessageRole: chatHistoryArray[0]?.role,
          firstMessagePreview: chatHistoryArray[0]?.content?.substring(0, 50),
          note: "Chat history passed directly in message, not stored"
        });
      } else {
        console.error("[PromptProfile™ Sidepanel] PROMPANION_SIDECHAT_DELIVER has no text!");
        return;
      }
      
      // Wait for sideChat module to load before using it
      sideChatLoadPromise.then(async () => {
        // CRITICAL: Use the text from currentState.pendingSideChat as the source of truth
        // Chat history comes directly from the message, not from storage
        const textToSend = currentState.pendingSideChat?.text || message.text;
        const chatHistoryFromMessage = Array.isArray(message.chatHistory) ? message.chatHistory : [];
        
        if (!textToSend || !textToSend.trim()) {
          console.error("[PromptProfile™ Sidepanel] PROMPANION_SIDECHAT_DELIVER: No valid text to send!", {
            hasPendingSideChat: !!currentState.pendingSideChat,
            pendingText: currentState.pendingSideChat?.text?.substring(0, 50),
            messageText: message.text?.substring(0, 50)
          });
          return;
        }
        
        console.log("[PromptProfile™ Sidepanel] Sending text to triggerAutoSideChat:", {
          textLength: textToSend.length,
          textPreview: textToSend.substring(0, 50),
          source: currentState.pendingSideChat?.text ? "pendingSideChat" : "message.text"
        });
        
        // IMPORTANT: Open the Side Chat section FIRST and wait for it to be ready
      // This ensures the user can see the interaction happening
        const sectionOpened = await openSideChatSection();
        
        if (!sectionOpened) {
          console.warn("[PromptProfile™ Sidepanel] Failed to open side chat section, proceeding anyway");
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
              console.log("[PromptProfile™ Sidepanel] Side chat section ready after", attempts * 100, "ms");
              resolve();
            } else if (attempts >= maxAttempts) {
              console.warn("[PromptProfile™ Sidepanel] Side chat section not ready after max attempts, proceeding anyway");
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
        console.error("[PromptProfile™ Sidepanel] Failed to load sideChat for PROMPANION_SIDECHAT_DELIVER:", error);
      });
    }
  });
}


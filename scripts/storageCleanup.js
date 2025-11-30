/**
 * Storage Cleanup Utility
 * Cleans up unnecessary data from Chrome sync storage to prevent quota exceeded errors
 */

const STATE_KEY = "prompanion-sidepanel-state";

/**
 * Cleans up storage by removing old conversations and truncating large data
 */
export async function cleanupStorage() {
  try {
    console.log("[Prompanion Cleanup] Starting storage cleanup...");
    
    // Get current state
    const result = await chrome.storage.sync.get(STATE_KEY);
    const state = result[STATE_KEY];
    
    if (!state) {
      console.log("[Prompanion Cleanup] No state found, nothing to clean");
      return { cleaned: false, sizeBefore: 0, sizeAfter: 0 };
    }

    const sizeBefore = JSON.stringify(state).length;
    console.log("[Prompanion Cleanup] Storage size before cleanup:", sizeBefore, "bytes");

    // Clean up conversations - remove old ones and truncate history more aggressively
    if (state.conversations && Array.isArray(state.conversations)) {
      const now = Date.now();
      const CONVERSATION_EXPIRATION_MS = 24 * 60 * 60 * 1000; // Reduced to 24 hours
      
      state.conversations = state.conversations
        .filter((conv) => {
          if (!conv || !conv.id) return false;
          const timestampMatch = conv.id.match(/^conv-(\d+)$/);
          if (!timestampMatch) return false;
          const conversationTimestamp = Number.parseInt(timestampMatch[1], 10);
          if (!Number.isFinite(conversationTimestamp)) return false;
          return (now - conversationTimestamp) < CONVERSATION_EXPIRATION_MS;
        })
        .map((conv) => {
          // Truncate long conversation histories (keep last 10 messages instead of 20)
          if (conv.history && Array.isArray(conv.history)) {
            if (conv.history.length > 10) {
              conv.history = conv.history.slice(-10);
            }
            // Also truncate individual message content if too long
            conv.history = conv.history.map((msg) => {
              if (msg.content && msg.content.length > 500) {
                msg.content = msg.content.substring(0, 500) + "...";
              }
              return msg;
            });
          }
          return conv;
        });
      
      console.log("[Prompanion Cleanup] Cleaned conversations");
    }

    // Clear old prompts more aggressively (keep only current session, truncate if too long)
    if (state.originalPrompt && state.originalPrompt.length > 500) {
      state.originalPrompt = state.originalPrompt.substring(0, 500);
    }
    if (state.optionA && state.optionA.length > 1000) {
      state.optionA = state.optionA.substring(0, 1000);
    }
    if (state.optionB && state.optionB.length > 1000) {
      state.optionB = state.optionB.substring(0, 1000);
    }

    // Clean up library - remove very large items more aggressively
    if (state.library && Array.isArray(state.library)) {
      state.library = state.library.map((folder) => {
        if (folder.prompts && Array.isArray(folder.prompts)) {
          // Limit prompts per folder to 30 (reduced from 50)
          folder.prompts = folder.prompts.slice(0, 30);
          // Truncate very long prompts more aggressively
          folder.prompts = folder.prompts.map((prompt) => {
            if (prompt.text && prompt.text.length > 300) {
              prompt.text = prompt.text.substring(0, 300);
            }
            return prompt;
          });
        }
        return folder;
      });
      console.log("[Prompanion Cleanup] Cleaned library");
    }

    // Remove unnecessary fields
    delete state.pendingSideChat; // This is temporary data
    delete state.lastEnhancementTime; // Not needed
    
    // More aggressive cleanup: truncate prompts if still too large
    const currentSize = JSON.stringify(state).length;
    if (currentSize > 7000) { // If still over 7KB, truncate more aggressively
      console.log("[Prompanion Cleanup] Still too large after initial cleanup, truncating more aggressively...");
      
      // Truncate prompts more aggressively
      if (state.originalPrompt && state.originalPrompt.length > 300) {
        state.originalPrompt = state.originalPrompt.substring(0, 300);
      }
      if (state.optionA && state.optionA.length > 500) {
        state.optionA = state.optionA.substring(0, 500);
      }
      if (state.optionB && state.optionB.length > 500) {
        state.optionB = state.optionB.substring(0, 500);
      }
      
      // Keep only the most recent 5 conversations
      if (state.conversations && Array.isArray(state.conversations) && state.conversations.length > 5) {
        state.conversations = state.conversations.slice(-5);
      }
      
      // Keep only last 5 messages per conversation
      if (state.conversations && Array.isArray(state.conversations)) {
        state.conversations = state.conversations.map((conv) => {
          if (conv.history && Array.isArray(conv.history) && conv.history.length > 5) {
            conv.history = conv.history.slice(-5);
          }
          return conv;
        });
      }
      
      // Limit library prompts even more
      if (state.library && Array.isArray(state.library)) {
        state.library = state.library.map((folder) => {
          if (folder.prompts && Array.isArray(folder.prompts)) {
            folder.prompts = folder.prompts.slice(0, 20); // Reduced to 20
            folder.prompts = folder.prompts.map((prompt) => {
              if (prompt.text && prompt.text.length > 200) {
                prompt.text = prompt.text.substring(0, 200);
              }
              return prompt;
            });
          }
          return folder;
        });
      }
    }

    const sizeAfter = JSON.stringify(state).length;
    console.log("[Prompanion Cleanup] Storage size after cleanup:", sizeAfter, "bytes");
    console.log("[Prompanion Cleanup] Saved:", sizeBefore - sizeAfter, "bytes");

    // Save cleaned state
    try {
      await chrome.storage.sync.set({ [STATE_KEY]: state });
      console.log("[Prompanion Cleanup] Cleaned state saved successfully");
      return { cleaned: true, sizeBefore, sizeAfter, saved: sizeBefore - sizeAfter };
    } catch (error) {
      if (error.message?.includes("quota") || error.message?.includes("QUOTA_BYTES")) {
        console.error("[Prompanion Cleanup] Still too large after cleanup, need more aggressive cleanup");
        // More aggressive cleanup - remove conversations entirely
        state.conversations = [];
        state.originalPrompt = "";
        state.optionA = "";
        state.optionB = "";
        await chrome.storage.sync.set({ [STATE_KEY]: state });
        return { cleaned: true, sizeBefore, sizeAfter: JSON.stringify(state).length, saved: sizeBefore - JSON.stringify(state).length, aggressive: true };
      }
      throw error;
    }
  } catch (error) {
    console.error("[Prompanion Cleanup] Error during cleanup:", error);
    throw error;
  }
}

/**
 * Gets storage usage information
 */
export async function getStorageInfo() {
  try {
    const result = await chrome.storage.sync.get(null);
    const totalSize = JSON.stringify(result).length;
    const state = result[STATE_KEY];
    const stateSize = state ? JSON.stringify(state).length : 0;
    
    // Detailed breakdown
    const breakdown = {
      originalPrompt: state?.originalPrompt?.length || 0,
      optionA: state?.optionA?.length || 0,
      optionB: state?.optionB?.length || 0,
      conversations: 0,
      conversationsSize: 0,
      library: 0,
      librarySize: 0,
      settings: JSON.stringify(state?.settings || {}).length,
      other: 0
    };
    
    if (state?.conversations && Array.isArray(state.conversations)) {
      breakdown.conversations = state.conversations.length;
      breakdown.conversationsSize = JSON.stringify(state.conversations).length;
    }
    
    if (state?.library && Array.isArray(state.library)) {
      breakdown.library = state.library.length;
      breakdown.librarySize = JSON.stringify(state.library).length;
    }
    
    // Calculate other fields size
    const otherFields = { ...state };
    delete otherFields.originalPrompt;
    delete otherFields.optionA;
    delete otherFields.optionB;
    delete otherFields.conversations;
    delete otherFields.library;
    delete otherFields.settings;
    breakdown.other = JSON.stringify(otherFields).length;
    
    return {
      totalSize,
      stateSize,
      stateKeys: Object.keys(result),
      conversations: breakdown.conversations,
      libraryFolders: breakdown.library,
      breakdown
    };
  } catch (error) {
    console.error("[Prompanion Cleanup] Error getting storage info:", error);
    return null;
  }
}


/**
 * Background Service Worker
 * Handles extension state management, API calls, and message routing
 */

const STATE_KEY = "prompanion-sidepanel-state";
const storageArea = chrome.storage?.sync;

/**
 * Gets the tab ID from sender or active tab
 * @param {Object} sender - Message sender object
 * @returns {Promise<number|null>} Tab ID or null if unavailable
 */
async function getTabId(sender) {
  if (sender.tab?.id) {
    return sender.tab.id;
  }
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return activeTab?.id;
  } catch (error) {
    console.warn("Prompanion: failed to resolve active tab", error);
    return null;
  }
}

/**
 * Reads application state from storage
 * @returns {Promise<Object>} Application state object
 */
async function readState() {
  if (!storageArea) {
    return {};
  }
  const result = await storageArea.get(STATE_KEY);
  return result?.[STATE_KEY] ?? {};
}

/**
 * Writes application state to storage
 * @param {Object} nextState - State object to save
 */
async function writeState(nextState) {
  if (!storageArea) {
    return;
  }
  await storageArea.set({ [STATE_KEY]: nextState });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) {
    return;
  }

  await togglePanel(tab.id);
});

/**
 * Sends a message to a tab, with fallback injection if needed
 * @param {number} tabId - Target tab ID
 * @param {string} messageType - Message type to send
 * @returns {Promise<boolean>} Success status
 */
async function sendMessageToTab(tabId, messageType) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: messageType });
    return true;
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["scripts/injector.js"]
      });
      await chrome.tabs.sendMessage(tabId, { type: messageType });
      return true;
    } catch (injectError) {
      console.error(`Prompanion: unable to ${messageType.toLowerCase()} panel`, injectError);
      return false;
    }
  }
}

/**
 * Toggles the side panel visibility
 * @param {number} tabId - Target tab ID
 */
async function togglePanel(tabId) {
  await sendMessageToTab(tabId, "PROMPANION_TOGGLE_PANEL");
}

/**
 * Opens the side panel
 * @param {number} tabId - Target tab ID
 */
async function openPanel(tabId) {
  await sendMessageToTab(tabId, "PROMPANION_OPEN_PANEL");
}

/**
 * Generates two enhanced versions of a prompt using OpenAI API
 * @param {string} apiKey - OpenAI API key
 * @param {string} promptText - Original prompt text
 * @returns {Promise<Object>} Object with optionA and optionB enhanced prompts
 */
async function generateEnhancements(apiKey, promptText) {
  const fallbackA = `${promptText}\n\nRefined focus: clarify intent and add a persuasive closing.`;
  const fallbackB = `${promptText}\n\nRefined focus: provide more context and outline clear next steps.`;

  if (!apiKey) {
    return { optionA: fallbackA, optionB: fallbackB, error: "NO_API_KEY" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content:
              "You are an expert at refining and enhancing prompts for AI language models. Your task is to take a user's original prompt and create two distinct, improved versions that are more effective, clear, and likely to produce better results.\n\n" +
              "Option A should focus on: clarity, specificity, and structure. Make it more precise and easier for the AI to understand exactly what is needed.\n\n" +
              "Option B should focus on: adding context, examples, or constraints that guide the AI toward the desired output style and quality.\n\n" +
              "Both versions should be complete, standalone prompts that improve upon the original. Do not add explanations or meta-commentary - just provide the enhanced prompts.\n\n" +
              "Reply ONLY with valid JSON in this exact format: {\"optionA\":\"enhanced prompt A here\",\"optionB\":\"enhanced prompt B here\"}"
          },
          {
            role: "user",
            content: `Enhance this prompt:\n\n${promptText}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }
      
      // Check for quota/billing errors
      if (errorData.error?.code === "insufficient_quota" || 
          errorData.error?.type === "insufficient_quota" ||
          errorText.includes("quota") ||
          errorText.includes("billing")) {
        throw new Error("API_QUOTA_EXCEEDED");
      }
      
      throw new Error(errorText);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { optionA: fallbackA, optionB: fallbackB, error: "EMPTY_RESPONSE" };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return { optionA: fallbackA, optionB: fallbackB, error: "PARSE_ERROR" };
    }

    const optionA = typeof parsed.optionA === "string" ? parsed.optionA.trim() : fallbackA;
    const optionB = typeof parsed.optionB === "string" ? parsed.optionB.trim() : fallbackB;
    return { optionA, optionB };
  } catch (error) {
    console.error("Prompanion: enhancement generation failed", error);
    const errorMessage = error.message || String(error);
    if (errorMessage === "API_QUOTA_EXCEEDED") {
      return { optionA: promptText, optionB: promptText, error: "API_QUOTA_EXCEEDED" };
    }
    return { optionA: promptText, optionB: promptText, error: "API_ERROR" };
  }
}

/**
 * Regenerates a single enhanced prompt option by re-wording it for better clarity
 * @param {string} apiKey - OpenAI API key
 * @param {string} currentPrompt - The current enhanced prompt to regenerate
 * @returns {Promise<string>} Regenerated prompt text
 */
async function regenerateEnhancement(apiKey, currentPrompt) {
  const fallback = `${currentPrompt}\n\n(Re-worded for improved clarity and precision.)`;

  if (!apiKey) {
    return fallback;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content:
              "You are an expert at re-wording and refining prompts for AI language models. Your task is to take an existing enhanced prompt and re-word it to be more clear, precise, and effective while maintaining the same intent and meaning.\n\n" +
              "Improve the prompt by:\n" +
              "- Using clearer, more direct language\n" +
              "- Improving sentence structure and flow\n" +
              "- Enhancing specificity where needed\n" +
              "- Making it more concise without losing important details\n" +
              "- Ensuring it's easy for an AI to understand and execute\n\n" +
              "Do not add explanations or meta-commentary - just provide the re-worded prompt. Return ONLY the improved prompt text, nothing else."
          },
          {
            role: "user",
            content: `Re-word this prompt to be more clear and effective:\n\n${currentPrompt}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return fallback;
    }

    return content;
  } catch (error) {
    console.error("Prompanion: regeneration failed", error);
    return fallback;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Prompanion Background] ========== MESSAGE RECEIVED ==========");
  console.log("[Prompanion Background] Message type:", message?.type);
  console.log("[Prompanion Background] Message:", message);
  console.log("[Prompanion Background] Sender:", sender);
  
  if (!message || typeof message !== "object") {
    console.log("[Prompanion Background] Invalid message, ignoring");
    return;
  }

  if (message.type === "PROMPANION_SIDECHAT_REQUEST") {
    (async () => {
      try {
        const snippet =
          typeof message.text === "string" ? message.text.trim() : "";
        if (!snippet) {
          sendResponse?.({ ok: false, reason: "EMPTY_TEXT" });
          return;
        }

        const currentState = await readState();
        const nextState = {
          ...currentState,
          pendingSideChat: {
            text: snippet,
            timestamp: Date.now()
          }
        };
        await writeState(nextState);
        chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        chrome.runtime.sendMessage({
          type: "PROMPANION_SIDECHAT_DELIVER",
          text: snippet,
          clearPending: true
        });

        const tabId = await getTabId(sender);
        if (tabId) {
          await openPanel(tabId);
        }
        sendResponse?.({ ok: true });
      } catch (error) {
        console.error("Prompanion: failed to process sidechat request", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_REQUEST_STATE") {
    (async () => {
      try {
        const state = await readState();
        sendResponse?.({ ok: true, state });
      } catch (error) {
        console.error("Prompanion: failed to read state for panel request", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_PREPARE_ENHANCEMENT") {
    (async () => {
      try {
        const promptText =
          typeof message.prompt === "string" ? message.prompt : "";
        console.log("[Prompanion Background] PROMPANION_PREPARE_ENHANCEMENT received, prompt:", promptText);
        const currentState = await readState();
        const apiKey = currentState.settings?.apiKey;
        const result = await generateEnhancements(apiKey, promptText);
        const { optionA, optionB, error } = result;
        console.log("[Prompanion Background] Enhancement result - optionA:", optionA, "optionB:", optionB, "error:", error);
        const nextState = {
          ...currentState,
          originalPrompt: promptText,
          optionA,
          optionB
        };
        console.log("[Prompanion Background] Next state prepared:", { 
          originalPrompt: nextState.originalPrompt?.substring(0, 50), 
          optionA: nextState.optionA?.substring(0, 50), 
          optionB: nextState.optionB?.substring(0, 50) 
        });
        await writeState(nextState);
        console.log("[Prompanion Background] ========== STATE SAVED TO STORAGE ==========");
        console.log("[Prompanion Background] Verifying state was saved...");
        const verifyState = await readState();
        console.log("[Prompanion Background] Verified saved state:", {
          hasOriginalPrompt: !!verifyState.originalPrompt,
          hasOptionA: !!verifyState.optionA,
          hasOptionB: !!verifyState.optionB,
          originalPrompt: verifyState.originalPrompt?.substring(0, 50),
          optionA: verifyState.optionA?.substring(0, 50),
          optionB: verifyState.optionB?.substring(0, 50)
        });
        console.log("[Prompanion Background] State saved, sending PROMPANION_STATE_PUSH message");
        
        // Send message to any listeners (including sidepanel if it's loaded)
        chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState }, (response) => {
          if (chrome.runtime.lastError) {
            // This is normal if sidepanel isn't loaded yet - state is saved to storage
            console.log("[Prompanion Background] STATE_PUSH message sent (sidepanel may not be loaded yet):", chrome.runtime.lastError.message);
          } else {
            console.log("[Prompanion Background] STATE_PUSH message sent successfully");
          }
        });
        
        if (message.openPanel !== false && !error) {
          const tabId = await getTabId(sender);
          if (tabId) {
            await openPanel(tabId);
          } else {
            console.warn("Prompanion: could not toggle panel, no tabId resolved");
          }
        }
        sendResponse?.({ ok: !error, optionA, optionB, error });
      } catch (error) {
        console.error("Prompanion: failed to prepare enhancement", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN", error: "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_REGENERATE_ENHANCEMENT") {
    (async () => {
      try {
        const currentPrompt = typeof message.prompt === "string" ? message.prompt.trim() : "";
        if (!currentPrompt) {
          if (sendResponse) {
            sendResponse({ ok: false, reason: "EMPTY_PROMPT" });
          }
          return;
        }

        const currentState = await readState();
        const apiKey = currentState.settings?.apiKey;
        const regenerated = await regenerateEnhancement(apiKey, currentPrompt);
        
        const optionKey = message.option === "a" ? "optionA" : message.option === "b" ? "optionB" : null;
        if (optionKey) {
          const nextState = {
            ...currentState,
            [optionKey]: regenerated
          };
          await writeState(nextState);
          chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        }
        
        if (sendResponse) {
          sendResponse({ ok: true, regenerated });
        }
      } catch (error) {
        console.error("Prompanion: failed to regenerate enhancement", error);
        if (sendResponse) {
          sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
        }
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_TOGGLE_PANEL") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse?.({ ok: false, reason: "NO_TAB" });
      return;
    }

    togglePanel(tabId)
      .then(() => sendResponse?.({ ok: true }))
      .catch((error) => {
        console.error("Prompanion: toggle from message failed", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      });

    return true;
  }

  if (message.type === "PROMPANION_OPEN_PANEL") {
    (async () => {
      try {
        const tabId = await getTabId(sender);
        if (!tabId) {
          sendResponse?.({ ok: false, reason: "NO_TAB" });
          return;
        }
        await openPanel(tabId);
        sendResponse?.({ ok: true });
      } catch (error) {
        console.error("Prompanion: open panel message failed", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_INSERT_TEXT") {
    console.log("[Prompanion Background] ========== PROMPANION_INSERT_TEXT RECEIVED ==========");
    console.log("[Prompanion Background] Text to insert:", typeof message.text === "string" ? message.text.substring(0, 50) + "..." : "invalid");
    console.log("[Prompanion Background] Sender:", sender);
    (async () => {
      try {
        const textToInsert = typeof message.text === "string" ? message.text.trim() : "";
        if (!textToInsert) {
          console.log("[Prompanion Background] Empty text, returning error");
          sendResponse?.({ ok: false, reason: "EMPTY_TEXT" });
          return;
        }

        // Try to get tab from sender first (if message came from a tab)
        let targetTabId = sender?.tab?.id;
        console.log("[Prompanion Background] Sender tab ID:", targetTabId);
        
        // If no tab from sender, find ChatGPT tab
        if (!targetTabId) {
          try {
            console.log("[Prompanion Background] No sender tab, searching for ChatGPT tab...");
            // First try to find active ChatGPT tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log("[Prompanion Background] Active tab:", activeTab?.url);
            if (activeTab && activeTab.url && (
              activeTab.url.includes("chatgpt.com") || 
              activeTab.url.includes("chat.openai.com")
            )) {
              targetTabId = activeTab.id;
              console.log("[Prompanion Background] Using active ChatGPT tab:", targetTabId);
            } else {
              // Fallback: find any ChatGPT tab
              console.log("[Prompanion Background] Active tab is not ChatGPT, searching all tabs...");
              const tabs = await chrome.tabs.query({
                url: [
                  "https://chatgpt.com/*",
                  "https://*.chatgpt.com/*",
                  "https://chat.openai.com/*",
                  "https://*.chat.openai.com/*"
                ]
              });
              console.log("[Prompanion Background] Found ChatGPT tabs:", tabs.length);
              if (tabs.length > 0) {
                // Prefer active tab, otherwise use first one
                targetTabId = tabs.find(tab => tab.active)?.id || tabs[0].id;
                console.log("[Prompanion Background] Selected tab ID:", targetTabId);
              }
            }
          } catch (queryError) {
            console.error("[Prompanion Background] Failed to query tabs:", queryError);
          }
        }

        if (!targetTabId) {
          console.log("[Prompanion Background] No ChatGPT tab found, returning error");
          sendResponse?.({ ok: false, reason: "NO_CHATGPT_TAB" });
          return;
        }

        // Send message to adapter.js content script
        console.log("[Prompanion Background] Sending message to tab:", targetTabId);
        console.log("[Prompanion Background] Message payload:", { type: "PROMPANION_INSERT_TEXT", text: textToInsert.substring(0, 50) + "..." });
        
        // Check if content script is loaded by trying to query the tab
        try {
          const tab = await chrome.tabs.get(targetTabId);
          console.log("[Prompanion Background] Tab info:", { id: tab.id, url: tab.url, status: tab.status });
        } catch (tabError) {
          console.error("[Prompanion Background] Failed to get tab info:", tabError);
        }
        
        try {
          // Use a timeout to detect if adapter doesn't respond
          const responsePromise = chrome.tabs.sendMessage(targetTabId, {
            type: "PROMPANION_INSERT_TEXT",
            text: textToInsert
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("TIMEOUT: Adapter did not respond within 5 seconds")), 5000);
          });
          
          const response = await Promise.race([responsePromise, timeoutPromise]);
          console.log("[Prompanion Background] Received response from adapter:", response);
          console.log("[Prompanion Background] Response type:", typeof response);
          console.log("[Prompanion Background] Response is null/undefined:", response === null || response === undefined);
          
          if (!response) {
            console.error("[Prompanion Background] Adapter returned null/undefined response!");
            sendResponse?.({ ok: false, reason: "NO_RESPONSE_FROM_ADAPTER" });
            return;
          }
          
          sendResponse?.(response);
        } catch (error) {
          console.error("[Prompanion Background] Failed to send insert message to tab:", error);
          console.error("[Prompanion Background] Error name:", error.name);
          console.error("[Prompanion Background] Error message:", error.message);
          console.error("[Prompanion Background] Error stack:", error.stack);
          
          // Check if error is because content script isn't ready
          if (error.message?.includes("Could not establish connection") || 
              error.message?.includes("Receiving end does not exist") ||
              error.message?.includes("Extension context invalidated") ||
              error.message?.includes("TIMEOUT")) {
            console.log("[Prompanion Background] Adapter not ready - content script may not be loaded or not responding");
            console.log("[Prompanion Background] This usually means:");
            console.log("[Prompanion Background] 1. The content script hasn't loaded yet");
            console.log("[Prompanion Background] 2. The content script's message listener isn't registered");
            console.log("[Prompanion Background] 3. The content script is in a different frame/context");
            sendResponse?.({ ok: false, reason: "ADAPTER_NOT_READY" });
          } else {
            console.log("[Prompanion Background] Send failed with unexpected error:", error.message);
            sendResponse?.({ ok: false, reason: error?.message ?? "SEND_FAILED" });
          }
        }
      } catch (error) {
        console.error("[Prompanion Background] Insert text message failed:", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }
});


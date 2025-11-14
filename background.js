/**
 * Background Service Worker
 * Handles extension state management, API calls, and message routing
 */

const STATE_KEY = "prompanion-sidepanel-state";
const storageArea = chrome.storage?.sync ?? chrome.storage?.local;

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
    return { optionA: fallbackA, optionB: fallbackB };
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
              "You enhance prompts for LLM users. Produce two improved versions. Reply ONLY with JSON: {\"optionA\":\"...\",\"optionB\":\"...\"}."
          },
          {
            role: "user",
            content: `Original prompt:\n${promptText}`
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
      return { optionA: fallbackA, optionB: fallbackB };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return { optionA: fallbackA, optionB: fallbackB };
    }

    const optionA = typeof parsed.optionA === "string" ? parsed.optionA.trim() : fallbackA;
    const optionB = typeof parsed.optionB === "string" ? parsed.optionB.trim() : fallbackB;
    return { optionA, optionB };
  } catch (error) {
    console.error("Prompanion: enhancement generation failed", error);
    return { optionA: fallbackA, optionB: fallbackB };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
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
        const currentState = await readState();
        const apiKey = currentState.settings?.apiKey;
        const { optionA, optionB } = await generateEnhancements(apiKey, promptText);
        const nextState = {
          ...currentState,
          originalPrompt: promptText,
          optionA,
          optionB
        };
        await writeState(nextState);
        chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        if (message.openPanel !== false) {
          const tabId = await getTabId(sender);
          if (tabId) {
            await openPanel(tabId);
          } else {
            console.warn("Prompanion: could not toggle panel, no tabId resolved");
          }
        }
        sendResponse?.({ ok: true, optionA, optionB });
      } catch (error) {
        console.error("Prompanion: failed to prepare enhancement", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
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
});


const STATE_KEY = "prompanion-sidepanel-state";

const storageArea = chrome.storage?.sync ?? chrome.storage?.local;

async function readState() {
  if (!storageArea) {
    return {};
  }
  const result = await storageArea.get(STATE_KEY);
  return result?.[STATE_KEY] ?? {};
}

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

async function togglePanel(tabId) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: "PROMPANION_TOGGLE_PANEL" });
  } catch (error) {
    console.warn(
      `Prompanion: tabs.sendMessage failed for tab ${tabId}, attempting to inject content script`,
      error
    );
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["scripts/injector.js"]
      });
      await chrome.tabs.sendMessage(tabId, { type: "PROMPANION_TOGGLE_PANEL" });
    } catch (injectError) {
      console.error("Prompanion: unable to toggle sidebar panel", injectError);
    }
  }
}

async function openPanel(tabId) {
  if (!tabId) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: "PROMPANION_OPEN_PANEL" });
  } catch (error) {
    console.warn(
      `Prompanion: tabs.sendMessage failed for open request in tab ${tabId}, attempting to inject content script`,
      error
    );
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["scripts/injector.js"]
      });
      await chrome.tabs.sendMessage(tabId, { type: "PROMPANION_OPEN_PANEL" });
    } catch (injectError) {
      console.error("Prompanion: unable to open sidebar panel", injectError);
    }
  }
}

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

        let tabId = sender.tab?.id;
        if (!tabId) {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
          });
          tabId = activeTab?.id;
        }
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
        console.info("Prompanion: panel requested state", state);
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
        console.info("Prompanion: enhancement request received", {
          hasSenderTab: Boolean(sender.tab?.id),
          promptLength: typeof message.prompt === "string" ? message.prompt.length : null
        });
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
        console.info("Prompanion: enhancement seeded", { promptLength: promptText.length });
        chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        if (message.openPanel !== false) {
          let tabId = sender.tab?.id;
          if (!tabId) {
            try {
              const [activeTab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
              });
              tabId = activeTab?.id;
            } catch (queryError) {
              console.warn("Prompanion: failed to resolve active tab for toggle", queryError);
            }
          }
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
        let tabId = sender.tab?.id;
        if (!tabId) {
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
          });
          tabId = activeTab?.id;
        }
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


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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
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
});


const defaultState = {
  plan: "Freemium",
  enhancementsUsed: 3,
  enhancementsLimit: 10,
  activePlatform: "ChatGPT",
  originalPrompt:
    "Draft a customer support response thanking them for their feedback and promising a follow-up within 24 hours.",
  optionA:
    "Thank the customer for their detailed feedback, acknowledge their concern, confirm a follow-up within 24 hours, and add a reassuring closing line.",
  optionB:
    "Open with gratitude, mirror their key point, outline the next step within 24 hours, and end with an invitation to reach out again.",
  library: [
    "Summarize the latest sprint retro takeaways for the leadership team.",
    "Craft a persuasive LinkedIn message pitching our Prompt Enhancer to agency owners.",
    "Rewrite this technical update for non-technical stakeholders with bullet points."
  ],
  settings: {
    tone: "neutral",
    style: "concise",
    complexity: 3
  },
  chatHistory: [
    {
      role: "user",
      content: "Can you make the tone more upbeat without adding fluff?",
      timestamp: Date.now() - 1000 * 60 * 5
    },
    {
      role: "agent",
      content:
        "Absolutely. Try adding an opening hook that celebrates their progress and a closing CTA that nudges a quick reply.",
      timestamp: Date.now() - 1000 * 60 * 4
    }
  ]
};

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

const stateKey = "prompanion-sidepanel-state";

async function loadState() {
  const stored = await storage.get(stateKey);
  if (!stored) {
    await storage.set(stateKey, defaultState);
    return structuredClone(defaultState);
  }
  return {
    ...structuredClone(defaultState),
    ...stored,
    settings: { ...defaultState.settings, ...stored.settings },
    chatHistory: stored.chatHistory ?? structuredClone(defaultState.chatHistory),
    library: stored.library ?? structuredClone(defaultState.library)
  };
}

async function saveState(nextState) {
  await storage.set(stateKey, nextState);
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric"
  }).format(timestamp);
}

function renderStatus({ plan, enhancementsUsed, enhancementsLimit, activePlatform }) {
  document.getElementById("user-plan").textContent = plan;
  document.getElementById("enhancements-count").textContent = enhancementsUsed;
  document.getElementById("enhancements-limit").textContent = enhancementsLimit;
  document.getElementById("active-platform").textContent = activePlatform;
}

function renderPrompts({ originalPrompt, optionA, optionB }) {
  document.getElementById("original-prompt").value = originalPrompt;
  document.getElementById("option-a").value = optionA;
  document.getElementById("option-b").value = optionB;
}

function renderSettings(settings) {
  document.getElementById("setting-tone").value = settings.tone;
  document.getElementById("setting-style").value = settings.style;
  document.getElementById("setting-complexity").value = settings.complexity;
  updateRangeOutputs();
}

function renderLibrary(library) {
  const container = document.getElementById("prompt-library");
  const template = document.getElementById("library-item-template");
  container.innerHTML = "";

  library.forEach((prompt, index) => {
    const clone = template.content.cloneNode(true);
    const itemRoot = clone.querySelector(".prompt-library__item");
    itemRoot.dataset.index = String(index);
    clone.querySelector(".prompt-library__text").textContent = prompt;
    container.appendChild(clone);
  });
}

function renderChat(history) {
  const chatWindow = document.getElementById("chat-window");
  chatWindow.innerHTML = "";

  history.forEach((entry) => {
    const wrapper = document.createElement("div");
    wrapper.className = `chat-message chat-message--${entry.role}`;

    const meta = document.createElement("div");
    meta.className = "chat-message__meta";
    const author = entry.role === "agent" ? "Prompanion" : "You";
    meta.textContent = `${author} • ${formatTimestamp(entry.timestamp)}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-message__bubble";
    bubble.textContent = entry.content;

    wrapper.append(meta, bubble);
    chatWindow.append(wrapper);
  });

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function updateRangeOutputs() {
  document
    .querySelectorAll("input[type='range']")
    .forEach((input) => {
      const output = document.querySelector(`.range-output[data-for='${input.id}']`);
      if (output) {
        output.textContent = input.value;
      }
    });
}

async function handleEnhance(state) {
  const { enhancementsUsed, enhancementsLimit } = state;
  if (enhancementsUsed >= enhancementsLimit) {
    alert("You have reached your enhancement limit for today. Upgrade to continue.");
    return state;
  }

  const textarea = document.getElementById("original-prompt");
  const basePrompt = textarea.value.trim();
  const fallbackA = defaultState.optionA;
  const fallbackB = defaultState.optionB;

  const spin = (text) =>
    `${text} (Tone: ${state.settings.tone}, Style: ${state.settings.style}, Complexity: ${state.settings.complexity})`;

  state.enhancementsUsed = enhancementsUsed + 1;
  state.optionA = basePrompt
    ? spin(`${basePrompt} — Version A focuses on clarity and persuasive voice.`)
    : spin(fallbackA);
  state.optionB = basePrompt
    ? spin(`${basePrompt} — Version B adds context and a stronger CTA.`)
    : spin(fallbackB);

  renderStatus(state);
  renderPrompts(state);
  await saveState(state);
  return state;
}

function registerCopyHandlers() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.copy;
      const field = document.getElementById(targetId);
      if (!field) {
        return;
      }
      try {
        await navigator.clipboard.writeText(field.value);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 1200);
      } catch (error) {
        console.error("Clipboard copy failed", error);
      }
    });
  });
}

function registerReplaceHandlers() {
  document.querySelectorAll("[data-replace]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.replace;
      const replacement = document.getElementById(targetId)?.value;
      if (!replacement) {
        return;
      }
      const originalField = document.getElementById("original-prompt");
      originalField.value = replacement;
    });
  });
}

function registerLibraryHandlers(stateRef) {
  const container = document.getElementById("prompt-library");

  container.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const item = target.closest(".prompt-library__item");
    if (!item) {
      return;
    }
    const index = Number(item.dataset.index);
    if (Number.isNaN(index)) {
      return;
    }

    if (target.classList.contains("prompt-library__use")) {
      document.getElementById("original-prompt").value = stateRef.library[index];
      return;
    }

    if (target.classList.contains("prompt-library__copy")) {
      try {
        await navigator.clipboard.writeText(stateRef.library[index]);
      } catch (error) {
        console.error("Could not copy prompt", error);
      }
      return;
    }

    if (target.classList.contains("prompt-library__delete")) {
      stateRef.library.splice(index, 1);
      renderLibrary(stateRef.library);
      await saveState(stateRef);
    }
  });

  document.getElementById("add-prompt").addEventListener("click", async () => {
    const prompt = document.getElementById("original-prompt").value.trim();
    if (!prompt) {
      alert("Write a prompt before saving it to the library.");
      return;
    }

    stateRef.library = [prompt, ...stateRef.library].slice(0, 20);
    renderLibrary(stateRef.library);
    await saveState(stateRef);
  });
}

function registerSettingsHandlers(stateRef) {
  const settingsDialog = document.getElementById("settings-dialog");
  const settingsTrigger = document.getElementById("open-settings");

  settingsTrigger.addEventListener("click", () => {
    settingsDialog.showModal();
  });

  settingsDialog.addEventListener("close", async () => {
    if (settingsDialog.returnValue !== "confirm") {
      renderSettings(stateRef.settings);
      return;
    }
    stateRef.settings = {
      tone: document.getElementById("setting-tone").value,
      style: document.getElementById("setting-style").value,
      complexity: Number(document.getElementById("setting-complexity").value)
    };
    renderSettings(stateRef.settings);
    await saveState(stateRef);
  });

  document
    .getElementById("setting-complexity")
    .addEventListener("input", updateRangeOutputs);
}

function registerChatHandlers(stateRef) {
  const form = document.getElementById("chat-form");
  const textarea = document.getElementById("chat-message");
  const adapterSelect = document.getElementById("adapter-select");

  adapterSelect.value = stateRef.activePlatform.toLowerCase();

  adapterSelect.addEventListener("change", async () => {
    stateRef.activePlatform = adapterSelect.selectedOptions[0].textContent ?? "ChatGPT";
    renderStatus(stateRef);
    await saveState(stateRef);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (!message) {
      return;
    }

    const now = Date.now();
    stateRef.chatHistory.push({
      role: "user",
      content: message,
      timestamp: now
    });
    renderChat(stateRef.chatHistory);

    textarea.value = "";

    setTimeout(async () => {
      stateRef.chatHistory.push({
        role: "agent",
        content:
          "Thanks! I recommend expanding your CTA with a sharper benefit. Click Enhance to preview.",
        timestamp: Date.now()
      });
      renderChat(stateRef.chatHistory);
      await saveState(stateRef);
    }, 600);

    await saveState(stateRef);
  });
}

async function init() {
  let state = await loadState();

  renderStatus(state);
  renderPrompts(state);
  renderSettings(state.settings);
  renderLibrary(state.library);
  renderChat(state.chatHistory);

  registerCopyHandlers();
  registerReplaceHandlers();
  registerLibraryHandlers(state);
  registerSettingsHandlers(state);
  registerChatHandlers(state);

  document.getElementById("enhance-btn").addEventListener("click", async () => {
    await handleEnhance(state);
  });
}

document.addEventListener("DOMContentLoaded", init);


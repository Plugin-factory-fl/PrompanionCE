const PANEL_STATE_KEY = "prompanion-sidepanel-state";
const LIBRARY_SCHEMA_VERSION = 2;

function createDefaultLibrary() {
  return [
    {
      name: "Video Generation",
      prompts: [
        "Write a cinematic text prompt for a 45-second AI-generated montage introducing a futuristic smart city at sunrise.",
        "Create a concise storyboard brief for a product demo video showcasing a wearable fitness tracker in three scenes.",
        "Draft a Midjourney prompt that produces a looping background animation of neon cyberpunk streets in the rain."
      ]
    },
    {
      name: "Sales Copy",
      prompts: [
        "Compose a high-converting landing page hero section for a SaaS analytics dashboard targeting marketing directors.",
        "Script a 6-step email drip campaign persuading remote teams to trial our workflow automation suite.",
        "Write a punchy 45-second elevator pitch for a B2B AI assistant that eliminates customer support backlog."
      ]
    },
    {
      name: "Blog Writing",
      prompts: [
        "Outline a 1,500-word blog post comparing three popular vector databases with pros, cons, and use cases.",
        "Draft an editorial introduction explaining why transparent AI governance matters for enterprise leaders.",
        "Generate a narrative-style case study describing how a fintech startup reduced churn using personalized onboarding."
      ]
    }
  ];
}

function normalizeLibrary(rawLibrary) {
  if (!Array.isArray(rawLibrary)) {
    return createDefaultLibrary();
  }

  if (!rawLibrary.length) {
    return [];
  }

  const isStructured = rawLibrary.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      Array.isArray(entry.prompts)
  );

  if (!isStructured) {
    return createDefaultLibrary();
  }

  const normalized = rawLibrary
    .map((folder, index) => {
      const name =
        typeof folder.name === "string" && folder.name.trim().length > 0
          ? folder.name.trim()
          : `Folder ${index + 1}`;
      const prompts = folder.prompts
        .filter((prompt) => typeof prompt === "string")
        .map((prompt) => prompt.trim())
        .filter((prompt) => prompt.length > 0);
      return {
        name,
        prompts
      };
    })
    .filter((folder) => folder.name.length > 0);

  const withoutImported = normalized.filter(
    (folder) => folder.name.toLowerCase() !== "imported prompts".toLowerCase()
  );

  return withoutImported.length ? withoutImported : createDefaultLibrary();
}

const defaultState = {
  plan: "Freemium",
  enhancementsUsed: 3,
  enhancementsLimit: 10,
  activePlatform: "ChatGPT",
  sideChatModel: "chatgpt",
  originalPrompt:
    "Draft a customer support response thanking them for their feedback and promising a follow-up within 24 hours.",
  optionA:
    "Thank the customer for their detailed feedback, acknowledge their concern, confirm a follow-up within 24 hours, and add a reassuring closing line.",
  optionB:
    "Open with gratitude, mirror their key point, outline the next step within 24 hours, and end with an invitation to reach out again.",
  library: createDefaultLibrary(),
  libraryVersion: LIBRARY_SCHEMA_VERSION,
  settings: {
    model: "chatgpt",
    output: "text",
    contentType: "research",
    detailLevel: 3
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
let currentState = null;

async function loadState() {
  const stored = await storage.get(stateKey);
  if (!stored) {
    const initialState = structuredClone(defaultState);
    await storage.set(stateKey, initialState);
    return initialState;
  }
  const storedLibraryVersion = Number.isFinite(stored.libraryVersion)
    ? stored.libraryVersion
    : 0;
  const normalizedLibrary = normalizeLibrary(stored.library ?? []);
  const mergedState = {
    ...structuredClone(defaultState),
    ...stored,
    settings: { ...defaultState.settings, ...stored.settings },
    chatHistory: stored.chatHistory ?? structuredClone(defaultState.chatHistory),
    library: normalizedLibrary,
    libraryVersion: storedLibraryVersion
  };

  if (storedLibraryVersion !== LIBRARY_SCHEMA_VERSION) {
    mergedState.library = createDefaultLibrary();
    mergedState.libraryVersion = LIBRARY_SCHEMA_VERSION;
  }
  storage.set(stateKey, mergedState).catch((error) => {
    console.warn("Prompanion: failed to persist normalized library", error);
  });
  return mergedState;
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
  document.getElementById("original-prompt").value = originalPrompt ?? "";
  document.getElementById("option-a").value = optionA ?? "";
  document.getElementById("option-b").value = optionB ?? "";
}

const contentTypeOptions = {
  text: [
    { value: "research", label: "Research" },
    { value: "instructions", label: "Instructions" },
    { value: "storytelling", label: "Storytelling" }
  ],
  image: [
    { value: "realistic", label: "Realistic" },
    { value: "anime", label: "Anime" },
    { value: "three_d", label: "3D" }
  ],
  video: [
    { value: "realistic", label: "Realistic" },
    { value: "anime", label: "Anime" },
    { value: "three_d", label: "3D" }
  ]
};

const detailLevelLabels = {
  1: "Low",
  2: "Some",
  3: "Medium",
  4: "High",
  5: "Very High"
};

function renderTabs(container, items, currentValue) {
  container.innerHTML = "";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "form-tab";
    button.dataset.value = item.value;
    button.textContent = item.label;
    if (item.value === currentValue) {
      button.classList.add("is-active");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }
    container.append(button);
  });
}

function renderSettings(settings) {
  const outputTabs = document.querySelectorAll(".form-tab[data-setting='output']");
  outputTabs.forEach((tab) => {
    const value = tab.dataset.value;
    const isActive = value === settings.output;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });

  const contentTabsContainer = document.getElementById("content-type-tabs");
  const contentOptions = contentTypeOptions[settings.output] ?? contentTypeOptions.text;
  if (!contentOptions.some((option) => option.value === settings.contentType)) {
    settings.contentType = contentOptions[0]?.value ?? "research";
  }
  renderTabs(contentTabsContainer, contentOptions, settings.contentType);

  document.getElementById("setting-complexity").value = settings.detailLevel;
  updateRangeOutputs();
}

function renderLibrary(library, options = {}) {
  const container = document.getElementById("prompt-library");
  const folderTemplate = document.getElementById("library-folder-template");
  const promptTemplate = document.getElementById("library-prompt-template");
  const previouslyOpen = new Set(
    Array.from(container.querySelectorAll(".prompt-library__folder details[open]")).map(
      (detailsEl) => {
        const title =
          detailsEl
            .closest(".prompt-library__folder")
            ?.querySelector(".prompt-library__title")
            ?.textContent ?? "";
        return title.trim();
      }
    )
  );

  let forceOpenNames = options.forceOpen ?? null;
  if (forceOpenNames instanceof Set) {
    forceOpenNames = new Set(Array.from(forceOpenNames).map((name) => name.trim()));
  } else if (Array.isArray(forceOpenNames)) {
    forceOpenNames = new Set(forceOpenNames.map((name) => (name ?? "").trim()));
  } else if (typeof forceOpenNames === "string" && forceOpenNames.trim().length > 0) {
    forceOpenNames = new Set([forceOpenNames.trim()]);
  } else {
    forceOpenNames = new Set();
  }

  container.innerHTML = "";

  if (!library.length) {
    const empty = document.createElement("li");
    empty.className = "prompt-library__empty";
    empty.textContent = 'No prompt files yet. Use "Create New Prompt File" to add one.';
    container.append(empty);
    return;
  }

  library.forEach((folder, folderIndex) => {
    const fragment = folderTemplate.content.cloneNode(true);
    const folderRoot = fragment.querySelector(".prompt-library__folder");
    const detailsEl = fragment.querySelector("details");
    const summary = fragment.querySelector("summary");
    const titleEl = fragment.querySelector(".prompt-library__title");
    const countEl = fragment.querySelector(".prompt-library__count");
    const promptsList = fragment.querySelector(".prompt-library__prompts");
    const addPromptButton = fragment.querySelector("[data-action='add-prompt']");
    const deleteFolderButton = fragment.querySelector("[data-action='delete-folder']");

    folderRoot.dataset.folderIndex = String(folderIndex);
    summary.dataset.folderIndex = String(folderIndex);
    if (addPromptButton) {
      addPromptButton.dataset.folderIndex = String(folderIndex);
    }
    if (deleteFolderButton) {
      deleteFolderButton.dataset.folderIndex = String(folderIndex);
    }

    titleEl.textContent = folder.name;
    const normalizedName = folder.name.trim();
    const safePrompts = Array.isArray(folder.prompts) ? folder.prompts : [];
    countEl.textContent =
      safePrompts.length === 1 ? "1 prompt" : `${safePrompts.length} prompts`;

    const shouldOpen =
      forceOpenNames.has(normalizedName) || previouslyOpen.has(normalizedName) || folder.__open;
    detailsEl.open = Boolean(shouldOpen);
    if (folder.__open) {
      delete folder.__open;
    }

    if (!safePrompts.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "prompt-library__empty";
      emptyItem.textContent = "No prompts saved yet.";
      promptsList.append(emptyItem);
    } else {
      safePrompts.forEach((prompt, promptIndex) => {
        const promptFragment = promptTemplate.content.cloneNode(true);
        const promptRoot = promptFragment.querySelector(".prompt-library__item");
        const promptText = promptFragment.querySelector(".prompt-library__text");

        promptRoot.dataset.folderIndex = String(folderIndex);
        promptRoot.dataset.promptIndex = String(promptIndex);
        promptText.textContent = prompt;

        promptsList.append(promptFragment);
      });
    }

    container.append(fragment);
  });
}

async function openLibraryDialog(options = {}) {
  const {
    title = "Create Item",
    label = "Name",
    placeholder = "",
    defaultValue = "",
    mode = "text",
    message = "",
    submitLabel,
    cancelLabel
  } = options;

  const dialog = document.getElementById("library-dialog");
  const form = document.getElementById("library-form");
  const titleEl = document.getElementById("library-dialog-title");
  const inputWrapper = document.getElementById("library-input-wrapper");
  const inputLabel = document.getElementById("library-input-label");
  const inputField = document.getElementById("library-input");
  const textareaWrapper = document.getElementById("library-textarea-wrapper");
  const textareaLabel = document.getElementById("library-textarea-label");
  const textareaField = document.getElementById("library-textarea");
  const messageEl = document.getElementById("library-message");
  const submitButton = form.querySelector("button[value='confirm']");
  const headerCancelButton = form.querySelector(".library__cancel--header");
  const footerCancelButton = form.querySelector(".library__cancel--footer");
  const footerEl = form.querySelector(".library-dialog__footer");

  const normalizedMode = ["text", "textarea", "confirm"].includes(mode) ? mode : "text";
  const useTextarea = normalizedMode === "textarea";
  const useText = normalizedMode === "text";
  const isConfirm = normalizedMode === "confirm";
  titleEl.textContent = title;

  inputWrapper.hidden = !useText;
  if (useText) {
    inputLabel.textContent = label;
    inputField.placeholder = placeholder ?? "";
    inputField.value = defaultValue ?? "";
    inputWrapper.classList.remove("is-hidden");
  } else {
    inputField.value = "";
    inputField.placeholder = "";
    inputWrapper.classList.add("is-hidden");
  }

  if (useTextarea) {
    textareaWrapper.hidden = false;
    textareaWrapper.classList.add("is-visible");
    textareaWrapper.classList.remove("is-hidden");
    textareaLabel.textContent = label;
    textareaField.placeholder = placeholder ?? "";
    textareaField.value = defaultValue ?? "";
  } else {
    textareaWrapper.hidden = true;
    textareaWrapper.classList.remove("is-visible");
    textareaField.value = "";
    textareaField.placeholder = "";
    textareaWrapper.classList.add("is-hidden");
  }

  if (isConfirm) {
    messageEl.textContent =
      message ||
      "This will permanently delete the selected prompt file and all prompts inside it.";
    messageEl.classList.add("is-visible");
    footerEl.classList.add("is-confirm");
  } else {
    messageEl.textContent = "";
    messageEl.classList.remove("is-visible");
    footerEl.classList.remove("is-confirm");
  }

  submitButton.textContent =
    submitLabel ?? (isConfirm ? "Delete" : useTextarea ? "Save Prompt" : "Save");
  if (footerCancelButton) {
    footerCancelButton.textContent = cancelLabel ?? (isConfirm ? "Cancel" : "Cancel");
  }
  if (headerCancelButton) {
    headerCancelButton.setAttribute(
      "aria-label",
      cancelLabel ?? (isConfirm ? "Cancel" : "Cancel")
    );
  }

  const cancelHandlers = [headerCancelButton, footerCancelButton].filter(Boolean);
  cancelHandlers.forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      dialog.close("cancel");
    };
  });

  return new Promise((resolve) => {
    function cleanup(result) {
      form.removeEventListener("submit", handleSubmit);
      dialog.removeEventListener("close", handleClose);
      resolve(result);
    }

    function handleSubmit(event) {
      event.preventDefault();
      dialog.close("confirm");
    }

    function handleClose() {
      if (dialog.returnValue !== "confirm") {
        cleanup(null);
        return;
      }
      if (isConfirm) {
        cleanup(true);
        return;
      }
      const value = useTextarea ? textareaField.value.trim() : inputField.value.trim();
      cleanup(value.length ? value : null);
    }

    form.addEventListener("submit", handleSubmit);
    dialog.addEventListener("close", handleClose, { once: true });

    dialog.returnValue = "cancel";
    dialog.showModal();

    requestAnimationFrame(() => {
      if (isConfirm) {
        submitButton.focus();
      } else if (useTextarea) {
        textareaField.focus();
        textareaField.setSelectionRange(textareaField.value.length, textareaField.value.length);
      } else {
        inputField.focus();
        inputField.setSelectionRange(inputField.value.length, inputField.value.length);
      }
    });
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
  document.querySelectorAll("input[type='range']").forEach((input) => {
    const output = document.querySelector(`.range-output[data-for='${input.id}']`);
    if (output) {
      const label = detailLevelLabels[input.value] ?? input.value;
      output.textContent = label;
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
    `${text} (Model: ${state.settings.model}, Output: ${state.settings.output}, Type: ${state.settings.contentType}, Detail: ${detailLevelLabels[state.settings.detailLevel] || state.settings.detailLevel})`;

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
  const addFolderButton = document.getElementById("add-folder");

  if (!container || !addFolderButton) {
    return;
  }

  if (!Number.isFinite(stateRef.libraryVersion)) {
    stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
  }

  container.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const actionable = target instanceof HTMLElement ? target.closest("[data-action]") : null;
    if (actionable) {
      event.stopPropagation();
    }
  });

  container.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionTarget = target.closest("[data-action]");
    const action = actionTarget?.dataset.action;
    if (action === "add-prompt" || action === "delete-folder") {
      event.preventDefault();
      event.stopPropagation();

      const folderElement = actionTarget.closest(".prompt-library__folder");
      if (!folderElement) {
        return;
      }
      const folderIndex = Number(folderElement.dataset.folderIndex);
      if (Number.isNaN(folderIndex)) {
        return;
      }

      const folder = stateRef.library[folderIndex];
      if (!folder) {
        return;
      }

      if (action === "add-prompt") {
        const trimmedPrompt = await openLibraryDialog({
          title: `Create Prompt`,
          label: `Prompt for "${folder.name}"`,
          placeholder: "Describe the prompt you want to reuse…",
          mode: "textarea",
          submitLabel: "Save Prompt"
        });
        if (!trimmedPrompt) {
          return;
        }
        folder.prompts.unshift(trimmedPrompt);
        folder.prompts = folder.prompts.slice(0, 200);
        stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
        renderLibrary(stateRef.library);
        await saveState(stateRef);
        return;
      }

      if (action === "delete-folder") {
        const confirmed = await openLibraryDialog({
          mode: "confirm",
          title: `Delete "${folder.name}"?`,
          message:
            "This will permanently delete the entire prompt file and every prompt saved inside it.",
          submitLabel: "Delete Prompt File",
          cancelLabel: "Keep Prompt File"
        });
        if (!confirmed) {
          return;
        }
        stateRef.library.splice(folderIndex, 1);
        stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
        renderLibrary(stateRef.library);
        await saveState(stateRef);
        return;
      }
    }

    if (!action) {
      return;
    }

    const item = actionTarget.closest(".prompt-library__item");
    if (!item) {
      return;
    }

    const folderIndex = Number(item.dataset.folderIndex);
    const promptIndex = Number(item.dataset.promptIndex);
    if (Number.isNaN(folderIndex) || Number.isNaN(promptIndex)) {
      return;
    }

    const folder = stateRef.library[folderIndex];
    if (!folder) {
      return;
    }

    const prompt = folder.prompts[promptIndex];
    if (!prompt) {
      return;
    }

    if (action === "use") {
      document.getElementById("original-prompt").value = prompt;
      return;
    }

    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(prompt);
      } catch (error) {
        console.error("Could not copy prompt", error);
      }
      return;
    }

    if (action === "delete") {
      const promptPreview = prompt.length > 140 ? `${prompt.slice(0, 140)}…` : prompt;
      const confirmed = await openLibraryDialog({
        mode: "confirm",
        title: "Delete this prompt?",
        message: `This will permanently delete the selected prompt:\n\n“${promptPreview}”`,
        submitLabel: "Delete Prompt",
        cancelLabel: "Keep Prompt"
      });
      if (!confirmed) {
        return;
      }
      folder.prompts.splice(promptIndex, 1);
      stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
      renderLibrary(stateRef.library);
      await saveState(stateRef);
      return;
    }
  });

  addFolderButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const trimmedName = await openLibraryDialog({
      title: "Create Prompt File",
      label: "Prompt file name",
      placeholder: "e.g. Sales Objection Handling",
      mode: "text",
      submitLabel: "Save Prompt File"
    });
    if (!trimmedName) {
      return;
    }

    stateRef.library = Array.isArray(stateRef.library) ? stateRef.library : [];

    const duplicate = stateRef.library.some(
      (folder) => folder.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      alert("A prompt file with that name already exists.");
      return;
    }

    stateRef.library.unshift({
      name: trimmedName,
      prompts: []
    });
    stateRef.libraryVersion = LIBRARY_SCHEMA_VERSION;
    renderLibrary(stateRef.library, { forceOpen: new Set([trimmedName]) });
    await saveState(stateRef);
  });
}

function registerSettingsHandlers(stateRef) {
  const settingsDialog = document.getElementById("settings-dialog");
  const settingsTrigger = document.getElementById("open-settings");
  const outputTabs = document.querySelectorAll(".form-tab[data-setting='output']");
  const contentTabsContainer = document.getElementById("content-type-tabs");
  const detailSlider = document.getElementById("setting-complexity");
  const modelButtons = document.querySelectorAll(".model-pill");

  settingsTrigger.addEventListener("click", () => {
    settingsDialog.showModal();
  });

  settingsDialog.addEventListener("close", async () => {
    if (settingsDialog.returnValue !== "confirm") {
      renderSettings(stateRef.settings);
      return;
    }
    stateRef.settings = {
      model: stateRef.settings.model,
      output: stateRef.settings.output,
      contentType: stateRef.settings.contentType,
      detailLevel: Number(detailSlider.value)
    };
    renderSettings(stateRef.settings);
    await saveState(stateRef);
  });

  detailSlider.addEventListener("input", updateRangeOutputs);

  modelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.model;
      if (!value || !modelOptions.includes(value)) {
        return;
      }
      stateRef.settings.model = value;
      renderSettings(stateRef.settings);
    });
  });

  outputTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const value = tab.dataset.value;
      if (!value) {
        return;
      }
      stateRef.settings.output = value;
      const options = contentTypeOptions[value] ?? contentTypeOptions.text;
      if (!options.some((option) => option.value === stateRef.settings.contentType)) {
        stateRef.settings.contentType = options[0]?.value ?? "research";
      }
      renderSettings(stateRef.settings);
    });
  });

  contentTabsContainer.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const tab = target.closest(".form-tab");
    if (!(tab instanceof HTMLButtonElement)) {
      return;
    }
    const value = tab.dataset.value;
    if (!value) {
      return;
    }
    stateRef.settings.contentType = value;
    renderSettings(stateRef.settings);
  });
}

function registerChatHandlers(stateRef) {
  const form = document.getElementById("chat-form");
  const textarea = document.getElementById("chat-message");
  const adapterSelect = document.getElementById("adapter-select");

  const initialModel =
    (typeof stateRef.sideChatModel === "string" && stateRef.sideChatModel.trim().length
      ? stateRef.sideChatModel
      : stateRef.activePlatform?.toLowerCase()) ?? "chatgpt";
  adapterSelect.value = initialModel;
  if (adapterSelect.value !== initialModel) {
    adapterSelect.value = "chatgpt";
  }

  adapterSelect.addEventListener("change", async () => {
    stateRef.sideChatModel = adapterSelect.value;
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

function registerAccountHandlers() {
  const accountDialog = document.getElementById("account-dialog");
  const accountTrigger = document.getElementById("open-account");
  const accountForm = document.getElementById("account-form");
  if (!accountDialog || !accountTrigger || !accountForm) {
    return;
  }

  const cancelButtons = accountDialog.querySelectorAll(".account__cancel");

  accountTrigger.addEventListener("click", () => {
    accountDialog.showModal();
  });

  cancelButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      accountDialog.close("cancel");
    });
  });

  accountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    // Placeholder: authentication handled elsewhere
  });

  accountDialog.addEventListener("close", () => {
    accountForm.reset();
  });
}

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
}

async function init() {
  currentState = await loadState();

  renderStatus(currentState);
  renderPrompts(currentState);
  renderSettings(currentState.settings);
  renderLibrary(currentState.library);
  renderChat(currentState.chatHistory);

  registerCopyHandlers();
  registerReplaceHandlers();
  registerLibraryHandlers(currentState);
  registerSettingsHandlers(currentState);
  registerAccountHandlers();
  registerChatHandlers(currentState);
  registerSectionActionGuards();

  document.getElementById("enhance-btn").addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await handleEnhance(currentState);
  });

  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "PROMPANION_REQUEST_STATE" }, (response) => {
      if (response?.ok && response.state) {
        Object.assign(currentState, response.state);
        renderPrompts(currentState);
        renderStatus(currentState);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "PROMPANION_STATE_PUSH") {
      if (!currentState) {
        return;
      }
      if (message.state && typeof message.state === "object") {
        Object.assign(currentState, message.state);
        renderPrompts(currentState);
        renderStatus(currentState);
      }
    }
  });
}


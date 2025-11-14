/**
 * Prompt Library Module
 * Handles all functionality related to the Prompt Library section of the sidepanel
 */

export const LIBRARY_SCHEMA_VERSION = 2;

/**
 * Creates the default library structure with sample prompts
 * @returns {Array} Default library folders with prompts
 */
export function createDefaultLibrary() {
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

/**
 * Normalizes raw library data to ensure proper structure
 * @param {*} rawLibrary - Raw library data from storage
 * @returns {Array} Normalized library structure
 */
export function normalizeLibrary(rawLibrary) {
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

/**
 * Renders the library UI into the DOM
 * @param {Array} library - Library data to render
 * @param {Object} options - Rendering options (forceOpen)
 */
export function renderLibrary(library, options = {}) {
  const container = document.getElementById("prompt-library");
  const folderTemplate = document.getElementById("library-folder-template");
  const promptTemplate = document.getElementById("library-prompt-template");
  
  if (!container || !folderTemplate || !promptTemplate) {
    return;
  }
  
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

/**
 * Opens the library dialog for creating/editing/deleting library items
 * @param {Object} options - Dialog configuration options
 * @returns {Promise<string|boolean|null>} Resolved value based on dialog mode
 */
export async function openLibraryDialog(options = {}) {
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
  
  if (!dialog || !form) {
    return null;
  }
  
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
  
  if (!titleEl || !inputWrapper || !inputLabel || !inputField || !textareaWrapper || 
      !textareaLabel || !textareaField || !messageEl || !submitButton || !footerEl) {
    return null;
  }

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

/**
 * Registers event handlers for the prompt library
 * @param {Object} stateRef - Reference to current state object
 * @param {Object} dependencies - Required dependencies (saveState, LIBRARY_SCHEMA_VERSION)
 */
export function registerLibraryHandlers(stateRef, dependencies = {}) {
  const { saveState, LIBRARY_SCHEMA_VERSION } = dependencies;
  const container = document.getElementById("prompt-library");
  const addFolderButton = document.getElementById("add-folder");

  if (!container || !addFolderButton || !saveState) {
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
        message: `This will permanently delete the selected prompt:\n\n"${promptPreview}"`,
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


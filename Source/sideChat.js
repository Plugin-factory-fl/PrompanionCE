/**
 * Side Chat Module
 * Handles all functionality related to the Side Chat section of the sidepanel
 */

let autoChatInFlight = false;

/**
 * Welcome message content for new conversations
 */
const WELCOME_MESSAGE = "Welcome to the Side Chat! This is where you can ask me questions to elaborate on ideas you aren't clear on. I open up automatically when you highlight any text response from your LLM in the browser and click the \"Elaborate\" button. I'm here to help!";

/**
 * Checks if a conversation is fresh (only contains the welcome message)
 * @param {Object} conversation - Conversation object to check
 * @returns {boolean} True if conversation is fresh (unused)
 */
export function isFreshConversation(conversation) {
  if (!conversation || !Array.isArray(conversation.history)) {
    return false;
  }
  return (
    conversation.history.length === 1 &&
    conversation.history[0]?.role === "agent" &&
    conversation.history[0]?.content === WELCOME_MESSAGE
  );
}

/**
 * Formats a timestamp for display
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted timestamp string
 */
function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric"
  }).format(timestamp);
}

/**
 * Renders chat messages in the chat window
 * @param {Array} history - Array of chat message objects with role, content, and timestamp
 */
export function renderChat(history) {
  const chatWindow = document.getElementById("chat-window");
  if (!chatWindow) {
    return;
  }
  
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

/**
 * Renders conversation tabs
 * @param {Array} conversations - Array of conversation objects
 * @param {string} activeId - ID of the currently active conversation
 */
export function renderChatTabs(conversations, activeId) {
  const tabContainer = document.getElementById("chat-tabs");
  if (!tabContainer) {
    return;
  }
  
  tabContainer.innerHTML = "";

  conversations.forEach((conversation) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "chat-tab";
    tab.dataset.id = conversation.id;
    tab.textContent = conversation.title || "Conversation";
    tab.setAttribute("role", "tab");
    if (conversation.id === activeId) {
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "chat-tab__close";
    close.textContent = "×";
    close.title = "Close conversation";
    tab.append(close);

    tabContainer.append(tab);
  });
}

/**
 * Gets the active conversation from state
 * @param {Object} state - Application state object
 * @returns {Object} Active conversation object
 */
export function getActiveConversation(state) {
  return state.conversations.find((c) => c.id === state.activeConversationId) ?? state.conversations[0];
}

/**
 * Sets the active conversation and updates the UI
 * @param {Object} state - Application state object
 * @param {string} conversationId - ID of conversation to activate
 */
export function setActiveConversation(state, conversationId) {
  state.activeConversationId = conversationId;
  const active = getActiveConversation(state);
  renderChat(active?.history ?? []);
  renderChatTabs(state.conversations, state.activeConversationId);
}

/**
 * Converts chat history to API message format
 * @param {Array} history - Array of chat message objects
 * @returns {Array} Array of API message objects with role and content
 */
function buildChatApiMessages(history) {
  return history
    .map((entry) => {
      if (!entry?.content) {
        return null;
      }
      const role = entry.role === "agent" ? "assistant" : "user";
      return { role, content: entry.content };
    })
    .filter(Boolean);
}

/**
 * Generates a title for a conversation using AI
 * @param {Object} stateRef - Reference to application state
 * @param {Object} conversation - Conversation object
 * @returns {Promise<string>} Generated conversation title
 */
async function generateConversationTitle(stateRef, conversation) {
  const fallback = conversation.history.find((msg) => msg.role === "user")?.content ?? "Conversation";
  if (!stateRef.settings.apiKey) {
    return fallback.slice(0, 40);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stateRef.settings.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You summarize chat conversations in 3-5 words for tabs."
          },
          {
            role: "user",
            content: conversation.history.map((msg) => `${msg.role}: ${msg.content}`).join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();
    return summary ? summary.slice(0, 60) : fallback.slice(0, 60);
  } catch (error) {
    console.error("Failed to summarize conversation", error);
    return fallback.slice(0, 60);
  }
}

/**
 * Sends a message in the side chat and handles the AI response
 * @param {Object} stateRef - Reference to application state
 * @param {string} message - Message text to send
 * @param {Object} dependencies - Required dependencies (saveState)
 * @returns {Promise<Object>} Updated state reference
 */
export async function sendSideChatMessage(stateRef, message, dependencies) {
  const { saveState } = dependencies;
  
  if (!stateRef.settings.apiKey) {
    alert("Add your OpenAI API key in settings to use Side Chat.");
    return stateRef;
  }

  const activeConversation = getActiveConversation(stateRef);
  if (!activeConversation) {
    return stateRef;
  }

  const now = Date.now();
  activeConversation.history.push({ role: "user", content: message, timestamp: now });
  renderChat(activeConversation.history);
  renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
  await saveState(stateRef);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${stateRef.settings.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: buildChatApiMessages(activeConversation.history)
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (reply) {
      activeConversation.history.push({ role: "agent", content: reply, timestamp: Date.now() });
      renderChat(activeConversation.history);
      renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
      await saveState(stateRef);
    }
  } catch (error) {
    console.error("Side chat failed", error);
    activeConversation.history.push({
      role: "agent",
      content:
        "I couldn't reach the model. Check your API key in settings and try again.",
      timestamp: Date.now()
    });
    renderChat(activeConversation.history);
    renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
    await saveState(stateRef);
  }

  return stateRef;
}

/**
 * Automatically triggers a side chat message (used for pending messages)
 * @param {Object} stateRef - Reference to application state
 * @param {string} text - Text to send
 * @param {Object} options - Options object with fromPending flag
 * @param {Object} dependencies - Required dependencies (saveState)
 */
export async function triggerAutoSideChat(stateRef, text, { fromPending = false } = {}, dependencies = {}) {
  const { saveState } = dependencies;
  const snippet = typeof text === "string" ? text.trim() : "";
  if (!snippet || autoChatInFlight || !stateRef) {
    return;
  }

  if (fromPending) {
    const pendingText = stateRef.pendingSideChat?.text?.trim();
    if (!pendingText || pendingText !== snippet) {
      return;
    }
  }

  autoChatInFlight = true;
  try {
    const textarea = document.getElementById("chat-message");
    if (textarea) {
      textarea.value = snippet;
    }
    await sendSideChatMessage(stateRef, snippet, dependencies);
    if (textarea) {
      textarea.value = "";
    }
  } finally {
    autoChatInFlight = false;
    if (fromPending && stateRef.pendingSideChat) {
      stateRef.pendingSideChat = null;
      try {
        await saveState(stateRef);
      } catch (error) {
        console.warn("Prompanion: failed to clear pending side chat", error);
      }
    }
  }
}

/**
 * Processes any pending side chat messages
 * @param {Object} stateRef - Reference to application state
 * @param {Object} dependencies - Required dependencies (saveState)
 */
export function processPendingSideChat(stateRef, dependencies = {}) {
  const pending = stateRef?.pendingSideChat;
  if (!pending || typeof pending.text !== "string") {
    return;
  }
  triggerAutoSideChat(stateRef, pending.text, { fromPending: true }, dependencies);
}

/**
 * Registers all event handlers for the Side Chat section
 * @param {Object} stateRef - Reference to application state
 * @param {Object} dependencies - Required dependencies (renderStatus, saveState)
 */
export function registerChatHandlers(stateRef, dependencies = {}) {
  const { renderStatus, saveState } = dependencies;
  const form = document.getElementById("chat-form");
  const textarea = document.getElementById("chat-message");
  const resetButton = document.getElementById("chat-reset");
  const tabsContainer = document.getElementById("chat-tabs");
  
  if (!form || !textarea || !resetButton || !tabsContainer || !saveState) {
    return;
  }

  stateRef.activePlatform = "ChatGPT";
  if (!stateRef.activeConversationId) {
    stateRef.activeConversationId = stateRef.conversations[0]?.id;
  }
  if (renderStatus) {
    renderStatus(stateRef);
  }
  const active = getActiveConversation(stateRef);
  renderChat(active?.history ?? []);
  renderChatTabs(stateRef.conversations, stateRef.activeConversationId);

  resetButton.addEventListener("click", async () => {
    const activeConversation = getActiveConversation(stateRef);
    if (!activeConversation) {
      return;
    }

    if (activeConversation.history.length > 0) {
      activeConversation.title = await generateConversationTitle(stateRef, activeConversation);
    }

    // Check if there's already a fresh conversation (only welcome message)
    const existingFreshConversation = stateRef.conversations.find((conv) => 
      isFreshConversation(conv)
    );

    if (existingFreshConversation) {
      // Use the existing fresh conversation instead of creating a new one
      stateRef.activeConversationId = existingFreshConversation.id;
      renderChat(existingFreshConversation.history);
      renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
      await saveState(stateRef);
      return;
    }

    const newConversation = {
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
    stateRef.conversations.push(newConversation);
    stateRef.activeConversationId = newConversation.id;
    renderChat(newConversation.history);
    renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
    await saveState(stateRef);
  });

  tabsContainer.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tab = target.closest(".chat-tab");
    if (!tab) {
      return;
    }

    const conversationId = tab.dataset.id;
    if (!conversationId) {
      return;
    }

    if (target.classList.contains("chat-tab__close")) {
      const index = stateRef.conversations.findIndex((conv) => conv.id === conversationId);
      if (index !== -1) {
        stateRef.conversations.splice(index, 1);
        if (stateRef.activeConversationId === conversationId) {
          const replacement = stateRef.conversations[index] ?? stateRef.conversations[index - 1];
          stateRef.activeConversationId = replacement?.id ?? null;
          if (!stateRef.activeConversationId) {
            const fresh = {
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
            stateRef.conversations.push(fresh);
            stateRef.activeConversationId = fresh.id;
          }
        }
        const active = getActiveConversation(stateRef);
        renderChat(active?.history ?? []);
        renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
        await saveState(stateRef);
      }
      return;
    }

    stateRef.activeConversationId = conversationId;
    const activeConversation = getActiveConversation(stateRef);
    renderChat(activeConversation?.history ?? []);
    renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
    await saveState(stateRef);
  });

  textarea.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const message = textarea.value.trim();
      if (!message) {
        return;
      }
      textarea.value = "";
      await sendSideChatMessage(stateRef, message, { saveState });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (!message) {
      return;
    }

    textarea.value = "";
    await sendSideChatMessage(stateRef, message, { saveState });
  });
}


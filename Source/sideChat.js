/**
 * Side Chat Module
 * Handles all functionality related to the Side Chat section of the sidepanel
 * 
 * IMPORTANT: This file uses ES6 module syntax (export statements).
 * It should ONLY be imported by scripts/sidepanel.js in the side panel context.
 * It should NEVER be loaded as a regular script or content script.
 * 
 * This file MUST be loaded as a module (via import() or <script type="module">).
 * If loaded as a regular script, the export statements will cause a syntax error.
 */

import { formatMessageContent } from "./utils/messageFormatter.js";
import { showSideChatToast, updateToastToSuccess } from "./utils/toast.js";
import { callOpenAI, generateConversationTitle as generateTitleWithAPI } from "./utils/openaiClient.js";

let autoChatInFlight = false;
let pendingSideChatProcessing = false;

/**
 * Checks if we're in the correct sidepanel context
 * @returns {boolean} True if in sidepanel context
 */
function isInSidepanelContext() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  
  // Check for sidepanel-specific elements
  return !!(
    document.getElementById('chat-window') ||
    document.querySelector('.panel__section--chat') ||
    window.location?.pathname?.includes('sidepanel') ||
    window.location?.protocol === 'chrome-extension:'
  );
}

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
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.warn('[Prompanion] renderChat called outside of sidepanel context');
    return;
  }
  
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
    // Format agent messages with markdown support, keep user messages as plain text
    if (entry.role === "agent") {
      bubble.innerHTML = formatMessageContent(entry.content);
    } else {
      bubble.textContent = entry.content;
    }

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
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.warn('[Prompanion] renderChatTabs called outside of sidepanel context');
    return;
  }
  
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
 * @param {Array} llmChatHistory - Optional array of LLM chat history for context
 * @returns {Array} Array of API message objects with role and content
 */
function buildChatApiMessages(history, llmChatHistory = []) {
  const messages = [];
  
  // If LLM chat history is provided, add it as context in a system message
  if (Array.isArray(llmChatHistory) && llmChatHistory.length > 0) {
    // Format the LLM conversation history as context
    const contextText = llmChatHistory
      .map((msg) => {
        const role = msg.role === "assistant" ? "Assistant" : "User";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");
    
    // Get the user's question (the highlighted text they want to elaborate on)
    const userQuestion = history.find(msg => msg.role === "user")?.content || "";
    
    const systemMessageContent = `You are helping the user elaborate on a specific part of a conversation they had with an AI assistant. 

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE:
1. The user has highlighted text from the conversation below and wants you to elaborate on it
2. You MUST ALWAYS reference the original conversation context in your response
3. When discussing the highlighted topic, you MUST explicitly mention relevant details from the conversation (e.g., if the conversation was about Samsung phones and the user highlights "200MP camera", you MUST mention "Samsung" and say something like "In terms of Samsung's 200MP cameras" or "Regarding Samsung's 200MP camera technology")
4. Your response MUST conclude by connecting back to the original conversation context using phrases like:
   - "In terms of [specific topic/company/product from the conversation]..."
   - "Regarding [specific detail from the conversation]..."
   - "When it comes to [context from conversation]..."
5. Do NOT provide generic information - always tie it back to the specific conversation context provided

Here is the relevant conversation history for context:

${contextText}

The user wants to elaborate on: "${userQuestion}"

Your response MUST:
- Directly address the highlighted text
- Reference and relate back to the original conversation context throughout
- Mention specific details, companies, products, or topics from the conversation when relevant
- ALWAYS conclude by connecting your explanation back to the original context using the format: "In terms of [topic/company/product from context], [your explanation]"

Example: If the conversation mentioned "Samsung" and "200MP camera", and the user highlights "200MP camera", you MUST mention Samsung and conclude with something like "In terms of Samsung's 200MP cameras, they are a unique innovation and Samsung achieved this by..."`;
    
    messages.push({
      role: "system",
      content: systemMessageContent
    });
    
    console.log("[Prompanion] Added chat history context to API call:", llmChatHistory.length, "messages");
    console.log("[Prompanion] System message created with context:", {
      contextTextLength: contextText.length,
      contextPreview: contextText.substring(0, 200) + "...",
      userQuestion: userQuestion.substring(0, 100),
      systemMessageLength: systemMessageContent.length
    });
  } else {
    console.log("[Prompanion] No LLM chat history provided, skipping context system message");
  }
  
  // Add the SideChat conversation history
  const sideChatMessages = history
    .map((entry) => {
      if (!entry?.content) {
        return null;
      }
      const role = entry.role === "agent" ? "assistant" : "user";
      return { role, content: entry.content };
    })
    .filter(Boolean);
  
  messages.push(...sideChatMessages);
  return messages;
}

/**
 * Generates a title for a conversation using AI
 * @param {Object} stateRef - Reference to application state
 * @param {Object} conversation - Conversation object
 * @returns {Promise<string>} Generated conversation title
 */
export async function generateConversationTitle(stateRef, conversation) {
  // Filter out welcome message and system messages for context
  const contextualMessages = conversation.history.filter(
    (msg) => msg.role !== "agent" || (msg.content && !msg.content.includes("Welcome to the Side Chat"))
  );
  
  const fallback = contextualMessages.find((msg) => msg.role === "user")?.content ?? "Conversation";
  
  const contextualMessagesForAPI = contextualMessages.map((msg) => ({
    role: msg.role,
    content: msg.content
  }));
  
  return generateTitleWithAPI(contextualMessagesForAPI, fallback);
}

/**
 * Sends a message in the side chat and handles the AI response
 * @param {Object} stateRef - Reference to application state
 * @param {string} message - Message text to send
 * @param {Object} dependencies - Required dependencies (saveState)
 * @param {Array} llmChatHistory - Optional LLM chat history for context
 * @returns {Promise<Object>} Updated state reference
 */
export async function sendSideChatMessage(stateRef, message, dependencies, llmChatHistory = []) {
  console.log("[Prompanion] ========== sendSideChatMessage CALLED ==========");
  console.log("[Prompanion] Message:", message?.substring(0, 50));
  console.log("[Prompanion] StateRef:", {
    hasStateRef: !!stateRef,
    hasSettings: !!stateRef?.settings,
    hasConversations: !!stateRef?.conversations,
    conversationsLength: stateRef?.conversations?.length,
    activeConversationId: stateRef?.activeConversationId
  });
  
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.error('[Prompanion] sendSideChatMessage called outside of sidepanel context');
    return stateRef;
  }
  
  const { saveState } = dependencies;
  console.log("[Prompanion] Dependencies:", { hasSaveState: typeof saveState === 'function' });
  
  // Ensure settings object exists
  if (!stateRef.settings) {
    console.error("[Prompanion] stateRef.settings is missing! Initializing...");
    stateRef.settings = {};
  }

  // Get the active conversation - ensure we're using the correct one
  // Find the conversation by ID to ensure we have the correct reference
  let activeConversation = null;
  if (stateRef.activeConversationId) {
    activeConversation = stateRef.conversations.find(c => c.id === stateRef.activeConversationId);
  }
  
  // Fallback to first conversation if not found by ID
  if (!activeConversation && stateRef.conversations.length > 0) {
    activeConversation = stateRef.conversations[0];
    console.warn("[Prompanion] Active conversation not found by ID, using first conversation");
  }
  
  console.log("[Prompanion] Active conversation:", {
    found: !!activeConversation,
    id: activeConversation?.id,
    historyLength: activeConversation?.history?.length,
    activeConversationId: stateRef.activeConversationId,
    conversationsCount: stateRef.conversations?.length
  });
  
  if (!activeConversation) {
    console.error("[Prompanion] No active conversation found when sending message");
    console.error("[Prompanion] StateRef conversations:", stateRef?.conversations);
    console.error("[Prompanion] Active conversation ID:", stateRef?.activeConversationId);
    return stateRef;
  }
  
  // Ensure history array exists
  if (!Array.isArray(activeConversation.history)) {
    console.warn("[Prompanion] Conversation history is not an array, initializing...");
    activeConversation.history = [];
  }

  console.log("[Prompanion] Sending message to conversation:", activeConversation.id, "Current history length:", activeConversation.history.length);

  const now = Date.now();
  const userMessage = { role: "user", content: message, timestamp: now };
  console.log("[Prompanion] Adding user message to conversation:", {
    conversationId: activeConversation.id,
    messageLength: message.length,
    messagePreview: message.substring(0, 50),
    historyLengthBefore: activeConversation.history.length,
    messageContent: message // Log full message for debugging
  });
  
  // Add message to history
  activeConversation.history.push(userMessage);
  
  // Verify it was added immediately
  const verifyAdded = activeConversation.history[activeConversation.history.length - 1];
  if (!verifyAdded || verifyAdded.content !== message) {
    console.error("[Prompanion] CRITICAL: Message was not added to conversation history!", {
      expectedMessage: message.substring(0, 50),
      lastMessageInHistory: verifyAdded?.content?.substring(0, 50),
      historyLength: activeConversation.history.length
    });
  }
  
  console.log("[Prompanion] User message added, new history length:", activeConversation.history.length);
  console.log("[Prompanion] Last message in history:", {
    role: activeConversation.history[activeConversation.history.length - 1]?.role,
    contentPreview: activeConversation.history[activeConversation.history.length - 1]?.content?.substring(0, 50),
    fullContent: activeConversation.history[activeConversation.history.length - 1]?.content
  });
  
  renderChat(activeConversation.history);
  renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
  
  // Ensure chat window scrolls to bottom to show the new message
  setTimeout(() => {
    const chatWindow = document.getElementById("chat-window");
    if (chatWindow) {
      chatWindow.scrollTop = chatWindow.scrollHeight;
      console.log("[Prompanion] Scrolled chat window to bottom to show new message");
    }
  }, 50);
  
  console.log("[Prompanion] Chat rendered, checking DOM...");
  // Verify the message appears in the DOM
  setTimeout(() => {
    const chatWindow = document.getElementById("chat-window");
    if (chatWindow) {
      const userMessages = chatWindow.querySelectorAll('.chat-message--user');
      console.log("[Prompanion] DOM Verification - Found", userMessages.length, "user messages in chat window");
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        const messageText = lastUserMessage.querySelector('.chat-message__bubble')?.textContent || '';
        console.log("[Prompanion] Last user message in DOM:", messageText.substring(0, 50));
        
        // Ensure the message is visible by scrolling it into view
        lastUserMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        console.warn("[Prompanion] WARNING: No user messages found in DOM after rendering!");
      }
    } else {
      console.error("[Prompanion] ERROR: Chat window not found in DOM!");
    }
  }, 100);
  
  if (!saveState || typeof saveState !== 'function') {
    console.error("[Prompanion] saveState is not a function in sendSideChatMessage!", typeof saveState);
    console.error("[Prompanion] Dependencies:", dependencies);
    // Continue anyway - the message was added to history and rendered
  } else {
    await saveState(stateRef);
  }
  
  console.log("[Prompanion] Added user message, new history length:", activeConversation.history.length);

  try {
    const apiMessages = buildChatApiMessages(activeConversation.history, llmChatHistory);
    console.log("[Prompanion] Sending to API with", apiMessages.length, "messages");
    if (llmChatHistory.length > 0) {
      console.log("[Prompanion] Chat history context included:", llmChatHistory.length, "messages from LLM conversation");
    }
    
    let apiResult;
    try {
      apiResult = await callOpenAI(apiMessages, llmChatHistory);
    } catch (error) {
      console.error("[Prompanion] Side chat API call failed:", error);
      const errorMessage = error.message || "Failed to get response";
      
      // Check for authentication errors
      if (errorMessage.includes("No authentication token") || errorMessage.includes("Authentication failed")) {
        alert("Please log in to your Prompanion account to use Side Chat. Click the account button in the header to log in.");
        return stateRef;
      }
      
      // Check for limit reached error
      if (errorMessage === "LIMIT_REACHED") {
        const limitMessage = {
          role: "agent",
          content: 'You used all 10 of your free uses! You\'ll get 10 more tomorrow. If <a href="#" style="text-decoration: underline; color: inherit;" onclick="event.preventDefault(); console.log(\'Upgrade clicked - placeholder for Stripe integration\'); return false;">upgrade now</a> you can get unlimited uses.',
          timestamp: Date.now()
        };
        activeConversation.history.push(limitMessage);
        renderChat(activeConversation.history);
        await saveState(stateRef);
        return stateRef;
      }
      
      // Show error message to user for other errors
      const errorMsg = { role: "agent", content: `Error: ${errorMessage}`, timestamp: Date.now() };
      activeConversation.history.push(errorMsg);
      renderChat(activeConversation.history);
      await saveState(stateRef);
      return stateRef;
    }

    // Handle both old format (string) and new format (object with reply and usage data)
    const reply = typeof apiResult === 'string' ? apiResult : apiResult.reply;
    const enhancementsUsed = typeof apiResult === 'object' ? apiResult.enhancementsUsed : undefined;
    const enhancementsLimit = typeof apiResult === 'object' ? apiResult.enhancementsLimit : undefined;

    // Update enhancement count if usage data is available
    if (enhancementsUsed !== undefined && enhancementsLimit !== undefined) {
      console.log("[Prompanion] Side Chat usage data received:", { enhancementsUsed, enhancementsLimit });
      // Update state
      if (stateRef) {
        stateRef.enhancementsUsed = enhancementsUsed;
        stateRef.enhancementsLimit = enhancementsLimit;
      }
      // Update UI directly
      const countEl = document.getElementById("enhancements-count");
      const limitEl = document.getElementById("enhancements-limit");
      if (countEl) {
        countEl.textContent = enhancementsUsed;
        console.log("[Prompanion] Updated enhancements count from Side Chat:", enhancementsUsed);
      }
      if (limitEl) {
        limitEl.textContent = enhancementsLimit;
      }
      // Also update via renderStatus if available
      if (typeof window.renderStatus === 'function') {
        window.renderStatus({
          ...stateRef,
          enhancementsUsed,
          enhancementsLimit
        });
      }
      // Send message to background script to notify other parts of the extension
      try {
        chrome.runtime.sendMessage({ 
          type: "PROMPANION_USAGE_UPDATE", 
          enhancementsUsed,
          enhancementsLimit 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log("[Prompanion] Usage update message sent (background may not be listening)");
          }
        });
      } catch (error) {
        console.warn("[Prompanion] Failed to send usage update message:", error);
      }
    }

    // Re-get the active conversation to ensure we have the latest reference
    const currentActiveConversation = getActiveConversation(stateRef);
    if (!currentActiveConversation) {
      console.error("[Prompanion] No active conversation found when adding response");
      return stateRef;
    }
    
    // Verify we're adding to the correct conversation
    if (currentActiveConversation.id !== activeConversation.id) {
      console.warn("[Prompanion] Active conversation changed during API call, using current one");
    }
    
    currentActiveConversation.history.push({ role: "agent", content: reply, timestamp: Date.now() });
    renderChat(currentActiveConversation.history);
    console.log("[Prompanion] Added agent response, final history length:", currentActiveConversation.history.length);
    
    // Auto-generate title if conversation doesn't have one yet or is still "New chat"
    const nonWelcomeMessages = currentActiveConversation.history.filter(
      (msg) => !(msg.role === "agent" && msg.content && msg.content.includes("Welcome to the Side Chat"))
    );
    const needsTitle = 
      !currentActiveConversation.title || 
      currentActiveConversation.title === "New chat" ||
      currentActiveConversation.title === "Conversation";
    
    // Generate title if we have at least 1 user message and 1 agent response (excluding welcome)
    const userMessages = nonWelcomeMessages.filter(msg => msg.role === "user");
    const agentMessages = nonWelcomeMessages.filter(msg => msg.role === "agent");
    
    if (needsTitle && userMessages.length >= 1 && agentMessages.length >= 1) {
      console.log("[Prompanion] Generating title for conversation:", currentActiveConversation.id);
      // Generate title asynchronously (don't wait for it to complete)
      generateConversationTitle(stateRef, currentActiveConversation).then((title) => {
        console.log("[Prompanion] Generated title:", title, "for conversation:", currentActiveConversation.id);
        if (title && title !== currentActiveConversation.title && title !== "Conversation") {
          currentActiveConversation.title = title;
          renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
          saveState(stateRef).catch((error) => {
            console.warn("Failed to save state after title generation:", error);
          });
        } else {
          console.log("[Prompanion] Title not updated - title:", title, "current:", currentActiveConversation.title);
        }
      }).catch((error) => {
        console.warn("Failed to generate conversation title:", error);
      });
    } else {
      console.log("[Prompanion] Title generation skipped - needsTitle:", needsTitle, "userMessages:", userMessages.length, "agentMessages:", agentMessages.length);
    }
    
    renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
    await saveState(stateRef);
  } catch (error) {
    console.error("Side chat failed", error);
    const errorMessage = error?.message || "Failed to get response";
    
    // Re-get active conversation for error handling
    const currentActiveConversation = getActiveConversation(stateRef);
    if (currentActiveConversation) {
      // Check for limit reached error
      if (errorMessage === "LIMIT_REACHED") {
        currentActiveConversation.history.push({
          role: "agent",
          content: 'You used all 10 of your free uses! You\'ll get 10 more tomorrow. If <a href="#" style="text-decoration: underline; color: inherit;" onclick="event.preventDefault(); console.log(\'Upgrade clicked - placeholder for Stripe integration\'); return false;">upgrade now</a> you can get unlimited uses.',
          timestamp: Date.now()
        });
      } else {
        // Other errors - show generic message
        currentActiveConversation.history.push({
          role: "agent",
          content: "I couldn't reach the model. Check your API key in settings and try again.",
          timestamp: Date.now()
        });
      }
      renderChat(currentActiveConversation.history);
      renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
      await saveState(stateRef);
    }
  }

  return stateRef;
}

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
 * Limits conversations to a maximum of 7, deleting the oldest ones
 * @param {Object} stateRef - Reference to application state
 * @returns {boolean} True if conversations were deleted
 */
function limitConversationsToMax(stateRef) {
  const MAX_CONVERSATIONS = 7;
  if (!stateRef.conversations || stateRef.conversations.length <= MAX_CONVERSATIONS) {
    return false;
  }
  
  // Sort conversations by timestamp (oldest first)
  // Extract timestamp from conversation ID (format: "conv-{timestamp}")
  const sortedConversations = [...stateRef.conversations].sort((a, b) => {
    const timestampA = Number.parseInt(a.id.match(/^conv-(\d+)$/)?.[1] || "0", 10);
    const timestampB = Number.parseInt(b.id.match(/^conv-(\d+)$/)?.[1] || "0", 10);
    return timestampA - timestampB;
  });
  
  // Keep only the most recent MAX_CONVERSATIONS
  const conversationsToKeep = sortedConversations.slice(-MAX_CONVERSATIONS);
  const deletedCount = stateRef.conversations.length - conversationsToKeep.length;
  
  // Update conversations array
  stateRef.conversations = conversationsToKeep;
  
  // If the active conversation was deleted, switch to the most recent one
  if (!stateRef.conversations.find(c => c.id === stateRef.activeConversationId)) {
    stateRef.activeConversationId = stateRef.conversations[stateRef.conversations.length - 1]?.id || null;
  }
  
  if (deletedCount > 0) {
    console.log(`[Prompanion] Deleted ${deletedCount} oldest conversation(s) to maintain limit of ${MAX_CONVERSATIONS}`);
  }
  
  return deletedCount > 0;
}

/**
 * Automatically triggers a side chat message (used for pending messages)
 * @param {Object} stateRef - Reference to application state
 * @param {string} text - Text to send
 * @param {Object} options - Options object with fromPending and startFresh flags
 * @param {Object} dependencies - Required dependencies (saveState)
 */
export async function triggerAutoSideChat(stateRef, text, { fromPending = false, startFresh = false, llmChatHistory = null } = {}, dependencies = {}) {
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.error('[Prompanion] triggerAutoSideChat called outside of sidepanel context');
    return;
  }
  
  const { saveState } = dependencies;
  
  // CRITICAL: Use pendingSideChat.text as the source of truth if available
  // This ensures we always have the latest text, even if the text parameter is stale
  const textToUse = stateRef?.pendingSideChat?.text?.trim() || (typeof text === "string" ? text.trim() : "");
  const snippet = textToUse;
  
  console.log("[Prompanion] triggerAutoSideChat called:", {
    hasText: !!text,
    textLength: text?.length,
    hasPendingSideChat: !!stateRef?.pendingSideChat?.text,
    pendingTextLength: stateRef?.pendingSideChat?.text?.length,
    snippetLength: snippet.length,
    hasStateRef: !!stateRef,
    fromPending,
    startFresh,
    textSource: stateRef?.pendingSideChat?.text ? "pendingSideChat" : "parameter"
  });
  
  if (!snippet || !stateRef) {
    console.error("[Prompanion] triggerAutoSideChat: Missing snippet or stateRef", {
      snippet: snippet?.substring(0, 50),
      hasStateRef: !!stateRef,
      hasPendingSideChat: !!stateRef?.pendingSideChat,
      pendingText: stateRef?.pendingSideChat?.text?.substring(0, 50)
    });
    return;
  }

  // Check flight flag BEFORE doing anything to prevent duplicates
  if (autoChatInFlight) {
    console.log("[Prompanion] Auto chat already in flight, skipping duplicate trigger");
    return;
  }

  // If startFresh is true, ALWAYS create a new conversation
  // This ensures each "Elaborate" click gets its own conversation
  if (startFresh) {
    // When startFresh is true, we don't need to check fromPending
    // Each Elaborate click is independent and should create its own conversation
    
    // Create a completely new conversation with welcome message
    const newConversation = createNewConversation();
    stateRef.conversations.push(newConversation);
    // Limit conversations to 7, deleting oldest if needed
    limitConversationsToMax(stateRef);
    stateRef.activeConversationId = newConversation.id;
    
    // Verify we got the correct conversation
    const activeConversation = getActiveConversation(stateRef);
    if (!activeConversation || activeConversation.id !== newConversation.id) {
      console.error("[Prompanion] Active conversation mismatch after creating new one");
      // Force set it
      stateRef.activeConversationId = newConversation.id;
    }
    
    // Render the new conversation (should show welcome message only)
    const finalActiveConversation = getActiveConversation(stateRef);
    if (!finalActiveConversation) {
      console.error("[Prompanion] Failed to get active conversation after creating new one!");
      console.error("[Prompanion] StateRef:", {
        activeConversationId: stateRef.activeConversationId,
        conversationsLength: stateRef.conversations?.length,
        newConversationId: newConversation.id
      });
      autoChatInFlight = false;
      return;
    }
    
    renderChat(finalActiveConversation.history ?? []);
    renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
    
    if (saveState && typeof saveState === 'function') {
      await saveState(stateRef);
      console.log("[Prompanion] State saved after creating new conversation");
    } else {
      console.error("[Prompanion] saveState is not a function!", typeof saveState);
    }
    
    console.log("[Prompanion] Created new conversation for Elaborate:", newConversation.id, "History length:", finalActiveConversation.history?.length || 0);
  } else {
    // For non-fresh conversations, check fromPending
    if (fromPending) {
      const pendingText = stateRef.pendingSideChat?.text?.trim();
      if (!pendingText || pendingText !== snippet) {
        return;
      }
    }
  }

  // Use chat history from parameter (passed directly from message, not stored)
  // Fallback to pendingSideChat for backwards compatibility, but prefer parameter
  const chatHistoryToUse = Array.isArray(llmChatHistory) && llmChatHistory.length > 0
    ? llmChatHistory 
    : (Array.isArray(stateRef.pendingSideChat?.chatHistory) && stateRef.pendingSideChat.chatHistory.length > 0
        ? stateRef.pendingSideChat.chatHistory 
        : []);

  // Show toast notification if chat history was retrieved
  // Show it after the section is opened and conversation is created
  let toast = null;
  if (chatHistoryToUse.length > 0) {
    console.log("[Prompanion] Chat history retrieved:", chatHistoryToUse.length, "messages");
    // Wait a bit for the section to be visible, then show toast
    setTimeout(() => {
      toast = showSideChatToast("Retrieving chat history...", "loading", 0); // Don't auto-remove
      
      // Update toast to success after a brief delay
      setTimeout(() => {
        if (toast && toast.parentElement) {
          updateToastToSuccess(toast);
          const textEl = toast.querySelector(".sidechat-toast__text");
          if (textEl) {
            textEl.textContent = "Chat History Retrieved!";
          }
          // Auto-remove after 3 seconds
          setTimeout(() => {
            toast.classList.remove("is-visible");
            setTimeout(() => {
              if (toast.parentElement) {
                toast.remove();
              }
            }, 300);
          }, 3000);
        }
      }, 800); // Show loading for at least 800ms
    }, 300); // Wait for section to open
  } else {
    console.log("[Prompanion] No chat history found in pendingSideChat");
  }

  // Set flight flag BEFORE sending to prevent duplicate sends
  // This prevents race conditions when multiple Elaborate clicks happen quickly
  autoChatInFlight = true;
  try {
    // Wait for DOM to be ready - retry with exponential backoff
    let textarea = document.getElementById("chat-message");
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds max wait
    
    while (!textarea && attempts < maxAttempts) {
      attempts++;
      const delay = Math.min(100 * attempts, 200); // Exponential backoff, max 200ms
      await new Promise(resolve => setTimeout(resolve, delay));
      textarea = document.getElementById("chat-message");
      
      if (textarea) {
        console.log("[Prompanion] Textarea found after", attempts, "attempts");
        break;
      }
    }
    
    if (textarea) {
      textarea.value = snippet;
      // Trigger input event to ensure any listeners are notified
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log("[Prompanion] Set textarea value:", snippet.substring(0, 50) + "...");
    } else {
      console.error("[Prompanion] Textarea not found after", maxAttempts, "attempts! ID: chat-message");
      autoChatInFlight = false;
      return;
    }
    
    // Verify we have the correct active conversation before sending
    const verifyActiveConversation = getActiveConversation(stateRef);
    if (!verifyActiveConversation) {
      console.error("[Prompanion] No active conversation found before sending message");
      autoChatInFlight = false;
      return;
    }
    console.log("[Prompanion] Sending message to conversation:", verifyActiveConversation.id, "Snippet length:", snippet.length);
    
    console.log("[Prompanion] About to call sendSideChatMessage with:", {
      snippetLength: snippet.length,
      snippetPreview: snippet.substring(0, 100),
      hasDependencies: !!dependencies,
      hasSaveState: typeof dependencies?.saveState === 'function',
      chatHistoryLength: chatHistoryToUse.length,
      activeConversationId: stateRef.activeConversationId
    });
    
    // Verify snippet is not empty before sending
    if (!snippet || snippet.trim().length === 0) {
      console.error("[Prompanion] ERROR: Snippet is empty! Cannot send message.", {
        snippet,
        snippetType: typeof snippet,
        snippetLength: snippet?.length
      });
      autoChatInFlight = false;
      return;
    }
    
    try {
      await sendSideChatMessage(stateRef, snippet, dependencies, chatHistoryToUse);
      console.log("[Prompanion] Message sent successfully");
      
      // Verify the message was added to history
      // Wait a bit for state to sync, but check BEFORE the API response comes back
      // The API response is async, so we should check immediately after sendSideChatMessage
      // but before waiting for the response
      const verifyConversation = getActiveConversation(stateRef);
      if (verifyConversation) {
        // Check the second-to-last message (the user message we just added)
        // The last message might be the agent response if it came back quickly
        const historyLength = verifyConversation.history.length;
        const userMessageIndex = historyLength - 2; // Second to last (before agent response)
        const lastMessageIndex = historyLength - 1; // Last message (might be agent response)
        
        // Try to find the user message we just added
        let userMessage = null;
        if (userMessageIndex >= 0 && verifyConversation.history[userMessageIndex]?.role === "user") {
          userMessage = verifyConversation.history[userMessageIndex];
        } else if (verifyConversation.history[lastMessageIndex]?.role === "user") {
          // If last message is still user (API hasn't responded yet), use that
          userMessage = verifyConversation.history[lastMessageIndex];
        }
        
        console.log("[Prompanion] Verification - Checking conversation:", {
          historyLength: historyLength,
          userMessageIndex: userMessageIndex,
          lastMessageIndex: lastMessageIndex,
          foundUserMessage: !!userMessage,
          userMessageRole: userMessage?.role,
          userMessagePreview: userMessage?.content?.substring(0, 50),
          lastMessageRole: verifyConversation.history[lastMessageIndex]?.role,
          lastMessagePreview: verifyConversation.history[lastMessageIndex]?.content?.substring(0, 50),
          conversationId: verifyConversation.id,
          activeConversationId: stateRef.activeConversationId
        });
        
        if (userMessage) {
          // Check if message was added (more lenient check - allow whitespace differences)
          const snippetTrimmed = snippet.trim();
          const userMessageContentTrimmed = userMessage.content?.trim() || "";
          
          if (userMessageContentTrimmed !== snippetTrimmed) {
            console.error("[Prompanion] ERROR: User message content doesn't match!", {
              expectedSnippet: snippetTrimmed.substring(0, 100),
              actualUserMessage: userMessageContentTrimmed.substring(0, 100),
              expectedLength: snippetTrimmed.length,
              actualLength: userMessageContentTrimmed.length,
              match: userMessageContentTrimmed === snippetTrimmed
            });
          } else {
            console.log("[Prompanion] ✓ Verification passed - User message was added correctly!");
          }
        } else {
          console.warn("[Prompanion] WARNING: Could not find user message in conversation history!", {
            historyLength: historyLength,
            allMessages: verifyConversation.history.map((m, i) => ({
              index: i,
              role: m.role,
              contentPreview: m.content?.substring(0, 30)
            }))
          });
        }
      } else {
        console.error("[Prompanion] ERROR: Could not find active conversation for verification!", {
          activeConversationId: stateRef.activeConversationId,
          conversationsCount: stateRef.conversations?.length,
          conversationIds: stateRef.conversations?.map(c => c.id)
        });
      }
    } catch (error) {
      console.error("[Prompanion] Error sending message:", error);
      throw error;
    }
    if (textarea) {
      textarea.value = "";
    }
  } finally {
    autoChatInFlight = false;
    // Clear pending side chat after processing (only if fromPending)
    if (fromPending && stateRef.pendingSideChat) {
      stateRef.pendingSideChat = null;
      try {
        await saveState(stateRef);
        console.log("[Prompanion] Cleared pendingSideChat after processing");
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
  // Prevent duplicate processing
  if (pendingSideChatProcessing) {
    console.log("[Prompanion] processPendingSideChat already in progress, skipping");
    return;
  }
  
  const pending = stateRef?.pendingSideChat;
  if (!pending || typeof pending.text !== "string") {
    return;
  }
  
  // Only process if not already in flight (to avoid conflicts with direct calls)
  if (autoChatInFlight) {
    console.log("[Prompanion] Auto chat already in flight, skipping pending side chat");
    return;
  }
  
  // Clear pending immediately to prevent duplicate processing
  const pendingText = pending.text;
  stateRef.pendingSideChat = null;
  
  pendingSideChatProcessing = true;
  triggerAutoSideChat(stateRef, pendingText, { fromPending: true }, dependencies)
    .finally(() => {
      pendingSideChatProcessing = false;
    });
}

/**
 * Opens/expands the Side Chat section in the sidepanel
 * @param {number} retries - Number of retry attempts if element not found
 */
export async function openSideChatSection(retries = 10) {
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.warn('[Prompanion] openSideChatSection called outside of sidepanel context');
    return false;
  }
  
  // Wait for DOM to be ready with retries
  for (let attempt = 0; attempt < retries; attempt++) {
    const chatSection = document.querySelector(".panel__section--chat details");
    if (chatSection) {
      if (!chatSection.open) {
        chatSection.open = true;
      }
      
      // Wait for the section to be fully expanded
      await new Promise(resolve => {
        // Check if already expanded
        if (chatSection.classList.contains("is-expanded") || chatSection.open) {
          resolve();
          return;
        }
        
        // Wait for expansion animation
        const checkExpanded = () => {
          if (chatSection.classList.contains("is-expanded") || chatSection.open) {
            resolve();
          } else {
            setTimeout(checkExpanded, 50);
          }
        };
        setTimeout(checkExpanded, 50);
      });
      
      // Ensure it's visible
      chatSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      
      // Small delay to ensure DOM is fully updated
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    }
    
    // Wait before retrying
    if (attempt < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.warn("[SideChat] Could not find Side Chat section element after", retries, "attempts");
  return false;
}

// Store handler references to allow removal
const handlerStore = {
  resetButton: null,
  tabsContainer: null,
  textarea: null,
  form: null
};

/**
 * Registers all event handlers for the Side Chat section
 * @param {Object} stateRef - Reference to application state
 * @param {Object} dependencies - Required dependencies (renderStatus, saveState)
 */
export function registerChatHandlers(stateRef, dependencies = {}) {
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.warn('[Prompanion] registerChatHandlers called outside of sidepanel context');
    return;
  }
  
  const { renderStatus, saveState } = dependencies;
  const form = document.getElementById("chat-form");
  const textarea = document.getElementById("chat-message");
  const resetButton = document.getElementById("chat-reset");
  const tabsContainer = document.getElementById("chat-tabs");
  
  if (!form || !textarea || !resetButton || !tabsContainer || !saveState) {
    return;
  }

  // Remove old event listeners if they exist to prevent duplicates
  if (handlerStore.resetButton) {
    resetButton.removeEventListener("click", handlerStore.resetButton);
  }
  if (handlerStore.tabsContainer) {
    tabsContainer.removeEventListener("click", handlerStore.tabsContainer);
  }
  if (handlerStore.textarea) {
    textarea.removeEventListener("keydown", handlerStore.textarea);
  }
  if (handlerStore.form) {
    form.removeEventListener("submit", handlerStore.form);
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

  // Create and store handler
  handlerStore.resetButton = async () => {
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
    // Limit conversations to 7, deleting oldest if needed
    limitConversationsToMax(stateRef);
    stateRef.activeConversationId = newConversation.id;
    renderChat(newConversation.history);
    renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
    await saveState(stateRef);
  };
  resetButton.addEventListener("click", handlerStore.resetButton);

  // Create and store handler
  handlerStore.tabsContainer = async (event) => {
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
            // Limit conversations to 7, deleting oldest if needed
            limitConversationsToMax(stateRef);
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
  };
  tabsContainer.addEventListener("click", handlerStore.tabsContainer);

  // Create and store handler
  handlerStore.textarea = async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const message = textarea.value.trim();
      if (!message) {
        return;
      }
      textarea.value = "";
      await sendSideChatMessage(stateRef, message, { saveState });
    }
  };
  textarea.addEventListener("keydown", handlerStore.textarea);

  // Create and store handler
  handlerStore.form = async (event) => {
    event.preventDefault();
    const message = textarea.value.trim();
    if (!message) {
      return;
    }

    textarea.value = "";
    await sendSideChatMessage(stateRef, message, { saveState });
  };
  form.addEventListener("submit", handlerStore.form);
}



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
const WELCOME_MESSAGE = "Welcome to the Side Chat!\n\nThis is where you can ask me questions to elaborate on ideas you aren't clear on. I open up automatically when you highlight any text response from your LLM in the browser and click the \"Elaborate\" button. I'm here to help!";

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
    console.warn('[PromptProfile™] renderChat called outside of sidepanel context');
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
    const author = entry.role === "agent" ? "PromptProfile™" : "You";
    meta.textContent = `${author} • ${formatTimestamp(entry.timestamp)}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-message__bubble";
    
    // Clean up welcome message if it has duplication
    let content = entry.content;
    if (entry.role === "agent" && content && content.includes("Welcome to the Side Chat")) {
      // Check if the message has duplicate sentences
      const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
      const seen = new Set();
      const unique = [];
      for (const sent of sentences) {
        const normalized = sent.toLowerCase().replace(/\s+/g, ' ').trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          unique.push(sent.trim());
        }
      }
      // If we found duplicates, use the cleaned version
      if (unique.length < sentences.length) {
        content = unique.join(' ');
        // Preserve paragraph breaks if they exist
        if (content.includes('\n\n')) {
          const paragraphs = content.split('\n\n');
          content = paragraphs.map(p => {
            const paraSentences = p.match(/[^.!?]+[.!?]+/g) || [];
            const paraSeen = new Set();
            const paraUnique = [];
            for (const sent of paraSentences) {
              const normalized = sent.toLowerCase().replace(/\s+/g, ' ').trim();
              if (!paraSeen.has(normalized)) {
                paraSeen.add(normalized);
                paraUnique.push(sent.trim());
              }
            }
            return paraUnique.join(' ');
          }).filter(p => p.length > 0).join('\n\n');
        }
      }
    }
    
    // Format agent messages with markdown support, keep user messages as plain text
    if (entry.role === "agent") {
      bubble.innerHTML = formatMessageContent(content);
    } else {
      bubble.textContent = content;
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
    console.warn('[PromptProfile™] renderChatTabs called outside of sidepanel context');
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
function buildChatApiMessages(history, llmChatHistory = [], levelOfDetail = 2) {
  const messages = [];
  
  // Define response length instructions based on detail level
  const detailInstructions = {
    1: {
      text: "CRITICAL: Keep your response VERY BRIEF and CONCISE. Paraphrase and condense your language to be as short as possible while maintaining clarity. Think Twitter post length - direct, no fluff. Remove all unnecessary words and explanations. Keep only the essential information. Aim for the shortest possible version while maintaining meaning. DO NOT truncate - instead, paraphrase longer explanations into shorter, more direct statements.",
      style: "extremely brief, direct, and minimal",
      length: "very short - like a Twitter post (typically 2-4 sentences or 50-100 words)",
      examples: "Instead of 'This concept is important because it helps users understand how the system works in practice', use 'This helps users understand how the system works.' Instead of 'In the context of your conversation about [topic], this means that...', use 'This means...'"
    },
    2: {
      text: "Keep your response MODERATE in length - clear and focused without being overly verbose. Write in well-structured paragraphs that are concise but complete. Avoid unnecessary elaboration, but provide enough context to be helpful. Paraphrase longer explanations into more concise language when possible.",
      style: "clear, concise, and well-structured",
      length: "moderate length - typically 3-5 sentences or 100-200 words",
      examples: "Provide clear explanations without excessive detail. Be direct but complete."
    },
    3: {
      text: "Provide a MORE DETAILED response with context and explanations, but keep it REASONABLE in length. Include necessary background information and connections, but avoid creating 'gigantic text blocks'. Aim for comprehensive but well-organized responses that are easy to read. Paraphrase verbose sections to maintain clarity while including important details.",
      style: "detailed, informative, and well-organized",
      length: "moderately detailed - typically 5-8 sentences or 200-350 words",
      examples: "Include context and explanations, but keep paragraphs focused and avoid repetition."
    }
  };

  const detail = detailInstructions[levelOfDetail] || detailInstructions[2];
  
  // If LLM chat history is provided, add it as context in a system message
  if (Array.isArray(llmChatHistory) && llmChatHistory.length > 0) {
    // Truncate chat history to prevent "request entity too large" errors
    // Limit to most recent messages and truncate content if needed
    const MAX_CHAT_HISTORY_MESSAGES = 5; // Limit to 5 most recent messages (reduced from 10)
    const MAX_CONTENT_LENGTH_PER_MESSAGE = 1000; // Limit each message content to 1000 chars (reduced from 2000)
    const MAX_TOTAL_CONTEXT_LENGTH = 4000; // Limit total context text to 4000 chars (reduced from 8000)
    
    let truncatedHistory = llmChatHistory.slice(-MAX_CHAT_HISTORY_MESSAGES); // Get most recent messages
    
    // Truncate each message's content
    truncatedHistory = truncatedHistory.map(msg => ({
      ...msg,
      content: msg.content && msg.content.length > MAX_CONTENT_LENGTH_PER_MESSAGE
        ? msg.content.substring(0, MAX_CONTENT_LENGTH_PER_MESSAGE) + "..."
        : msg.content
    }));
    
    // Format the LLM conversation history as context
    let contextText = truncatedHistory
        .map((msg) => {
          const role = msg.role === "assistant" ? "Assistant" : "User";
        return `${role}: ${msg.content}`;
        })
        .join("\n\n");
      
    // If context is still too long, truncate it further
    if (contextText.length > MAX_TOTAL_CONTEXT_LENGTH) {
      contextText = contextText.substring(0, MAX_TOTAL_CONTEXT_LENGTH) + "\n\n[Chat history truncated for length...]";
    }
    
    // Get the user's question (the highlighted text they want to elaborate on)
    const userQuestion = history.find(msg => msg.role === "user")?.content || "";
    
    // Build system message - truncate context further if total message would be too long
    const MAX_SYSTEM_MESSAGE_LENGTH = 6000; // 6KB max for entire system message
    const instructionsPrefix = `You are helping the user elaborate on a specific part of a conversation they had with an AI assistant.

CRITICAL REQUIREMENTS FOR YOUR RESPONSE:

1. **Response Length (CRITICAL)**: 
   ${detail.text}
   
   Your response must be ${detail.style} and approximately ${detail.length}.
   ${detail.examples ? `\n   Examples: ${detail.examples}` : ''}
   
   IMPORTANT: DO NOT truncate your response mid-thought. Instead, paraphrase and condense your language to meet the length requirement while maintaining all essential information.

2. **Structure**: Provide a clear, well-organized explanation that flows naturally from general to specific.

3. **Content**: 
   - Start by explaining what the highlighted topic means in general terms
   - Then explain how it specifically relates to the conversation context provided
   - Use specific examples or details from the conversation when relevant
   - Make connections between the topic and the broader conversation

4. **Relevance Explanation**: 
   - Explicitly state WHY this information is relevant to the user's original conversation
   - Explain how understanding this topic helps them in the context of what they were discussing
   - Connect the elaboration back to the original conversation's purpose or goal

5. **Format**:
   - Write in clear, concise paragraphs
   - Use proper formatting (bold for key terms if helpful, but keep it minimal)
   - Ensure the response reads naturally and is easy to understand
   - Avoid repeating the conversation context verbatim - instead, synthesize and explain

6. **Conclusion**: 
   - End by summarizing how this elaboration relates back to the original conversation
   - Use phrases like "In the context of your conversation about [topic], this means..." or "This is relevant because..."

Conversation context:

`;
    const instructionsSuffix = `

The user wants to elaborate on: "${userQuestion}"

Provide a ${detail.style} explanation (approximately ${detail.length}) that helps the user understand this topic and how it relates to their conversation. Make sure to explain the relevance clearly. Remember to paraphrase and condense your language to meet the length requirement - do not truncate.`;
    
    // Calculate max context length to keep total under limit
    const fixedTextLength = instructionsPrefix.length + instructionsSuffix.length;
    const maxContextLength = Math.max(0, MAX_SYSTEM_MESSAGE_LENGTH - fixedTextLength - 100); // 100 char buffer
    
    // Truncate context if needed
    if (contextText.length > maxContextLength) {
      contextText = contextText.substring(0, maxContextLength) + "\n\n[Context truncated for size...]";
    }
    
    const systemMessageContent = instructionsPrefix + contextText + instructionsSuffix;
    
    messages.push({
      role: "system",
      content: systemMessageContent
    });
    
    console.log("[PromptProfile™] Added chat history context to API call:", {
      originalHistoryLength: llmChatHistory.length,
      truncatedHistoryLength: truncatedHistory.length,
      contextTextLength: contextText.length,
      systemMessageLength: systemMessageContent.length
    });
  } else {
    // Even without LLM chat history, add a system message with detail level instructions
    const systemMessageContent = `You are helping the user with their question.

CRITICAL REQUIREMENT FOR YOUR RESPONSE:

**Response Length (CRITICAL)**: 
${detail.text}

Your response must be ${detail.style} and approximately ${detail.length}.
${detail.examples ? `\n\nExamples: ${detail.examples}` : ''}

IMPORTANT: DO NOT truncate your response mid-thought. Instead, paraphrase and condense your language to meet the length requirement while maintaining all essential information.

Provide a clear, well-organized response that directly addresses the user's question.`;

    messages.push({
      role: "system",
      content: systemMessageContent
    });
    
    console.log("[PromptProfile™] No LLM chat history provided, added system message with detail level instructions");
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
  console.log("[PromptProfile™] ========== sendSideChatMessage CALLED ==========");
  console.log("[PromptProfile™] Message:", message?.substring(0, 50));
  console.log("[PromptProfile™] StateRef:", {
    hasStateRef: !!stateRef,
    hasSettings: !!stateRef?.settings,
    hasConversations: !!stateRef?.conversations,
    conversationsLength: stateRef?.conversations?.length,
    activeConversationId: stateRef?.activeConversationId
  });
  
  // Safety check: Ensure we're in the correct context
  if (!isInSidepanelContext()) {
    console.error('[PromptProfile™] sendSideChatMessage called outside of sidepanel context');
    return stateRef;
  }
  
  const { saveState } = dependencies;
  console.log("[PromptProfile™] Dependencies:", { hasSaveState: typeof saveState === 'function' });
  
  // Ensure settings object exists
  if (!stateRef.settings) {
    console.error("[PromptProfile™] stateRef.settings is missing! Initializing...");
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
    console.warn("[PromptProfile™] Active conversation not found by ID, using first conversation");
  }
  
  console.log("[PromptProfile™] Active conversation:", {
    found: !!activeConversation,
    id: activeConversation?.id,
    historyLength: activeConversation?.history?.length,
    activeConversationId: stateRef.activeConversationId,
    conversationsCount: stateRef.conversations?.length
  });
  
  if (!activeConversation) {
    console.error("[PromptProfile™] No active conversation found when sending message");
    console.error("[PromptProfile™] StateRef conversations:", stateRef?.conversations);
    console.error("[PromptProfile™] Active conversation ID:", stateRef?.activeConversationId);
    return stateRef;
  }
  
  // Ensure history array exists
  if (!Array.isArray(activeConversation.history)) {
    console.warn("[PromptProfile™] Conversation history is not an array, initializing...");
    activeConversation.history = [];
  }

  console.log("[PromptProfile™] Sending message to conversation:", activeConversation.id, "Current history length:", activeConversation.history.length);

  const now = Date.now();
  const userMessage = { role: "user", content: message, timestamp: now };
  console.log("[PromptProfile™] Adding user message to conversation:", {
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
    console.error("[PromptProfile™] CRITICAL: Message was not added to conversation history!", {
      expectedMessage: message.substring(0, 50),
      lastMessageInHistory: verifyAdded?.content?.substring(0, 50),
      historyLength: activeConversation.history.length
    });
  }
  
  console.log("[PromptProfile™] User message added, new history length:", activeConversation.history.length);
  console.log("[PromptProfile™] Last message in history:", {
    role: activeConversation.history[activeConversation.history.length - 1]?.role,
    contentPreview: activeConversation.history[activeConversation.history.length - 1]?.content?.substring(0, 50),
    fullContent: activeConversation.history[activeConversation.history.length - 1]?.content
  });
  
  // CRITICAL: Save state IMMEDIATELY after adding user message, before rendering
  // This ensures the user message is persisted before any re-renders can occur
  if (!saveState || typeof saveState !== 'function') {
    console.error("[PromptProfile™] saveState is not a function in sendSideChatMessage!", typeof saveState);
    console.error("[PromptProfile™] Dependencies:", dependencies);
  } else {
    // Save state synchronously to ensure user message is persisted
    await saveState(stateRef);
    console.log("[PromptProfile™] State saved with user message, history length:", activeConversation.history.length);
  }
  
  // NOW render the chat with the user message included
  // This ensures we're rendering the state that was just saved
  renderChat(activeConversation.history);
  renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
  
  // Ensure chat window scrolls to bottom to show the new message
  setTimeout(() => {
    const chatWindow = document.getElementById("chat-window");
    if (chatWindow) {
      chatWindow.scrollTop = chatWindow.scrollHeight;
      console.log("[PromptProfile™] Scrolled chat window to bottom to show new message");
    }
  }, 50);
  
  console.log("[PromptProfile™] Chat rendered, checking DOM...");
  // Verify the message appears in the DOM
  setTimeout(() => {
    const chatWindow = document.getElementById("chat-window");
    if (chatWindow) {
      const userMessages = chatWindow.querySelectorAll('.chat-message--user');
      console.log("[PromptProfile™] DOM Verification - Found", userMessages.length, "user messages in chat window");
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        const messageText = lastUserMessage.querySelector('.chat-message__bubble')?.textContent || '';
        console.log("[PromptProfile™] Last user message in DOM:", messageText.substring(0, 50));
        
        // Ensure the message is visible by scrolling it into view
        lastUserMessage.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        console.warn("[PromptProfile™] WARNING: No user messages found in DOM after rendering!");
      }
    } else {
      console.error("[PromptProfile™] ERROR: Chat window not found in DOM!");
    }
  }, 100);
  
  console.log("[PromptProfile™] Added user message, new history length:", activeConversation.history.length);

  try {
    // Get the complexity setting from state (maps to levelOfDetail: 1=low, 2=medium, 3=high)
    const levelOfDetail = stateRef.settings?.complexity || 2;
    console.log("[PromptProfile™] Using detail level:", levelOfDetail);
    
    const apiMessages = buildChatApiMessages(activeConversation.history, llmChatHistory, levelOfDetail);
    console.log("[PromptProfile™] Sending to API with", apiMessages.length, "messages");
    if (llmChatHistory.length > 0) {
      console.log("[PromptProfile™] Chat history context included:", llmChatHistory.length, "messages from LLM conversation");
    }
    
    let apiResult;
    try {
      // Always use ChatGPT - model selection removed
      const model = "chatgpt";
      console.log("[PromptProfile™] Using model: chatgpt");
      apiResult = await callOpenAI(apiMessages, llmChatHistory, model);
    } catch (error) {
      console.error("[PromptProfile™] Side chat API call failed:", error);
      const errorMessage = error.message || "Failed to get response";
      
      // Check for authentication errors
      if (errorMessage.includes("No authentication token") || errorMessage.includes("Authentication failed")) {
        alert("Please log in to your PromptProfile™ account to use Side Chat. Click the account button in the header to log in.");
        return stateRef;
      }
      
      // Check for limit reached error
      if (errorMessage === "LIMIT_REACHED") {
        const limitMessage = {
          role: "agent",
          content: 'You used all 10 of your free uses! You\'ll get 10 more tomorrow. If <a href="#" class="sidechat-upgrade-link" style="text-decoration: underline; color: inherit;">upgrade now</a> you can get unlimited uses.',
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
      console.log("[PromptProfile™] Side Chat usage data received:", { enhancementsUsed, enhancementsLimit });
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
        console.log("[PromptProfile™] Updated enhancements count from Side Chat:", enhancementsUsed);
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
            console.log("[PromptProfile™] Usage update message sent (background may not be listening)");
          }
        });
      } catch (error) {
        console.warn("[PromptProfile™] Failed to send usage update message:", error);
      }
    }

    // Re-get the active conversation to ensure we have the latest reference
    const currentActiveConversation = getActiveConversation(stateRef);
    if (!currentActiveConversation) {
      console.error("[PromptProfile™] No active conversation found when adding response");
      return stateRef;
    }
    
    // Verify we're adding to the correct conversation
    if (currentActiveConversation.id !== activeConversation.id) {
      console.warn("[PromptProfile™] Active conversation changed during API call, using current one");
    }
    
    currentActiveConversation.history.push({ role: "agent", content: reply, timestamp: Date.now() });
    renderChat(currentActiveConversation.history);
    console.log("[PromptProfile™] Added agent response, final history length:", currentActiveConversation.history.length);
    
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
      console.log("[PromptProfile™] Generating title for conversation:", currentActiveConversation.id);
      // Generate title asynchronously (don't wait for it to complete)
      generateConversationTitle(stateRef, currentActiveConversation).then((title) => {
        console.log("[PromptProfile™] Generated title:", title, "for conversation:", currentActiveConversation.id);
        if (title && title !== currentActiveConversation.title && title !== "Conversation") {
          currentActiveConversation.title = title;
          renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
          saveState(stateRef).catch((error) => {
            console.warn("Failed to save state after title generation:", error);
          });
        } else {
          console.log("[PromptProfile™] Title not updated - title:", title, "current:", currentActiveConversation.title);
        }
      }).catch((error) => {
        console.warn("Failed to generate conversation title:", error);
      });
    } else {
      console.log("[PromptProfile™] Title generation skipped - needsTitle:", needsTitle, "userMessages:", userMessages.length, "agentMessages:", agentMessages.length);
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
          content: 'You used all 10 of your free uses! You\'ll get 10 more tomorrow. If <a href="#" class="sidechat-upgrade-link" style="text-decoration: underline; color: inherit;">upgrade now</a> you can get unlimited uses.',
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
    console.log(`[PromptProfile™] Deleted ${deletedCount} oldest conversation(s) to maintain limit of ${MAX_CONVERSATIONS}`);
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
    console.error('[PromptProfile™] triggerAutoSideChat called outside of sidepanel context');
    return;
  }
  
  const { saveState } = dependencies;
  
  // CRITICAL: Use pendingSideChat.text as the source of truth if available
  // This ensures we always have the latest text, even if the text parameter is stale
  const textToUse = stateRef?.pendingSideChat?.text?.trim() || (typeof text === "string" ? text.trim() : "");
  const snippet = textToUse;
  
  console.log("[PromptProfile™] triggerAutoSideChat called:", {
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
    console.error("[PromptProfile™] triggerAutoSideChat: Missing snippet or stateRef", {
      snippet: snippet?.substring(0, 50),
      hasStateRef: !!stateRef,
      hasPendingSideChat: !!stateRef?.pendingSideChat,
      pendingText: stateRef?.pendingSideChat?.text?.substring(0, 50)
    });
    return;
  }

  // Check flight flag BEFORE doing anything to prevent duplicates
  if (autoChatInFlight) {
    console.log("[PromptProfile™] Auto chat already in flight, skipping duplicate trigger");
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
      console.error("[PromptProfile™] Active conversation mismatch after creating new one");
      // Force set it
      stateRef.activeConversationId = newConversation.id;
    }
    
    // DON'T render yet - wait until user message is added to avoid race conditions
    // This prevents the user message from disappearing when state is reloaded
    const finalActiveConversation = getActiveConversation(stateRef);
    if (!finalActiveConversation) {
      console.error("[PromptProfile™] Failed to get active conversation after creating new one!");
      console.error("[PromptProfile™] StateRef:", {
        activeConversationId: stateRef.activeConversationId,
        conversationsLength: stateRef.conversations?.length,
        newConversationId: newConversation.id
      });
      autoChatInFlight = false;
      return;
    }
    
    // Don't save state yet - wait until user message is added to save both together
    // This prevents race conditions where state is saved with only welcome message
    console.log("[PromptProfile™] Created new conversation for Elaborate:", newConversation.id, "History length:", finalActiveConversation.history?.length || 0);
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
    console.log("[PromptProfile™] Chat history retrieved:", chatHistoryToUse.length, "messages");
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
    console.log("[PromptProfile™] No chat history found in pendingSideChat");
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
        console.log("[PromptProfile™] Textarea found after", attempts, "attempts");
        break;
      }
    }
    
    if (textarea) {
      textarea.value = snippet;
      // Trigger input event to ensure any listeners are notified
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log("[PromptProfile™] Set textarea value:", snippet.substring(0, 50) + "...");
    } else {
      console.error("[PromptProfile™] Textarea not found after", maxAttempts, "attempts! ID: chat-message");
      autoChatInFlight = false;
      return;
    }
    
    // Verify we have the correct active conversation before sending
    const verifyActiveConversation = getActiveConversation(stateRef);
    if (!verifyActiveConversation) {
      console.error("[PromptProfile™] No active conversation found before sending message");
      autoChatInFlight = false;
      return;
    }
    console.log("[PromptProfile™] Sending message to conversation:", verifyActiveConversation.id, "Snippet length:", snippet.length);
    
    console.log("[PromptProfile™] About to call sendSideChatMessage with:", {
      snippetLength: snippet.length,
      snippetPreview: snippet.substring(0, 100),
      hasDependencies: !!dependencies,
      hasSaveState: typeof dependencies?.saveState === 'function',
      chatHistoryLength: chatHistoryToUse.length,
      activeConversationId: stateRef.activeConversationId
    });
    
    // Verify snippet is not empty before sending
    if (!snippet || snippet.trim().length === 0) {
      console.error("[PromptProfile™] ERROR: Snippet is empty! Cannot send message.", {
        snippet,
        snippetType: typeof snippet,
        snippetLength: snippet?.length
      });
      autoChatInFlight = false;
      return;
    }
    
    try {
      await sendSideChatMessage(stateRef, snippet, dependencies, chatHistoryToUse);
      console.log("[PromptProfile™] Message sent successfully");
      
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
        
        console.log("[PromptProfile™] Verification - Checking conversation:", {
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
            console.error("[PromptProfile™] ERROR: User message content doesn't match!", {
              expectedSnippet: snippetTrimmed.substring(0, 100),
              actualUserMessage: userMessageContentTrimmed.substring(0, 100),
              expectedLength: snippetTrimmed.length,
              actualLength: userMessageContentTrimmed.length,
              match: userMessageContentTrimmed === snippetTrimmed
            });
          } else {
            console.log("[PromptProfile™] ✓ Verification passed - User message was added correctly!");
          }
        } else {
          console.warn("[PromptProfile™] WARNING: Could not find user message in conversation history!", {
            historyLength: historyLength,
            allMessages: verifyConversation.history.map((m, i) => ({
              index: i,
              role: m.role,
              contentPreview: m.content?.substring(0, 30)
            }))
          });
        }
      } else {
        console.error("[PromptProfile™] ERROR: Could not find active conversation for verification!", {
          activeConversationId: stateRef.activeConversationId,
          conversationsCount: stateRef.conversations?.length,
          conversationIds: stateRef.conversations?.map(c => c.id)
        });
      }
    } catch (error) {
      console.error("[PromptProfile™] Error sending message:", error);
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
        console.log("[PromptProfile™] Cleared pendingSideChat after processing");
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
    console.log("[PromptProfile™] processPendingSideChat already in progress, skipping");
    return;
  }
  
  const pending = stateRef?.pendingSideChat;
  if (!pending || typeof pending.text !== "string") {
    return;
  }
  
  // Only process if not already in flight (to avoid conflicts with direct calls)
  if (autoChatInFlight) {
    console.log("[PromptProfile™] Auto chat already in flight, skipping pending side chat");
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
  form: null,
  chatWindow: null
};

/**
 * Handles upgrade link clicks in chat messages
 * @returns {Promise<void>}
 */
async function handleSideChatUpgradeClick() {
  const BACKEND_URL = "https://prompanionce.onrender.com";
  
  try {
    // Get auth token
    const authToken = await chrome.storage.local.get("authToken");
    const token = authToken.authToken;

    if (!token) {
      alert("Please log in to upgrade your plan.");
      return;
    }

    // Create checkout session
    const response = await fetch(`${BACKEND_URL}/api/checkout/create-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || "Failed to create checkout session");
    }

    const data = await response.json();

    // Redirect to Stripe Checkout
    if (data.url) {
      // Open in new tab since we're in a sidepanel
      chrome.tabs.create({ url: data.url });
    } else {
      throw new Error("No checkout URL received");
    }
  } catch (error) {
    console.error("[PromptProfile™ SideChat] Checkout error:", error);
    alert("Failed to start checkout: " + error.message + "\n\nPlease try again or contact support.");
  }
}

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
  const chatWindow = document.getElementById("chat-window");
  
  if (!form || !textarea || !resetButton || !tabsContainer || !saveState) {
    return;
  }
  
  // Set up event delegation for upgrade links in chat messages
  if (chatWindow) {
    // Remove old handler if it exists
    if (handlerStore.chatWindow) {
      chatWindow.removeEventListener("click", handlerStore.chatWindow);
    }
    
    // Create new handler for upgrade link clicks
    handlerStore.chatWindow = (e) => {
      const upgradeLink = e.target.closest(".sidechat-upgrade-link");
      if (upgradeLink) {
        e.preventDefault();
        e.stopPropagation();
        handleSideChatUpgradeClick();
      }
    };
    
    chatWindow.addEventListener("click", handlerStore.chatWindow);
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
  // Always render tabs (they're safe to update)
  renderChatTabs(stateRef.conversations, stateRef.activeConversationId);
  // Only render chat history if we're not in the middle of sending a message (to avoid race conditions)
  // The sendSideChatMessage function will handle rendering after the user message is added and saved
  if (!autoChatInFlight) {
    renderChat(active?.history ?? []);
  }

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



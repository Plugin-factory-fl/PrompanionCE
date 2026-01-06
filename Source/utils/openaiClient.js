/**
 * Backend API Client Utility
 * Handles all backend API calls for the Side Chat functionality
 */

const BACKEND_URL = "https://prompanionce.onrender.com";

/**
 * Gets the authentication token from storage
 * @returns {Promise<string|null>} JWT token or null if not found
 */
async function getAuthToken() {
  try {
    const result = await chrome.storage.local.get("authToken");
    return result.authToken || null;
  } catch (error) {
    console.error("Prompanion: failed to get auth token", error);
    return null;
  }
}

/**
 * Gets the current model setting - always returns "chatgpt"
 * @returns {Promise<string>} Model identifier (always "chatgpt")
 */
async function getModelSetting() {
  // Always use ChatGPT - model selection removed
  return "chatgpt";
}

/**
 * Calls the backend chat API
 * @param {Array} messages - Array of message objects with role and content (already includes system message with context if applicable)
 * @param {Array} chatHistory - Optional LLM chat history for context (deprecated - messages already includes context)
 * @param {string} modelOverride - Optional model to use (takes precedence over storage)
 * @returns {Promise<string>} The assistant's reply content
 * @throws {Error} If the API call fails
 */
export async function callOpenAI(messages, chatHistory = [], modelOverride = null) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("No authentication token. Please log in.");
  }

  // Always use ChatGPT - model selection removed
  const model = "chatgpt";
  console.log("[Prompanion OpenAI Client] Using model for chat: chatgpt");

  // messages array already includes the system message with chat history context from buildChatApiMessages
  // We should use it directly, not mix it with raw chatHistory
  // The last message is the user's current message
  const lastMessage = messages[messages.length - 1];
  
  // Truncate chat history to prevent "request entity too large" errors
  // Limit to most recent messages and truncate if needed
  let chatHistoryForRequest = messages.slice(0, -1); // All messages except the last one
  const MAX_REQUEST_SIZE = 50 * 1024; // 50KB max request body size (reduced from 200KB)
  const MAX_CHAT_HISTORY_MESSAGES = 10; // Absolute maximum messages (reduced from 20)
  
  // First limit message count
  if (chatHistoryForRequest.length > MAX_CHAT_HISTORY_MESSAGES) {
    console.warn(`[Prompanion OpenAI Client] Truncating chat history from ${chatHistoryForRequest.length} to ${MAX_CHAT_HISTORY_MESSAGES} messages`);
    chatHistoryForRequest = chatHistoryForRequest.slice(-MAX_CHAT_HISTORY_MESSAGES);
  }
  
  // Build request body and check size
  let requestBody = {
    message: lastMessage.content,
    chatHistory: chatHistoryForRequest,
    model: model // Include model parameter
  };
  
  let requestBodySize = JSON.stringify(requestBody).length;
  
  // If still too large, truncate system message content
  if (requestBodySize > MAX_REQUEST_SIZE) {
    console.warn(`[Prompanion OpenAI Client] Request body size (${requestBodySize} bytes) exceeds limit, truncating system message`);
    
    const systemMessage = chatHistoryForRequest.find(msg => msg.role === "system");
    if (systemMessage && systemMessage.content) {
      // Truncate system message content to reduce size
      const maxSystemMessageLength = 5000; // 5KB max for system message (reduced from 10KB)
      if (systemMessage.content.length > maxSystemMessageLength) {
        systemMessage.content = systemMessage.content.substring(0, maxSystemMessageLength) + "\n\n[Context truncated for size...]";
        requestBody = {
          message: lastMessage.content,
          chatHistory: chatHistoryForRequest
        };
        requestBodySize = JSON.stringify(requestBody).length;
        console.log(`[Prompanion OpenAI Client] System message truncated, new request size: ${requestBodySize} bytes`);
      }
    }
    
    // If still too large after truncating system message, remove oldest non-system messages
    if (requestBodySize > MAX_REQUEST_SIZE) {
      const nonSystemMessages = chatHistoryForRequest.filter(msg => msg.role !== "system");
      const systemMsg = chatHistoryForRequest.find(msg => msg.role === "system");
      
      let truncatedNonSystem = [...nonSystemMessages];
      while (truncatedNonSystem.length > 0) {
        const testBody = {
          message: lastMessage.content,
          chatHistory: systemMsg ? [systemMsg, ...truncatedNonSystem] : truncatedNonSystem
        };
        const testSize = JSON.stringify(testBody).length;
        if (testSize <= MAX_REQUEST_SIZE) {
          break;
        }
        truncatedNonSystem.shift(); // Remove oldest message
      }
      
      chatHistoryForRequest = systemMsg ? [systemMsg, ...truncatedNonSystem] : truncatedNonSystem;
      requestBody = {
        message: lastMessage.content,
        chatHistory: chatHistoryForRequest
      };
      console.warn(`[Prompanion OpenAI Client] Further truncated to ${chatHistoryForRequest.length} messages, final size: ${JSON.stringify(requestBody).length} bytes`);
    }
  }
  
  // Log for debugging
  console.log("[Prompanion OpenAI Client] Sending messages to API:", {
    totalMessages: messages.length,
    chatHistoryMessages: chatHistoryForRequest.length,
    hasSystemMessage: chatHistoryForRequest.some(msg => msg.role === "system"),
    systemMessagePreview: chatHistoryForRequest.find(msg => msg.role === "system")?.content?.substring(0, 100),
    lastMessageRole: lastMessage?.role,
    lastMessagePreview: lastMessage?.content?.substring(0, 50),
    requestBodySize: JSON.stringify(requestBody).length
  });

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    console.error("[Prompanion OpenAI Client] API error response:", {
      status: response.status,
      statusText: response.statusText,
      error: errorData.error,
      details: errorData.details
    });
    
    if (response.status === 401) {
      throw new Error("Authentication failed. Please log in again.");
    }
    if (response.status === 403) {
      throw new Error("LIMIT_REACHED");
    }
    if (response.status === 413 || (errorData.error && (errorData.error.toLowerCase().includes("entity too large") || errorData.error.toLowerCase().includes("request entity too large")))) {
      throw new Error("Request too large. Please try with a shorter conversation history.");
    }
    
    // Include details if available for better error messages
    const errorMessage = errorData.error || "Failed to get chat response";
    const errorDetails = errorData.details ? `: ${errorData.details}` : "";
    throw new Error(`${errorMessage}${errorDetails}`);
  }

  const data = await response.json();
  const reply = data.message?.trim();
  
  if (!reply) {
    throw new Error("Empty reply from API");
  }
  
  // Return both the reply and usage data if available
  return {
    reply,
    enhancementsUsed: data.enhancementsUsed,
    enhancementsLimit: data.enhancementsLimit
  };
}

/**
 * Generates a conversation title using backend API
 * @param {Array} contextualMessages - Array of message objects to summarize
 * @param {string} fallback - Fallback title if API call fails
 * @returns {Promise<string>} Generated conversation title
 */
export async function generateConversationTitle(contextualMessages, fallback = "Conversation") {
  const token = await getAuthToken();
  if (!token) {
    console.log("[Prompanion] No auth token for title generation, using fallback");
    return fallback.slice(0, 40);
  }

  try {
    // Only use the first few messages to generate title (to avoid token limits)
    const messagesForTitle = contextualMessages.slice(0, 6);
    
    const messages = [
      {
        role: "system",
        content: "Generate a short 3-5 word title for this conversation. Return only the title, nothing else."
      },
      {
        role: "user",
        content: messagesForTitle.map((msg) => `${msg.role}: ${msg.content}`).join("\n")
      }
    ];

    console.log("[Prompanion] Calling OpenAI for title generation with", messagesForTitle.length, "messages");
    const result = await callOpenAI(messages);
    const summary = typeof result === 'string' ? result : result.reply;
    const title = summary ? summary.trim().slice(0, 60) : fallback.slice(0, 60);
    console.log("[Prompanion] Title generation result:", title);
    return title;
  } catch (error) {
    console.error("[Prompanion] Failed to summarize conversation:", error);
    return fallback.slice(0, 60);
  }
}


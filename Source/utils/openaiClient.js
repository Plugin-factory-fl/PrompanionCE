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
 * Calls the backend chat API
 * @param {Array} messages - Array of message objects with role and content (already includes system message with context if applicable)
 * @param {Array} chatHistory - Optional LLM chat history for context (deprecated - messages already includes context)
 * @returns {Promise<string>} The assistant's reply content
 * @throws {Error} If the API call fails
 */
export async function callOpenAI(messages, chatHistory = []) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("No authentication token. Please log in.");
  }

  // messages array already includes the system message with chat history context from buildChatApiMessages
  // We should use it directly, not mix it with raw chatHistory
  // The last message is the user's current message
  const lastMessage = messages[messages.length - 1];
  
  // Log for debugging
  console.log("[Prompanion OpenAI Client] Sending messages to API:", {
    totalMessages: messages.length,
    hasSystemMessage: messages.some(msg => msg.role === "system"),
    systemMessagePreview: messages.find(msg => msg.role === "system")?.content?.substring(0, 100),
    lastMessageRole: lastMessage?.role,
    lastMessagePreview: lastMessage?.content?.substring(0, 50)
  });

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      message: lastMessage.content,
      chatHistory: messages.slice(0, -1) // All messages except the last one (includes system message)
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    if (response.status === 401) {
      throw new Error("Authentication failed. Please log in again.");
    }
    if (response.status === 403) {
      throw new Error("LIMIT_REACHED");
    }
    throw new Error(errorData.error || "Failed to get chat response");
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


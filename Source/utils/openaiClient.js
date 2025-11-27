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
 * @param {Array} messages - Array of message objects with role and content
 * @param {Array} chatHistory - Optional LLM chat history for context
 * @returns {Promise<string>} The assistant's reply content
 * @throws {Error} If the API call fails
 */
export async function callOpenAI(messages, chatHistory = []) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("No authentication token. Please log in.");
  }

  // Combine chat history with current messages
  const allMessages = [...chatHistory, ...messages];
  const lastMessage = allMessages[allMessages.length - 1];

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      message: lastMessage.content,
      chatHistory: allMessages.slice(0, -1) // All messages except the last one
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
    if (response.status === 401) {
      throw new Error("Authentication failed. Please log in again.");
    }
    throw new Error(errorData.error || "Failed to get chat response");
  }

  const data = await response.json();
  const reply = data.message?.trim();
  
  if (!reply) {
    throw new Error("Empty reply from API");
  }
  
  return reply;
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
    return fallback.slice(0, 40);
  }

  try {
    const messages = [
      {
        role: "system",
        content: "You summarize chat conversations in 3-5 words for tabs."
      },
      {
        role: "user",
        content: contextualMessages.map((msg) => `${msg.role}: ${msg.content}`).join("\n")
      }
    ];

    const summary = await callOpenAI(messages);
    return summary ? summary.slice(0, 60) : fallback.slice(0, 60);
  } catch (error) {
    console.error("Failed to summarize conversation", error);
    return fallback.slice(0, 60);
  }
}


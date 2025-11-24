/**
 * OpenAI API Client Utility
 * Handles all OpenAI API calls for the Side Chat functionality
 */

/**
 * Calls the OpenAI Chat Completions API
 * @param {string} apiKey - OpenAI API key
 * @param {Array} messages - Array of message objects with role and content
 * @param {string} model - Model to use (default: "gpt-3.5-turbo")
 * @returns {Promise<string>} The assistant's reply content
 * @throws {Error} If the API call fails
 */
export async function callOpenAI(apiKey, messages, model = "gpt-3.5-turbo") {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  const reply = data.choices?.[0]?.message?.content?.trim();
  
  if (!reply) {
    throw new Error("Empty reply from API");
  }
  
  return reply;
}

/**
 * Generates a conversation title using OpenAI
 * @param {string} apiKey - OpenAI API key
 * @param {Array} contextualMessages - Array of message objects to summarize
 * @param {string} fallback - Fallback title if API call fails
 * @returns {Promise<string>} Generated conversation title
 */
export async function generateConversationTitle(apiKey, contextualMessages, fallback = "Conversation") {
  if (!apiKey) {
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

    const summary = await callOpenAI(apiKey, messages);
    return summary ? summary.slice(0, 60) : fallback.slice(0, 60);
  } catch (error) {
    console.error("Failed to summarize conversation", error);
    return fallback.slice(0, 60);
  }
}


/**
 * Background Service Worker
 * Handles extension state management, API calls, and message routing
 */

const STATE_KEY = "prompanion-sidepanel-state";
const storageArea = chrome.storage?.sync;
const BACKEND_URL = "https://prompanionce.onrender.com";

/**
 * Gets the tab ID from sender or active tab
 * @param {Object} sender - Message sender object
 * @returns {Promise<number|null>} Tab ID or null if unavailable
 */
async function getTabId(sender) {
  if (sender.tab?.id) {
    return sender.tab.id;
  }
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return activeTab?.id;
  } catch (error) {
    console.warn("PromptProfile™: failed to resolve active tab", error);
    return null;
  }
}

/**
 * Reads application state from storage
 * @returns {Promise<Object>} Application state object
 */
async function readState() {
  if (!storageArea) {
    return {};
  }
  const result = await storageArea.get(STATE_KEY);
  return result?.[STATE_KEY] ?? {};
}

/**
 * Writes application state to storage
 * @param {Object} nextState - State object to save
 */
async function writeState(nextState) {
  if (!storageArea) {
    return;
  }
  try {
    await storageArea.set({ [STATE_KEY]: nextState });
  } catch (error) {
    // Don't throw - storage failures shouldn't break enhancements
    // Log the error but continue execution
    console.error("[PromptProfile™ Background] Failed to save state to storage:", error);
    
    // If it's a quota error, try to clean up and retry once
    if (error?.message?.includes("quota") || error?.message?.includes("QUOTA_BYTES")) {
      console.warn("[PromptProfile™ Background] Storage quota exceeded, attempting cleanup...");
      try {
        // Import cleanup function dynamically
        const { cleanupStorage } = await import("./scripts/storageCleanup.js");
        const cleanupResult = await cleanupStorage();
        if (cleanupResult.cleaned) {
          console.log("[PromptProfile™ Background] Cleanup completed, retrying save...");
          // Retry once after cleanup
          try {
            await storageArea.set({ [STATE_KEY]: nextState });
            console.log("[PromptProfile™ Background] State saved after cleanup");
          } catch (retryError) {
            console.error("[PromptProfile™ Background] Still can't save after cleanup:", retryError);
            // Don't throw - enhancement should still work
          }
        }
      } catch (cleanupError) {
        console.error("[PromptProfile™ Background] Cleanup failed:", cleanupError);
        // Don't throw - enhancement should still work
      }
    }
    // Don't re-throw - allow enhancement to complete even if storage fails
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) {
    return;
  }

  await togglePanel(tab.id);
});

/**
 * Sends a message to a tab, with fallback injection if needed
 * @param {number} tabId - Target tab ID
 * @param {string} messageType - Message type to send
 * @returns {Promise<boolean>} Success status
 */
async function sendMessageToTab(tabId, messageType) {
  if (!tabId) {
    return false;
  }

  try {
    await chrome.tabs.sendMessage(tabId, { type: messageType });
    return true;
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["scripts/injector.js"]
      });
      await chrome.tabs.sendMessage(tabId, { type: messageType });
      return true;
    } catch (injectError) {
      console.error(`PromptProfile™: unable to ${messageType.toLowerCase()} panel`, injectError);
      return false;
    }
  }
}

/**
 * Toggles the side panel visibility
 * @param {number} tabId - Target tab ID
 */
async function togglePanel(tabId) {
  await sendMessageToTab(tabId, "PROMPANION_TOGGLE_PANEL");
}

/**
 * Opens the side panel
 * @param {number} tabId - Target tab ID
 */
async function openPanel(tabId) {
  await sendMessageToTab(tabId, "PROMPANION_OPEN_PANEL");
}

/**
 * Builds an adaptive system prompt based on model, output type, and level of detail
 * Follows published guidelines from major LLM companies
 * @param {string} model - Model identifier (chatgpt, gemini, claude, grok)
 * @param {string} outputType - Output type (text, image, video, code)
 * @param {number} levelOfDetail - Level of detail (1=low, 2=medium, 3=high)
 * @returns {string} System prompt tailored to the settings
 */
function buildSystemPrompt(model, outputType, levelOfDetail) {
  const detailInstructions = {
    1: {
      text: "Keep responses concise and to-the-point. Focus on clarity and brevity. Avoid unnecessary elaboration.",
      style: "brief, direct, and action-oriented",
      length: "short and focused"
    },
    2: {
      text: "Provide clear, concise responses. The enhanced prompt must be exactly 5-7 sentences total - clear and focused.",
      style: "clear, concise, and exactly 5-7 sentences",
      length: "exactly 5-7 sentences total"
    },
    3: {
      text: "Provide well-structured responses with clear organization. Include necessary context and explanations.",
      style: "balanced, informative, and well-organized",
      length: "moderate length with good structure"
    }
  };

  const detail = detailInstructions[levelOfDetail] || detailInstructions[2];
  
  // Base prompt structure for all models
  let basePrompt = `You are an expert at refining and enhancing prompts for AI language models. Your task is to take a user's original prompt and create two distinct, improved versions that are more effective, clear, and likely to produce better results.\n\n`;

  // Model-specific guidelines based on published best practices with explicit, detailed instructions
  const modelGuidelines = {
    chatgpt: {
      base: "Following OpenAI's official prompt engineering best practices, create prompts that:\n" +
            "1. STRUCTURE: Place clear, specific instructions at the BEGINNING of the prompt, before any context or data. Organize the prompt logically with instructions first, then context (but do NOT include delimiters like ### in the final enhanced prompt - just organize it naturally).\n" +
            "2. SPECIFICITY: Be extremely explicit about what you want. Instead of vague requests, specify exact requirements: desired length (word count or paragraph count), tone (formal, casual, technical), style (narrative, bullet points, structured), and format (paragraph, list, table, code).\n" +
            "3. STEP-BY-STEP: Break down complex tasks into numbered steps or bullet points. If the task has multiple parts, list them explicitly: Step 1, Step 2, etc.\n" +
            "4. EXAMPLES: When possible, include 1-2 examples of the desired output format or style. Show what 'good' looks like with concrete examples.\n" +
            "5. CONSTRAINTS: Explicitly state any constraints, limitations, or requirements. Be specific about what should be included or excluded.\n" +
            "6. FORMATTING: Use clear headings, bullet points, or numbered lists to organize instructions. Structure the prompt hierarchically.\n" +
            "7. CONTEXT: After instructions, provide necessary context or background information. Clearly separate instructions from context using delimiters.\n",
      approach: "Use OpenAI's structured approach: Start with explicit instructions, break complex tasks into steps, use delimiters to separate sections, include examples when helpful, and specify exact output requirements (length, format, tone, style)."
    },
    claude: {
      base: "Following Anthropic's official Claude prompt engineering guidelines, create prompts that:\n" +
            "1. CLARITY: Be clear and direct - write instructions as if explaining to someone new to the task. Avoid ambiguity or implied meanings. State exactly what you need.\n" +
            "2. STRUCTURE: Organize the prompt clearly with logical sections, but do NOT include XML-style tags like <instructions> or <context> in the final enhanced prompt. Just organize the content naturally and clearly.\n" +
            "3. ROLE ASSIGNMENT: Clearly assign a role or persona at the beginning (e.g., 'You are an expert technical writer'). This helps Claude understand the context and appropriate style.\n" +
            "4. COMPREHENSIVE CONTEXT: Provide rich, detailed context. Claude performs better with more information rather than less. Include background, purpose, target audience, and relevant details.\n" +
            "5. CHAIN-OF-THOUGHT: For complex tasks, ask Claude to think step-by-step or show its reasoning. Phrasing like 'Let's think through this step by step' improves accuracy.\n" +
            "6. EXAMPLES: Include 1-2 concrete examples to illustrate the desired output. Claude learns from examples and can match style and format effectively.\n" +
            "7. EXPLICIT FORMATTING: Clearly specify the output format, structure, and any required elements. Don't assume Claude knows the format - be explicit.\n",
      approach: "Use Anthropic's direct approach: Be crystal clear and direct in instructions, use XML tags for structure, assign explicit roles, provide comprehensive context, encourage step-by-step reasoning, and include concrete examples to guide output."
    },
    gemini: {
      base: "Following Google's official Gemini prompt engineering best practices, create prompts that:\n" +
            "1. STRUCTURED ORGANIZATION: Organize prompts with clear logical flow and natural structure. Use clear organization but do NOT include section separators like ---, ===, or ### in the final enhanced prompt.\n" +
            "2. EXPLICIT EXAMPLES: Include clear examples naturally within the prompt flow if helpful. Examples should be integrated naturally, not in separate sections.\n" +
            "3. FORMAT SPECIFICATION: Explicitly state the output format naturally within the prompt text (e.g., 'provide as bullet points' or 'write in paragraph form'), without using format labels or separators.\n" +
            "4. NATURAL FLOW: Organize content logically with natural transitions, but avoid visual separators or section headers in the final prompt.\n" +
            "5. CONTEXTUAL DETAIL: Provide detailed context about the task, including purpose, audience, constraints, and relevant background information.\n" +
            "6. STEP-BY-STEP BREAKDOWN: For complex requests, break into numbered steps or phases. Gemini follows sequential instructions well.\n" +
            "7. SPECIFIC CONSTRAINTS: Clearly state length requirements, style guidelines, tone preferences, and any elements that must be included or excluded.\n",
      approach: "Use Google's structured approach: Organize prompts with clear headings and sections, provide multiple concrete examples, use visual separators, explicitly state output format, include detailed context, and break complex tasks into sequential steps."
    },
    grok: {
      base: "Following conversational AI best practices optimized for Grok, create prompts that:\n" +
            "1. DIRECTNESS: Be direct and straightforward. Get to the point quickly without excessive preamble. Grok responds best to clear, unambiguous requests.\n" +
            "2. NATURAL LANGUAGE: Use natural, conversational phrasing rather than overly formal or technical language. Write as you would speak to a knowledgeable colleague.\n" +
            "3. CONTEXT EFFICIENCY: Provide necessary context concisely. Be thorough but not verbose. Include what's needed without unnecessary details.\n" +
            "4. ACTIONABLE INSTRUCTIONS: Focus on practical, actionable outcomes. Clearly state what needs to be accomplished and why.\n" +
            "5. SPECIFIC REQUIREMENTS: Be explicit about requirements (length, format, tone) but phrase them naturally rather than in a rigid, structured format.\n" +
            "6. CONCRETE EXAMPLES: Include 1-2 examples to illustrate what you want, formatted naturally within the conversational flow.\n" +
            "7. CLEAR EXPECTATIONS: State what success looks like. Be specific about the desired output format and quality without over-structuring the prompt.\n",
      approach: "Use a direct, natural approach: Write prompts conversationally and directly, provide context efficiently, focus on actionable outcomes, be explicit about requirements naturally, include examples within the flow, and clearly state success criteria."
    }
  };

  const modelGuideline = modelGuidelines[model] || modelGuidelines.chatgpt;

  // Output type specific instructions
  const outputInstructions = {
    text: {
      focus: "enhance the prompt for text generation",
      considerations: "Consider the desired tone, style, structure, length, and audience for the text output."
    },
    image: {
      focus: "enhance the prompt for image generation",
      considerations: "Include specific details about visual elements, composition, style, colors, mood, lighting, and any technical specifications needed for image generation."
    },
    video: {
      focus: "enhance the prompt for video generation",
      considerations: "Include details about scenes, transitions, pacing, visual style, audio considerations, duration, and narrative flow."
    },
    code: {
      focus: "enhance the prompt for code generation",
      considerations: "Focus on producing clean, modular, maintainable code for software developers. The enhanced prompt should specify: " +
        "1. Programming language and version (e.g., Python 3.11, JavaScript ES6+, TypeScript 5.0) " +
        "2. Code structure requirements (functions, classes, modules, file organization) " +
        "3. Error handling approach (try-catch, error types, validation) " +
        "4. Code style and conventions (PEP 8, ESLint, naming conventions, formatting) " +
        "5. Testing requirements (unit tests, test frameworks, coverage expectations) " +
        "6. Documentation needs (inline comments, docstrings, README requirements) " +
        "7. Performance considerations (optimization needs, time/space complexity) " +
        "8. Security requirements (input validation, sanitization, authentication) " +
        "9. Specific frameworks, libraries, or design patterns to use " +
        "10. Best practices emphasis: DRY (Don't Repeat Yourself), SOLID principles, separation of concerns, code reusability, and maintainability. " +
        "The prompt should guide the LLM to generate production-ready, well-structured code that follows industry standards and is easy for other developers to understand and maintain."
    }
  };

  const outputInfo = outputInstructions[outputType] || outputInstructions.text;

  // Build the complete system prompt
  const systemPrompt = basePrompt +
    modelGuideline.base + "\n" +
    `Current task: ${outputInfo.focus}.\n\n` +
    `CRITICAL REQUIREMENT: Both Option A and Option B MUST be at the EXACT SAME level of detail. ` +
    `Level of detail setting: ${detail.text}\n` +
    `This means if the setting is LOW, BOTH prompts must be brief and concise. ` +
    `If the setting is HIGH, BOTH prompts must be comprehensive and detailed. ` +
    `If the setting is MEDIUM, BOTH prompts must be moderate in length with good structure.\n\n` +
    `Option A should focus on: clarity, specificity, and structure. Make it more precise and easier for the AI to understand exactly what is needed. ` +
    `The prompt must be ${detail.style} and ${detail.length} - matching the level of detail setting exactly.\n\n` +
    `Option B should focus on: a different enhancement approach (alternative framing, perspective, or methodology) while maintaining the EXACT SAME level of detail as Option A. ` +
    `Do NOT add more context, examples, or constraints that would make Option B longer than Option A. ` +
    `This version must also be ${detail.style} and ${detail.length} - the same as Option A. ` +
    `${outputInfo.considerations}\n\n` +
    `Both versions should be complete, standalone prompts that improve upon the original. ` +
    `Both must match the selected level of detail - they should be approximately the same length and depth. ` +
    `Follow ${modelGuideline.approach} ` +
    `The enhanced prompts should both be ${detail.style} and ${detail.length}.\n\n` +
    `CRITICAL: The enhanced prompts you create should be clean, natural prompts that users can copy and paste directly. ` +
    `Do NOT include structural markers like "###Instructions:", "###Task:", "###", XML tags like <instructions>, or any delimiters in the final prompts. ` +
    `The delimiters and structural markers mentioned above are for YOUR understanding of how to structure prompts - they should NOT appear in the user's final enhanced prompts. ` +
    `The enhanced prompts should read naturally without any formatting markers or section headers. ` +
    `Do not add explanations or meta-commentary - just provide the enhanced prompts.\n\n` +
    `Reply ONLY with valid JSON in this exact format: {"optionA":"enhanced prompt A here","optionB":"enhanced prompt B here"}`;

  return systemPrompt;
}

/**
 * Gets the authentication token from storage
 * @returns {Promise<string|null>} JWT token or null if not found
 */
async function getAuthToken() {
  try {
    const result = await chrome.storage.local.get("authToken");
    return result.authToken || null;
  } catch (error) {
    console.error("PromptProfile™: failed to get auth token", error);
    return null;
  }
}

/**
 * Generates an enhanced version of a prompt using backend API
 * @param {string} promptText - Original prompt text
 * @param {Object} settings - User settings (model, output, complexity)
 * @returns {Promise<Object>} Object with optionA enhanced prompt
 */
async function generateEnhancements(promptText, settings = {}) {
  const fallbackA = `${promptText}\n\nRefined focus: clarify intent and add a persuasive closing.`;

  const token = await getAuthToken();
  if (!token) {
    return { optionA: fallbackA, error: "NO_AUTH_TOKEN" };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/enhance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        prompt: promptText,
        model: settings.model || "chatgpt",
        outputType: settings.output || "text",
        levelOfDetail: settings.complexity || 2
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      
      if (response.status === 401) {
        return { optionA: fallbackA, error: "UNAUTHORIZED" };
      }
      
      if (response.status === 403) {
        return { optionA: fallbackA, error: "LIMIT_REACHED" };
      }
      
      throw new Error(errorData.error || "Failed to enhance prompt");
    }

    const data = await response.json();
    const optionA = typeof data.optionA === "string" ? data.optionA.trim() : fallbackA;
    // Include usage data if available from API response
    return { 
      optionA, 
      enhancementsUsed: data.enhancementsUsed,
      enhancementsLimit: data.enhancementsLimit
    };
  } catch (error) {
    console.error("PromptProfile™: enhancement generation failed", error);
    const errorMessage = error.message || String(error);
    return { optionA: promptText, error: "API_ERROR" };
  }
}

/**
 * Builds a system prompt for regenerating an existing enhanced prompt
 * @param {string} model - Model identifier (chatgpt, gemini, claude, grok)
 * @param {string} outputType - Output type (text, image, video, code)
 * @param {number} levelOfDetail - Level of detail (1=low, 2=medium, 3=high)
 * @returns {string} System prompt for regeneration
 */
function buildRegenerateSystemPrompt(model, outputType, levelOfDetail) {
  const detailInstructions = {
    1: "Keep it concise and to-the-point. Focus on clarity and brevity.",
    2: "Provide clear, organized re-wording with helpful context.",
    3: "Provide well-structured re-wording with clear organization and necessary explanations."
  };

  const detail = detailInstructions[levelOfDetail] || detailInstructions[2];

  const modelGuidelines = {
    chatgpt: "Following OpenAI's guidelines: use clear structure, break down instructions, and be explicit.",
    claude: "Following Anthropic's guidelines: be clear, direct, and provide rich context.",
    gemini: "Following Google's guidelines: structure clearly with good organization and explicit formatting.",
    grok: "Following xAI's guidelines: be direct, natural, and focused on practical outcomes."
  };

  const modelGuideline = modelGuidelines[model] || modelGuidelines.chatgpt;

  return `You are an expert at re-wording and refining prompts for AI language models. Your task is to take an existing enhanced prompt and re-word it to be more clear, precise, and effective while maintaining the same intent and meaning.\n\n` +
    `${modelGuideline}\n\n` +
    `Improve the prompt by:\n` +
    `- Using clearer, more direct language\n` +
    `- Improving sentence structure and flow\n` +
    `- Enhancing specificity where needed\n` +
    `- Making it more concise without losing important details\n` +
    `- Ensuring it's easy for an AI to understand and execute\n\n` +
    `${detail}\n\n` +
    `Do not add explanations or meta-commentary - just provide the re-worded prompt. Return ONLY the improved prompt text, nothing else.`;
}

/**
 * Regenerates a single enhanced prompt by taking a markedly different approach
 * @param {string} originalPrompt - The original user prompt
 * @param {string} currentEnhanced - The current enhanced prompt to regenerate
 * @param {Object} settings - User settings (model, output, complexity)
 * @returns {Promise<string>} Regenerated prompt text with different approach
 */
async function regenerateEnhancement(originalPrompt, currentEnhanced, settings = {}) {
  const fallback = `${currentEnhanced}\n\n(Regenerated with a different approach.)`;

  const token = await getAuthToken();
  if (!token) {
    return fallback;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/enhance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        prompt: originalPrompt, // Use original prompt, not the enhanced one
        model: settings.model || "chatgpt",
        outputType: settings.output || "text",
        levelOfDetail: settings.complexity || 2,
        regenerate: true, // Flag to indicate regeneration
        currentEnhanced: currentEnhanced // Pass current enhanced version for comparison
      })
    });

    if (!response.ok) {
      throw new Error("Failed to regenerate enhancement");
    }

    const data = await response.json();
    // Return optionA (only option now)
    return typeof data.optionA === "string" ? data.optionA.trim() : fallback;
  } catch (error) {
    console.error("PromptProfile™: regeneration failed", error);
    return fallback;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[PromptProfile™ Background] ========== MESSAGE RECEIVED ==========");
  console.log("[PromptProfile™ Background] Message type:", message?.type);
  console.log("[PromptProfile™ Background] Message:", message);
  console.log("[PromptProfile™ Background] Sender:", sender);
  
  if (!message || typeof message !== "object") {
    console.log("[PromptProfile™ Background] Invalid message, ignoring");
    return;
  }

  if (message.type === "PROMPANION_SIDECHAT_REQUEST") {
    // Return true to keep the message channel open for async response
    (async () => {
      try {
        console.log("[PromptProfile™ Background] ========== PROMPANION_SIDECHAT_REQUEST RECEIVED ==========");
        const snippet =
          typeof message.text === "string" ? message.text.trim() : "";
        if (!snippet) {
          sendResponse?.({ ok: false, reason: "EMPTY_TEXT" });
          return;
        }

        // Extract chat history from message (if provided) - don't store it, just pass it through
        const chatHistory = Array.isArray(message.chatHistory) ? message.chatHistory : [];
        console.log("[PromptProfile™ Background] Received chat history:", {
          isArray: Array.isArray(message.chatHistory),
          length: chatHistory.length,
          hasChatHistory: chatHistory.length > 0,
          firstMessage: chatHistory[0] ? {
            role: chatHistory[0].role,
            contentPreview: chatHistory[0].content?.substring(0, 50)
          } : null
        });

        // Store only the text snippet, NOT the chat history (to save storage space)
        let nextState = null;
        try {
          const currentState = await readState();
          nextState = {
            ...currentState,
            pendingSideChat: {
              text: snippet,
              // Don't store chatHistory - it will be passed directly in the message
              timestamp: Date.now()
            }
          };
          console.log("[PromptProfile™ Background] Storing pendingSideChat (text only, no chat history)");
          await writeState(nextState);
        } catch (error) {
          // If storage fails (quota exceeded), continue anyway - we'll send the data directly
          console.warn("[PromptProfile™ Background] Failed to save state (storage may be full), continuing with direct message:", error.message);
          // Try to get current state for STATE_PUSH, but don't fail if it doesn't work
          try {
            nextState = await readState();
            nextState.pendingSideChat = {
              text: snippet,
              timestamp: Date.now()
            };
          } catch (readError) {
            console.warn("[PromptProfile™ Background] Could not read state either, will skip STATE_PUSH:", readError.message);
          }
        }
        
        const tabId = await getTabId(sender);
        if (tabId) {
          // Open panel FIRST, then send messages
          await openPanel(tabId);
          
          // Wait a bit for panel to initialize before sending messages
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Always send the messages directly with chat history - don't store it, just pass it through
        // This ensures chat history is delivered without using storage space
        if (nextState) {
          chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        }
        chrome.runtime.sendMessage({
          type: "PROMPANION_SIDECHAT_DELIVER",
          text: snippet,
          chatHistory: chatHistory, // Pass history directly - not stored, just passed through
          clearPending: true
        });
        
        sendResponse?.({ ok: true });
      } catch (error) {
        console.error("[PromptProfile™ Background] PROMPANION_SIDECHAT_REQUEST error:", error);
        sendResponse?.({ ok: false, reason: "ERROR", error: error.message });
      }
    })();
    return true; // Keep the message channel open for async response
  }

  if (message.type === "PROMPANION_REQUEST_STATE") {
    (async () => {
      try {
        const state = await readState();
        sendResponse?.({ ok: true, state });
      } catch (error) {
        console.error("Prompanion: failed to read state for panel request", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_PREPARE_ENHANCEMENT") {
    (async () => {
      try {
        const promptText =
          typeof message.prompt === "string" ? message.prompt : "";
        console.log("[PromptProfile™ Background] PROMPANION_PREPARE_ENHANCEMENT received, prompt:", promptText);
        const currentState = await readState();
        const settings = {
          model: currentState.settings?.model || "chatgpt",
          output: currentState.settings?.output || "text",
          complexity: currentState.settings?.complexity || 2
        };
        console.log("[PromptProfile™ Background] ========== ENHANCEMENT REQUEST ==========");
        console.log("[PromptProfile™ Background] Current state settings:", currentState.settings);
        console.log("[PromptProfile™ Background] Using settings for API call:", settings);
        console.log("[PromptProfile™ Background] Model selected:", settings.model);
        const result = await generateEnhancements(promptText, settings);
        const { optionA, error, enhancementsUsed, enhancementsLimit } = result;
        console.log("[PromptProfile™ Background] Enhancement result - optionA:", optionA, "error:", error, "usage:", { enhancementsUsed, enhancementsLimit });
        
        // Only update state and open panel if there's no error
        if (!error) {
          const nextState = {
            ...currentState,
            originalPrompt: promptText,
            optionA
          };
          console.log("[PromptProfile™ Background] Next state prepared:", { 
            originalPrompt: nextState.originalPrompt?.substring(0, 50), 
            optionA: nextState.optionA?.substring(0, 50)
          });
          
          // CRITICAL: Save state BEFORE sending response to ensure prompts are persisted
          try {
            await writeState(nextState);
            console.log("[PromptProfile™ Background] ========== STATE SAVED TO STORAGE ==========");
            
            // Verify the save by reading back from storage
            const verifyState = await readState();
            if (verifyState.originalPrompt === promptText && verifyState.optionA === optionA) {
              console.log("[PromptProfile™ Background] ✓ Storage save verified - prompts are persisted");
            } else {
              console.warn("[PromptProfile™ Background] ⚠️ Storage verification failed - prompts may not match");
            }
          } catch (storageError) {
            // Log but don't throw - enhancement should still work
            console.error("[PromptProfile™ Background] Failed to save state, but enhancement completed:", storageError);
          }
          
          // Send STATE_PUSH message to update sidepanel if it's open
          console.log("[PromptProfile™ Background] Sending PROMPANION_STATE_PUSH message");
          chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState }, (response) => {
            if (chrome.runtime.lastError) {
              // This is normal if sidepanel isn't loaded yet - state is saved to storage
              console.log("[PromptProfile™ Background] STATE_PUSH message sent (sidepanel may not be loaded yet):", chrome.runtime.lastError.message);
            } else {
              console.log("[PromptProfile™ Background] ✓ STATE_PUSH message sent successfully - sidepanel updated");
            }
          });
          
          // Send usage update
          if (enhancementsUsed !== undefined && enhancementsLimit !== undefined) {
            chrome.runtime.sendMessage({ 
              type: "PROMPANION_USAGE_UPDATE", 
              enhancementsUsed,
              enhancementsLimit 
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.log("[PromptProfile™ Background] Usage update message sent (sidepanel may not be open)");
              } else {
                console.log("[PromptProfile™ Background] Usage update message sent successfully");
              }
            });
          }
          
          // Open panel if requested
          if (message.openPanel !== false) {
            const tabId = await getTabId(sender);
            if (tabId) {
              await openPanel(tabId);
            } else {
              console.warn("Prompanion: could not toggle panel, no tabId resolved");
            }
          }
        }
        
        // Send response AFTER state is saved and messages are sent
        sendResponse?.({ 
          ok: !error, 
          optionA, 
          error,
          enhancementsUsed, // Pass through usage data
          enhancementsLimit
        });
      } catch (error) {
        console.error("Prompanion: failed to prepare enhancement", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN", error: "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_REGENERATE_ENHANCEMENT") {
    (async () => {
      try {
        const currentEnhanced = typeof message.prompt === "string" ? message.prompt.trim() : "";
        if (!currentEnhanced) {
          if (sendResponse) {
            sendResponse({ ok: false, reason: "EMPTY_PROMPT" });
          }
          return;
        }

        const currentState = await readState();
        const originalPrompt = currentState.originalPrompt || "";
        if (!originalPrompt) {
          if (sendResponse) {
            sendResponse({ ok: false, reason: "NO_ORIGINAL_PROMPT" });
          }
          return;
        }

        const settings = {
          model: currentState.settings?.model || "chatgpt",
          output: currentState.settings?.output || "text",
          complexity: currentState.settings?.complexity || 2
        };
        
        // Regenerate with different approach - pass original prompt and current enhanced version
        const regenerated = await regenerateEnhancement(originalPrompt, currentEnhanced, settings);
        
        // Update optionA (only option now)
          const nextState = {
            ...currentState,
          optionA: regenerated
          };
          await writeState(nextState);
          chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        
        if (sendResponse) {
          sendResponse({ ok: true, regenerated });
        }
      } catch (error) {
        console.error("Prompanion: failed to regenerate enhancement", error);
        if (sendResponse) {
          sendResponse({ ok: false, reason: error?.message ?? "UNKNOWN" });
        }
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_TOGGLE_PANEL") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse?.({ ok: false, reason: "NO_TAB" });
      return;
    }

    togglePanel(tabId)
      .then(() => sendResponse?.({ ok: true }))
      .catch((error) => {
        console.error("Prompanion: toggle from message failed", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      });

    return true;
  }

  if (message.type === "PROMPANION_OPEN_PANEL") {
    (async () => {
      try {
        const tabId = await getTabId(sender);
        if (!tabId) {
          sendResponse?.({ ok: false, reason: "NO_TAB" });
          return;
        }
        await openPanel(tabId);
        sendResponse?.({ ok: true });
      } catch (error) {
        console.error("Prompanion: open panel message failed", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_INSERT_TEXT") {
    console.log("[PromptProfile™ Background] ========== PROMPANION_INSERT_TEXT RECEIVED ==========");
    console.log("[PromptProfile™ Background] Text to insert:", typeof message.text === "string" ? message.text.substring(0, 50) + "..." : "invalid");
    console.log("[PromptProfile™ Background] Sender:", sender);
    (async () => {
      try {
        const textToInsert = typeof message.text === "string" ? message.text.trim() : "";
        if (!textToInsert) {
          console.log("[PromptProfile™ Background] Empty text, returning error");
          sendResponse?.({ ok: false, reason: "EMPTY_TEXT" });
          return;
        }

        // Try to get tab from sender first (if message came from a tab)
        let targetTabId = sender?.tab?.id;
        console.log("[PromptProfile™ Background] Sender tab ID:", targetTabId);
        
        // If no tab from sender, find ChatGPT tab
        if (!targetTabId) {
          try {
            console.log("[PromptProfile™ Background] No sender tab, searching for ChatGPT tab...");
            // First try to find active ChatGPT tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log("[PromptProfile™ Background] Active tab:", activeTab?.url);
            if (activeTab && activeTab.url && (
              activeTab.url.includes("chatgpt.com") || 
              activeTab.url.includes("chat.openai.com")
            )) {
              targetTabId = activeTab.id;
              console.log("[PromptProfile™ Background] Using active ChatGPT tab:", targetTabId);
            } else {
              // Fallback: find any ChatGPT tab
              console.log("[PromptProfile™ Background] Active tab is not ChatGPT, searching all tabs...");
              const tabs = await chrome.tabs.query({
                url: [
                  "https://chatgpt.com/*",
                  "https://*.chatgpt.com/*",
                  "https://chat.openai.com/*",
                  "https://*.chat.openai.com/*"
                ]
              });
              console.log("[PromptProfile™ Background] Found ChatGPT tabs:", tabs.length);
              if (tabs.length > 0) {
                // Prefer active tab, otherwise use first one
                targetTabId = tabs.find(tab => tab.active)?.id || tabs[0].id;
                console.log("[PromptProfile™ Background] Selected tab ID:", targetTabId);
              }
            }
          } catch (queryError) {
            console.error("[PromptProfile™ Background] Failed to query tabs:", queryError);
          }
        }

        if (!targetTabId) {
          console.log("[PromptProfile™ Background] No ChatGPT tab found, returning error");
          sendResponse?.({ ok: false, reason: "NO_CHATGPT_TAB" });
          return;
        }

        // Send message to adapter.js content script
        console.log("[PromptProfile™ Background] Sending message to tab:", targetTabId);
        console.log("[PromptProfile™ Background] Message payload:", { type: "PROMPANION_INSERT_TEXT", text: textToInsert.substring(0, 50) + "..." });
        
        // Check if content script is loaded by trying to query the tab
        try {
          const tab = await chrome.tabs.get(targetTabId);
          console.log("[PromptProfile™ Background] Tab info:", { id: tab.id, url: tab.url, status: tab.status });
        } catch (tabError) {
          console.error("[PromptProfile™ Background] Failed to get tab info:", tabError);
        }
        
        try {
          // Use a timeout to detect if adapter doesn't respond
          const responsePromise = chrome.tabs.sendMessage(targetTabId, {
            type: "PROMPANION_INSERT_TEXT",
            text: textToInsert
          });
          
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("TIMEOUT: Adapter did not respond within 5 seconds")), 5000);
          });
          
          const response = await Promise.race([responsePromise, timeoutPromise]);
          console.log("[PromptProfile™ Background] Received response from adapter:", response);
          console.log("[PromptProfile™ Background] Response type:", typeof response);
          console.log("[PromptProfile™ Background] Response is null/undefined:", response === null || response === undefined);
          
          if (!response) {
            console.error("[PromptProfile™ Background] Adapter returned null/undefined response!");
            sendResponse?.({ ok: false, reason: "NO_RESPONSE_FROM_ADAPTER" });
            return;
          }
          
          sendResponse?.(response);
        } catch (error) {
          console.error("[PromptProfile™ Background] Failed to send insert message to tab:", error);
          console.error("[PromptProfile™ Background] Error name:", error.name);
          console.error("[PromptProfile™ Background] Error message:", error.message);
          console.error("[PromptProfile™ Background] Error stack:", error.stack);
          
          // Check if error is because content script isn't ready
          if (error.message?.includes("Could not establish connection") || 
              error.message?.includes("Receiving end does not exist") ||
              error.message?.includes("Extension context invalidated") ||
              error.message?.includes("TIMEOUT")) {
            console.log("[PromptProfile™ Background] Adapter not ready - content script may not be loaded or not responding");
            console.log("[PromptProfile™ Background] This usually means:");
            console.log("[PromptProfile™ Background] 1. The content script hasn't loaded yet");
            console.log("[PromptProfile™ Background] 2. The content script's message listener isn't registered");
            console.log("[PromptProfile™ Background] 3. The content script is in a different frame/context");
            sendResponse?.({ ok: false, reason: "ADAPTER_NOT_READY" });
          } else {
            console.log("[PromptProfile™ Background] Send failed with unexpected error:", error.message);
            sendResponse?.({ ok: false, reason: error?.message ?? "SEND_FAILED" });
          }
        }
      } catch (error) {
        console.error("[PromptProfile™ Background] Insert text message failed:", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }

  if (message.type === "PROMPANION_CHECKOUT_REQUEST") {
    // Return true to keep the message channel open for async response
    (async () => {
      try {
        console.log("[PromptProfile™ Background] ========== PROMPANION_CHECKOUT_REQUEST RECEIVED ==========");
        
        // Get auth token from storage
        const token = await getAuthToken();
        if (!token) {
          sendResponse?.({ ok: false, error: "Please log in to upgrade your plan. Open the extension sidepanel to log in." });
          return;
        }

        // Make API call to create checkout session
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
        console.log("[PromptProfile™ Background] Checkout session created:", data);

        if (data.url) {
          // Open checkout URL in new tab
          chrome.tabs.create({ url: data.url });
          sendResponse?.({ ok: true, url: data.url });
        } else {
          throw new Error("No checkout URL received");
        }
      } catch (error) {
        console.error("[PromptProfile™ Background] Checkout error:", error);
        sendResponse?.({ ok: false, error: error.message || "Failed to start checkout" });
      }
    })();
    return true; // Keep the message channel open for async response
  }
});


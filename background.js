/**
 * Background Service Worker
 * Handles extension state management, API calls, and message routing
 */

const STATE_KEY = "prompanion-sidepanel-state";
const storageArea = chrome.storage?.sync;

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
    console.warn("Prompanion: failed to resolve active tab", error);
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
  await storageArea.set({ [STATE_KEY]: nextState });
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
      console.error(`Prompanion: unable to ${messageType.toLowerCase()} panel`, injectError);
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
      text: "Provide well-structured responses with clear organization. Include necessary context and explanations.",
      style: "balanced, informative, and well-organized",
      length: "moderate length with good structure"
    },
    3: {
      text: "Provide comprehensive, detailed responses with extensive context, examples, and thorough explanations.",
      style: "comprehensive, detailed, and thorough",
      length: "extensive and comprehensive"
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
 * Generates two enhanced versions of a prompt using OpenAI API
 * @param {string} apiKey - OpenAI API key
 * @param {string} promptText - Original prompt text
 * @param {Object} settings - User settings (model, output, complexity)
 * @returns {Promise<Object>} Object with optionA and optionB enhanced prompts
 */
async function generateEnhancements(apiKey, promptText, settings = {}) {
  const fallbackA = `${promptText}\n\nRefined focus: clarify intent and add a persuasive closing.`;
  const fallbackB = `${promptText}\n\nRefined focus: provide more context and outline clear next steps.`;

  if (!apiKey) {
    return { optionA: fallbackA, optionB: fallbackB, error: "NO_API_KEY" };
  }

  // Extract settings with defaults
  const model = settings.model || "chatgpt";
  const outputType = settings.output || "text";
  const levelOfDetail = settings.complexity || 2;

  // Build adaptive system prompt based on settings
  const systemPrompt = buildSystemPrompt(model, outputType, levelOfDetail);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Enhance this prompt:\n\n${promptText}`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }
      
      // Check for quota/billing errors
      if (errorData.error?.code === "insufficient_quota" || 
          errorData.error?.type === "insufficient_quota" ||
          errorText.includes("quota") ||
          errorText.includes("billing")) {
        throw new Error("API_QUOTA_EXCEEDED");
      }
      
      throw new Error(errorText);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { optionA: fallbackA, optionB: fallbackB, error: "EMPTY_RESPONSE" };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return { optionA: fallbackA, optionB: fallbackB, error: "PARSE_ERROR" };
    }

    const optionA = typeof parsed.optionA === "string" ? parsed.optionA.trim() : fallbackA;
    const optionB = typeof parsed.optionB === "string" ? parsed.optionB.trim() : fallbackB;
    return { optionA, optionB };
  } catch (error) {
    console.error("Prompanion: enhancement generation failed", error);
    const errorMessage = error.message || String(error);
    if (errorMessage === "API_QUOTA_EXCEEDED") {
      return { optionA: promptText, optionB: promptText, error: "API_QUOTA_EXCEEDED" };
    }
    return { optionA: promptText, optionB: promptText, error: "API_ERROR" };
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
    2: "Provide well-structured re-wording with clear organization.",
    3: "Provide comprehensive re-wording with thorough improvements and context."
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
 * Regenerates a single enhanced prompt option by re-wording it for better clarity
 * @param {string} apiKey - OpenAI API key
 * @param {string} currentPrompt - The current enhanced prompt to regenerate
 * @param {Object} settings - User settings (model, output, complexity)
 * @returns {Promise<string>} Regenerated prompt text
 */
async function regenerateEnhancement(apiKey, currentPrompt, settings = {}) {
  const fallback = `${currentPrompt}\n\n(Re-worded for improved clarity and precision.)`;

  if (!apiKey) {
    return fallback;
  }

  // Extract settings with defaults
  const model = settings.model || "chatgpt";
  const outputType = settings.output || "text";
  const levelOfDetail = settings.complexity || 2;

  // Build adaptive system prompt for regeneration
  const systemPrompt = buildRegenerateSystemPrompt(model, outputType, levelOfDetail);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Re-word this prompt to be more clear and effective:\n\n${currentPrompt}`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return fallback;
    }

    return content;
  } catch (error) {
    console.error("Prompanion: regeneration failed", error);
    return fallback;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Prompanion Background] ========== MESSAGE RECEIVED ==========");
  console.log("[Prompanion Background] Message type:", message?.type);
  console.log("[Prompanion Background] Message:", message);
  console.log("[Prompanion Background] Sender:", sender);
  
  if (!message || typeof message !== "object") {
    console.log("[Prompanion Background] Invalid message, ignoring");
    return;
  }

  if (message.type === "PROMPANION_SIDECHAT_REQUEST") {
    // Return true to keep the message channel open for async response
    (async () => {
      try {
        const snippet =
          typeof message.text === "string" ? message.text.trim() : "";
        if (!snippet) {
          sendResponse?.({ ok: false, reason: "EMPTY_TEXT" });
          return;
        }

        // Extract chat history from message (if provided)
        const chatHistory = Array.isArray(message.chatHistory) ? message.chatHistory : [];

        const currentState = await readState();
        const nextState = {
          ...currentState,
          pendingSideChat: {
            text: snippet,
            chatHistory: chatHistory, // Include chat history for context
            timestamp: Date.now()
          }
        };
        await writeState(nextState);
        chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        chrome.runtime.sendMessage({
          type: "PROMPANION_SIDECHAT_DELIVER",
          text: snippet,
          chatHistory: chatHistory, // Pass history to SideChat
          clearPending: true
        });

        const tabId = await getTabId(sender);
        if (tabId) {
          await openPanel(tabId);
        }
        sendResponse?.({ ok: true });
      } catch (error) {
        console.error("[Prompanion Background] PROMPANION_SIDECHAT_REQUEST error:", error);
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
        console.log("[Prompanion Background] PROMPANION_PREPARE_ENHANCEMENT received, prompt:", promptText);
        const currentState = await readState();
        const apiKey = currentState.settings?.apiKey;
        const settings = {
          model: currentState.settings?.model || "chatgpt",
          output: currentState.settings?.output || "text",
          complexity: currentState.settings?.complexity || 2
        };
        console.log("[Prompanion Background] Using settings:", settings);
        const result = await generateEnhancements(apiKey, promptText, settings);
        const { optionA, optionB, error } = result;
        console.log("[Prompanion Background] Enhancement result - optionA:", optionA, "optionB:", optionB, "error:", error);
        const nextState = {
          ...currentState,
          originalPrompt: promptText,
          optionA,
          optionB
        };
        console.log("[Prompanion Background] Next state prepared:", { 
          originalPrompt: nextState.originalPrompt?.substring(0, 50), 
          optionA: nextState.optionA?.substring(0, 50), 
          optionB: nextState.optionB?.substring(0, 50) 
        });
        await writeState(nextState);
        console.log("[Prompanion Background] ========== STATE SAVED TO STORAGE ==========");
        console.log("[Prompanion Background] Verifying state was saved...");
        const verifyState = await readState();
        console.log("[Prompanion Background] Verified saved state:", {
          hasOriginalPrompt: !!verifyState.originalPrompt,
          hasOptionA: !!verifyState.optionA,
          hasOptionB: !!verifyState.optionB,
          originalPrompt: verifyState.originalPrompt?.substring(0, 50),
          optionA: verifyState.optionA?.substring(0, 50),
          optionB: verifyState.optionB?.substring(0, 50)
        });
        console.log("[Prompanion Background] State saved, sending PROMPANION_STATE_PUSH message");
        
        // Send message to any listeners (including sidepanel if it's loaded)
        chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState }, (response) => {
          if (chrome.runtime.lastError) {
            // This is normal if sidepanel isn't loaded yet - state is saved to storage
            console.log("[Prompanion Background] STATE_PUSH message sent (sidepanel may not be loaded yet):", chrome.runtime.lastError.message);
          } else {
            console.log("[Prompanion Background] STATE_PUSH message sent successfully");
          }
        });
        
        if (message.openPanel !== false && !error) {
          const tabId = await getTabId(sender);
          if (tabId) {
            await openPanel(tabId);
          } else {
            console.warn("Prompanion: could not toggle panel, no tabId resolved");
          }
        }
        sendResponse?.({ ok: !error, optionA, optionB, error });
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
        const currentPrompt = typeof message.prompt === "string" ? message.prompt.trim() : "";
        if (!currentPrompt) {
          if (sendResponse) {
            sendResponse({ ok: false, reason: "EMPTY_PROMPT" });
          }
          return;
        }

        const currentState = await readState();
        const apiKey = currentState.settings?.apiKey;
        const settings = {
          model: currentState.settings?.model || "chatgpt",
          output: currentState.settings?.output || "text",
          complexity: currentState.settings?.complexity || 2
        };
        const regenerated = await regenerateEnhancement(apiKey, currentPrompt, settings);
        
        const optionKey = message.option === "a" ? "optionA" : message.option === "b" ? "optionB" : null;
        if (optionKey) {
          const nextState = {
            ...currentState,
            [optionKey]: regenerated
          };
          await writeState(nextState);
          chrome.runtime.sendMessage({ type: "PROMPANION_STATE_PUSH", state: nextState });
        }
        
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
    console.log("[Prompanion Background] ========== PROMPANION_INSERT_TEXT RECEIVED ==========");
    console.log("[Prompanion Background] Text to insert:", typeof message.text === "string" ? message.text.substring(0, 50) + "..." : "invalid");
    console.log("[Prompanion Background] Sender:", sender);
    (async () => {
      try {
        const textToInsert = typeof message.text === "string" ? message.text.trim() : "";
        if (!textToInsert) {
          console.log("[Prompanion Background] Empty text, returning error");
          sendResponse?.({ ok: false, reason: "EMPTY_TEXT" });
          return;
        }

        // Try to get tab from sender first (if message came from a tab)
        let targetTabId = sender?.tab?.id;
        console.log("[Prompanion Background] Sender tab ID:", targetTabId);
        
        // If no tab from sender, find ChatGPT tab
        if (!targetTabId) {
          try {
            console.log("[Prompanion Background] No sender tab, searching for ChatGPT tab...");
            // First try to find active ChatGPT tab
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log("[Prompanion Background] Active tab:", activeTab?.url);
            if (activeTab && activeTab.url && (
              activeTab.url.includes("chatgpt.com") || 
              activeTab.url.includes("chat.openai.com")
            )) {
              targetTabId = activeTab.id;
              console.log("[Prompanion Background] Using active ChatGPT tab:", targetTabId);
            } else {
              // Fallback: find any ChatGPT tab
              console.log("[Prompanion Background] Active tab is not ChatGPT, searching all tabs...");
              const tabs = await chrome.tabs.query({
                url: [
                  "https://chatgpt.com/*",
                  "https://*.chatgpt.com/*",
                  "https://chat.openai.com/*",
                  "https://*.chat.openai.com/*"
                ]
              });
              console.log("[Prompanion Background] Found ChatGPT tabs:", tabs.length);
              if (tabs.length > 0) {
                // Prefer active tab, otherwise use first one
                targetTabId = tabs.find(tab => tab.active)?.id || tabs[0].id;
                console.log("[Prompanion Background] Selected tab ID:", targetTabId);
              }
            }
          } catch (queryError) {
            console.error("[Prompanion Background] Failed to query tabs:", queryError);
          }
        }

        if (!targetTabId) {
          console.log("[Prompanion Background] No ChatGPT tab found, returning error");
          sendResponse?.({ ok: false, reason: "NO_CHATGPT_TAB" });
          return;
        }

        // Send message to adapter.js content script
        console.log("[Prompanion Background] Sending message to tab:", targetTabId);
        console.log("[Prompanion Background] Message payload:", { type: "PROMPANION_INSERT_TEXT", text: textToInsert.substring(0, 50) + "..." });
        
        // Check if content script is loaded by trying to query the tab
        try {
          const tab = await chrome.tabs.get(targetTabId);
          console.log("[Prompanion Background] Tab info:", { id: tab.id, url: tab.url, status: tab.status });
        } catch (tabError) {
          console.error("[Prompanion Background] Failed to get tab info:", tabError);
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
          console.log("[Prompanion Background] Received response from adapter:", response);
          console.log("[Prompanion Background] Response type:", typeof response);
          console.log("[Prompanion Background] Response is null/undefined:", response === null || response === undefined);
          
          if (!response) {
            console.error("[Prompanion Background] Adapter returned null/undefined response!");
            sendResponse?.({ ok: false, reason: "NO_RESPONSE_FROM_ADAPTER" });
            return;
          }
          
          sendResponse?.(response);
        } catch (error) {
          console.error("[Prompanion Background] Failed to send insert message to tab:", error);
          console.error("[Prompanion Background] Error name:", error.name);
          console.error("[Prompanion Background] Error message:", error.message);
          console.error("[Prompanion Background] Error stack:", error.stack);
          
          // Check if error is because content script isn't ready
          if (error.message?.includes("Could not establish connection") || 
              error.message?.includes("Receiving end does not exist") ||
              error.message?.includes("Extension context invalidated") ||
              error.message?.includes("TIMEOUT")) {
            console.log("[Prompanion Background] Adapter not ready - content script may not be loaded or not responding");
            console.log("[Prompanion Background] This usually means:");
            console.log("[Prompanion Background] 1. The content script hasn't loaded yet");
            console.log("[Prompanion Background] 2. The content script's message listener isn't registered");
            console.log("[Prompanion Background] 3. The content script is in a different frame/context");
            sendResponse?.({ ok: false, reason: "ADAPTER_NOT_READY" });
          } else {
            console.log("[Prompanion Background] Send failed with unexpected error:", error.message);
            sendResponse?.({ ok: false, reason: error?.message ?? "SEND_FAILED" });
          }
        }
      } catch (error) {
        console.error("[Prompanion Background] Insert text message failed:", error);
        sendResponse?.({ ok: false, reason: error?.message ?? "UNKNOWN" });
      }
    })();
    return true;
  }
});


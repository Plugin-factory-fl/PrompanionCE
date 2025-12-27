/**
 * API Routes
 * Handles OpenAI API calls and other API-related endpoints
 */

import express from 'express';
import { authenticate } from '../config/auth.js';
import { query } from '../config/database.js';
import { resetDailyUsageIfNeeded } from '../config/usage.js';

const router = express.Router();

// All API routes require authentication
router.use(authenticate);

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
      text: "LOW DETAIL: The prompt should be as short and to the point as possible. Not aiming for a specific number of words but just maximum simplicity in language. All the important parts of the idea are there. Think Twitter post - concise, direct, no fluff. Remove all unnecessary words and explanations. Keep only the essential information. Aim for the shortest possible version while maintaining clarity.",
      style: "extremely brief, direct, and minimal",
      length: "very short - like a Twitter post (typically 10-30 words)",
      examples: "Instead of 'Please provide a detailed explanation of...', use 'Explain...'. Instead of 'I would like you to create a comprehensive list that includes...', use 'List...'. Strip away all filler words and get straight to the core request."
    },
    2: {
      text: "MEDIUM DETAIL: The enhanced prompt MUST be EXACTLY 5-7 sentences total. Count your sentences carefully - the final output must be between 5 and 7 sentences, no more, no less. Write in plain paragraph form - NO numbered lists, NO bullet points, NO sections, NO colons followed by lists. Just 5-7 complete sentences in a single paragraph. Each sentence should be clear and focused. After writing, count your sentences and adjust if needed to ensure it's exactly 5-7 sentences.",
      style: "exactly 5-7 sentences in plain paragraph form",
      length: "exactly 5-7 sentences total, counted and verified",
      examples: "CORRECT (7 sentences): 'Write an informative blog post about [topic]. The post should engage a general audience. Include an introduction that captures attention. Develop main ideas with clear explanations. Use relevant examples where helpful. Conclude with key takeaways. Keep the language accessible.' WRONG: Any numbered lists, sections, or more than 7 sentences."
    },
    3: {
      text: "HIGH DETAIL: The prompt should be explained in a way you would explain it to a high school student. The ideas in the prompt should be lightly elaborated on, leaving only a few stones unturned if needed. Use clear, accessible language. Provide enough context to understand the request without being overly academic or technical. CRITICAL: You MUST ADD new content to expand the word count to 2-3x the original. Do NOT just reword - you must ADD: brief explanations of key terms, context about why something matters, simple examples or analogies, background information, and light elaboration on the main ideas. The enhanced prompt should be noticeably longer with new information added.",
      style: "clear, accessible, and moderately detailed",
      length: "moderate length with light elaboration (typically 2-3x the original word count)",
      examples: "EXAMPLE: Original 'write a blog post' becomes 'Write a blog post that explains [topic] in an accessible way. The post should be informative and engaging, using clear language that helps readers understand the key concepts. Include relevant examples or analogies to illustrate the main points, and structure it with a clear introduction, body paragraphs that develop the ideas, and a conclusion that summarizes the key takeaways.' Notice how we ADDED explanations, context, structure details, and examples - we didn't just reword 'write a blog post'."
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
    `═══════════════════════════════════════════════════════════════\n` +
    `${levelOfDetail === 2 ? '═══════════════════════════════════════════════════════════════\n' +
    'MEDIUM LEVEL - CRITICAL: EXACTLY 5-7 SENTENCES, NO NUMBERED LISTS\n' +
    '═══════════════════════════════════════════════════════════════\n\n' +
    'MEDIUM LEVEL OUTPUT MUST BE:\n' +
    '- Exactly 5-7 sentences total (count them!)\n' +
    '- Plain paragraph form - NO numbered lists, NO bullet points, NO sections\n' +
    '- Single flowing paragraph with 5-7 complete sentences\n\n' +
    'EXAMPLE (7 sentences): "Build a website that advocates for tokenized gold. The site should include a homepage explaining what tokenized gold is and its benefits. Add an informative section detailing how tokenization works. Include investment opportunities and case studies. Provide a contact page for inquiries. Make the design user-friendly and visually appealing. Ensure the content is clear and accessible."\n\n' : ''}` +
    `${levelOfDetail !== 2 ? `LEVEL OF DETAIL REQUIREMENT - THIS IS CRITICAL AND MUST BE FOLLOWED EXACTLY:\n` +
    `═══════════════════════════════════════════════════════════════\n\n` +
    `${detail.text}\n\n` +
    `EXAMPLES OF WHAT THIS MEANS:\n` +
    `${detail.examples}\n\n` : ''}` +
    `CRITICAL REQUIREMENT: Both Option A and Option B MUST be at the EXACT SAME level of detail. ` +
    `${levelOfDetail === 1 ? 'If the level is LOW, BOTH prompts must be extremely brief and minimal - like a Twitter post (typically 10-30 words).' : ''}` +
    `${levelOfDetail === 2 ? 'If the level is MEDIUM, BOTH prompts must be EXACTLY 5-7 sentences total in plain paragraph form with NO numbered lists.' : ''}` +
    `${levelOfDetail === 3 ? 'If the level is HIGH, BOTH prompts must be explained like to a high school student with light elaboration, and MUST be significantly longer than the original (aim for 2-3x the original word count). Numbered lists or structured sections are acceptable for HIGH level.' : ''}\n\n` +
    `═══════════════════════════════════════════════════════════════\n` +
    `CRITICAL: DO NOT JUST REWORD - YOU MUST ADD CONTENT\n` +
    `═══════════════════════════════════════════════════════════════\n\n` +
    `${levelOfDetail === 2 ? 'MEDIUM LEVEL: Write exactly 5-7 sentences in plain paragraph form. NO numbered lists. Count your sentences.\n\n' : ''}` +
    `${levelOfDetail === 3 ? 'FOR HIGH LEVEL: You MUST actively ADD new content to expand the prompt. Do NOT just rephrase the original words. You MUST:\n' +
    '- Add brief explanations of key terms or concepts mentioned\n' +
    '- Add context about why the request matters or what it\'s for\n' +
    '- Add simple examples or analogies to clarify the request\n' +
    '- Add background information that helps understand the task\n' +
    '- Add light elaboration on the main ideas\n' +
    '- The result should be 2-3x LONGER than the original, not just reworded\n' +
    'EXAMPLE: If original is "write a blog post", expand to something like "Write a blog post that explains [topic] in an accessible way. The post should be informative and engaging, using clear language that helps readers understand the key concepts. Include relevant examples or analogies to illustrate the main points, and structure it with a clear introduction, body paragraphs that develop the ideas, and a conclusion that summarizes the key takeaways."\n\n' : ''}` +
    `The enhanced prompts MUST match this level of detail exactly. ` +
    `For MEDIUM level: Write EXACTLY 5-7 sentences total. The entire enhanced prompt must be 5-7 clear, concise sentences. ` +
    `For HIGH level: Actively EXPAND the prompt by ADDING new content to reach 2-3x the original word count. ` +
    `Do NOT just reword the original - you MUST add new information, explanations, context, and details. ` +
    `Do NOT create prompts that are longer or more detailed than the selected level. ` +
    `Do NOT create prompts that are shorter or less detailed than the selected level.\n\n` +
    `Option A should focus on: clarity, specificity, and structure. Make it more precise and easier for the AI to understand exactly what is needed. ` +
    `The prompt must be ${detail.style} and ${detail.length} - matching the level of detail setting EXACTLY. ` +
    `${levelOfDetail === 3 ? 'CRITICAL: Do NOT just reword - you MUST ADD new content (explanations, context, examples) to expand it to 2-3x the original word count.' : ''}\n\n` +
    `Option B should focus on: a different enhancement approach (alternative framing, perspective, or methodology) while maintaining the EXACT SAME level of detail as Option A. ` +
    `This version must also be ${detail.style} and ${detail.length} - the same as Option A. ` +
    `Both prompts should be approximately the same length and depth. ` +
    `${levelOfDetail === 2 ? 'Both Option A and Option B must be exactly 5-7 sentences each in plain paragraph form with NO numbered lists.' : ''}` +
    `${levelOfDetail === 3 ? 'Both must be 2-3x the original word count with light elaboration - ADD content, don\'t just reword.' : ''}\n\n` +
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
    `${levelOfDetail === 2 ? 'FINAL CHECK FOR MEDIUM: Count sentences in both options - must be 5-7 each with NO numbered lists.\n\n' : ''}` +
    `Reply ONLY with valid JSON in this exact format: {"optionA":"enhanced prompt A here","optionB":"enhanced prompt B here"}`;

  return systemPrompt;
}

/**
 * Counts sentences in a text string
 * @param {string} text - Text to count sentences in
 * @returns {number} Number of sentences
 */
function countSentences(text) {
  if (!text || typeof text !== 'string') return 0;
  // Split by sentence-ending punctuation, filter out empty strings
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.length;
}

/**
 * Processes Medium level prompts to enforce 5-7 sentences and remove numbered lists
 * @param {string} promptText - The prompt text to process
 * @returns {string} Processed prompt with exactly 5-7 sentences, no numbered lists
 */
function processMediumLevelPrompt(promptText) {
  if (!promptText || typeof promptText !== 'string') return promptText;
  
  let processed = promptText.trim();
  
  // Remove phrases that introduce lists FIRST
  processed = processed.replace(/the following elements?:/gi, '');
  processed = processed.replace(/include the following:/gi, '');
  processed = processed.replace(/include:/gi, '');
  
  // Remove numbered list markers - simple and direct: "1. ", "2. ", "1) ", "2) ", etc.
  // This will remove the numbers but keep the sentence content
  processed = processed.replace(/\d+[.)]\s+/g, '');
  
  // Remove markdown bold markers
  processed = processed.replace(/\*\*/g, '');
  
  // Clean up extra whitespace
  processed = processed.replace(/\s+/g, ' ').trim();
  
  // Convert colons that seem like list separators to periods
  processed = processed.replace(/:\s*([A-Z])/g, '. $1');
  
  // Split into sentences by sentence-ending punctuation
  const sentences = processed.split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => {
      // Remove any remaining numbered list prefixes
      const cleaned = s.replace(/^\d+[.)]\s*/, '').trim();
      return cleaned.length > 15; // Minimum sentence length
    })
    .map(s => s.replace(/^\d+[.)]\s*/, '').trim()) // Remove numbered list prefixes
    .filter(s => s.length > 0);
  
  // Select 5-7 sentences
  let selectedSentences = sentences;
  if (sentences.length > 7) {
    selectedSentences = sentences.slice(0, 7);
  } else if (sentences.length < 5 && sentences.length > 0) {
    selectedSentences = sentences;
  }
  
  if (selectedSentences.length === 0) {
    return promptText; // Fallback if processing failed
  }
  
  // Join sentences with periods, ensure proper capitalization
  const result = selectedSentences.map((s, i) => {
    let cleaned = s.trim();
    // Remove any remaining numbered list patterns
    cleaned = cleaned.replace(/^\d+[.)]\s*/, '');
    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return cleaned;
  }).filter(s => s.length > 0).join('. ');
  
  // Ensure it ends with proper punctuation
  const finalResult = result.trim();
  if (!/[.!?]$/.test(finalResult)) {
    return finalResult + '.';
  }
  
  return finalResult;
}

/**
 * Calls OpenAI API for prompt enhancement
 * @param {string} systemPrompt - System prompt with instructions
 * @param {string} userPrompt - User's original prompt
 * @param {number} maxTokens - Maximum tokens for response
 * @returns {Promise<Object>} Parsed JSON response with optionA and optionB
 */
async function callOpenAI(systemPrompt, userPrompt, maxTokens) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Enhance this prompt:\n\n${userPrompt}` }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  return JSON.parse(content);
}

/**
 * Calls Google Gemini API for prompt enhancement
 * @param {string} systemPrompt - System prompt with instructions
 * @param {string} userPrompt - User's original prompt
 * @param {number} maxTokens - Maximum tokens for response
 * @returns {Promise<Object>} Parsed JSON response with optionA and optionB
 */
async function callGemini(systemPrompt, userPrompt, maxTokens) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  // Combine system prompt and user prompt for Gemini
  const fullPrompt = `${systemPrompt}\n\nEnhance this prompt:\n\n${userPrompt}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: maxTokens
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!content) {
    throw new Error('Empty response from Gemini');
  }

  return JSON.parse(content);
}

/**
 * Calls Anthropic Claude API for prompt enhancement
 * @param {string} systemPrompt - System prompt with instructions
 * @param {string} userPrompt - User's original prompt
 * @param {number} maxTokens - Maximum tokens for response
 * @returns {Promise<Object>} Parsed JSON response with optionA and optionB
 */
async function callClaude(systemPrompt, userPrompt, maxTokens) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Enhance this prompt:\n\n${userPrompt}`
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text?.trim();

  if (!content) {
    throw new Error('Empty response from Claude');
  }

  return JSON.parse(content);
}

/**
 * Calls xAI Grok API for prompt enhancement
 * @param {string} systemPrompt - System prompt with instructions
 * @param {string} userPrompt - User's original prompt
 * @param {number} maxTokens - Maximum tokens for response
 * @returns {Promise<Object>} Parsed JSON response with optionA and optionB
 */
async function callGrok(systemPrompt, userPrompt, maxTokens) {
  const GROK_API_KEY = process.env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    throw new Error('Grok API key not configured');
  }

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROK_API_KEY}`
    },
    body: JSON.stringify({
      model: 'grok-beta',
      temperature: 0.7,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Enhance this prompt:\n\n${userPrompt}` }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Empty response from Grok');
  }

  return JSON.parse(content);
}

/**
 * Routes enhancement request to the appropriate API based on model selection
 * @param {string} model - Model identifier (chatgpt, gemini, claude, grok)
 * @param {string} systemPrompt - System prompt with instructions
 * @param {string} userPrompt - User's original prompt
 * @param {number} maxTokens - Maximum tokens for response
 * @returns {Promise<Object>} Parsed JSON response with optionA and optionB
 */
async function callEnhancementAPI(model, systemPrompt, userPrompt, maxTokens) {
  const normalizedModel = (model || 'chatgpt').toLowerCase();

  switch (normalizedModel) {
    case 'chatgpt':
      return await callOpenAI(systemPrompt, userPrompt, maxTokens);
    case 'gemini':
      return await callGemini(systemPrompt, userPrompt, maxTokens);
    case 'claude':
      return await callClaude(systemPrompt, userPrompt, maxTokens);
    case 'grok':
      return await callGrok(systemPrompt, userPrompt, maxTokens);
    default:
      // Fallback to OpenAI if unknown model
      console.warn(`[API] Unknown model "${model}", falling back to OpenAI`);
      return await callOpenAI(systemPrompt, userPrompt, maxTokens);
  }
}

/**
 * POST /api/enhance
 * Enhance a prompt using the selected AI model API
 */
router.post('/enhance', async (req, res) => {
  try {
    const { prompt, model, outputType, levelOfDetail } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Reset daily usage if needed (lazy reset)
    const resetOccurred = await resetDailyUsageIfNeeded(req.user.userId);
    if (resetOccurred) {
      console.log(`[API] Daily reset occurred for user ${req.user.userId} before enhancement check`);
    }

    // Check user's subscription status and current usage
    // Use a fresh query after reset to ensure we get the latest data
    const userResult = await query(
      'SELECT subscription_status, enhancements_used, enhancements_limit, last_reset_date FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    console.log(`[API] User ${req.user.userId} usage check: ${user.enhancements_used}/${user.enhancements_limit}, last_reset: ${user.last_reset_date}`);

    // Check if user has reached their daily limit
    if (user.enhancements_used >= user.enhancements_limit) {
      return res.status(403).json({ 
        error: 'Daily enhancement limit reached. Your limit will reset tomorrow.',
        enhancementsUsed: user.enhancements_used,
        enhancementsLimit: user.enhancements_limit
      });
    }

    // Build the full system prompt with level of detail
    const systemPrompt = buildSystemPrompt(
      model || 'chatgpt',
      outputType || 'text',
      levelOfDetail || 2
    );

    // Calculate max_tokens based on level of detail to allow longer responses
    let maxTokens = 1000; // Default
    if (levelOfDetail === 1) {
      maxTokens = 500; // Low detail - shorter responses (very concise)
    } else if (levelOfDetail === 2) {
      maxTokens = 1500; // Medium detail - allow 1.5-2x expansion
    } else if (levelOfDetail === 3) {
      maxTokens = 2000; // High detail - allow 2-3x expansion
    }

    const selectedModel = model || 'chatgpt';
    console.log(`[API] Enhancement request - Model: ${selectedModel}, Level: ${levelOfDetail}, Max tokens: ${maxTokens}`);

    // Route to appropriate API based on model selection
    let parsed;
    try {
      parsed = await callEnhancementAPI(selectedModel, systemPrompt, prompt, maxTokens);
    } catch (apiError) {
      console.error(`[API] ${selectedModel} API error:`, apiError);
      return res.status(500).json({ 
        error: `Failed to enhance prompt using ${selectedModel}`,
        details: apiError.message
      });
    }

    // Post-process Medium level responses to enforce 5-7 sentences and remove numbered lists
    let finalOptionA = parsed.optionA || prompt;
    let finalOptionB = parsed.optionB || prompt;
    
    if (levelOfDetail === 2) {
      console.log(`[API] BEFORE post-processing - Option A: "${finalOptionA.substring(0, 100)}..."`);
      console.log(`[API] BEFORE post-processing - Option A has numbered lists: ${/\d+[.)]\s+/.test(finalOptionA)}`);
      finalOptionA = processMediumLevelPrompt(finalOptionA);
      finalOptionB = processMediumLevelPrompt(finalOptionB);
      console.log(`[API] AFTER post-processing - Option A: "${finalOptionA.substring(0, 100)}..."`);
      console.log(`[API] AFTER post-processing - Option A has numbered lists: ${/\d+[.)]\s+/.test(finalOptionA)}`);
      console.log(`[API] Post-processed Medium level prompts - Option A: ${countSentences(finalOptionA)} sentences, Option B: ${countSentences(finalOptionB)} sentences`);
    }

    // Increment user's enhancement count
    const incrementResult = await query(
      'UPDATE users SET enhancements_used = enhancements_used + 1 WHERE id = $1 RETURNING enhancements_used',
      [req.user.userId]
    );
    
    const newCount = incrementResult.rows[0]?.enhancements_used || user.enhancements_used + 1;
    console.log(`[API] Incremented enhancement count for user ${req.user.userId}: ${user.enhancements_used} -> ${newCount}`);

    res.json({
      optionA: finalOptionA,
      optionB: finalOptionB,
      enhancementsUsed: newCount, // Include updated count in response
      enhancementsLimit: user.enhancements_limit
    });
  } catch (error) {
    console.error('Enhancement error:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

/**
 * Calls OpenAI API for side chat
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} Assistant's reply content
 */
async function callOpenAIChat(messages) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      messages: messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  return content;
}

/**
 * Calls Google Gemini API for side chat
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} Assistant's reply content
 */
async function callGeminiChat(messages) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  // Convert messages to Gemini format
  // Gemini doesn't support system messages, so we'll combine system + first user message
  const systemMessage = messages.find(msg => msg.role === 'system');
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  
  let geminiMessages = [];
  if (systemMessage && nonSystemMessages.length > 0) {
    // Combine system message with first user message
    const firstUser = nonSystemMessages[0];
    geminiMessages.push({
      role: 'user',
      parts: [{ text: `${systemMessage.content}\n\n${firstUser.content}` }]
    });
    // Add remaining messages
    for (let i = 1; i < nonSystemMessages.length; i++) {
      const msg = nonSystemMessages[i];
      geminiMessages.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
  } else {
    // No system message, convert directly
    geminiMessages = nonSystemMessages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: geminiMessages
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!content) {
    throw new Error('Empty response from Gemini');
  }

  return content;
}

/**
 * Calls Anthropic Claude API for side chat
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} Assistant's reply content
 */
async function callClaudeChat(messages) {
  const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
  if (!CLAUDE_API_KEY) {
    throw new Error('Claude API key not configured');
  }

  // Separate system message from other messages
  const systemMessage = messages.find(msg => msg.role === 'system');
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 2000,
      temperature: 0.7,
      system: systemMessage?.content || '',
      messages: nonSystemMessages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }))
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text?.trim();

  if (!content) {
    throw new Error('Empty response from Claude');
  }

  return content;
}

/**
 * Calls xAI Grok API for side chat
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} Assistant's reply content
 */
async function callGrokChat(messages) {
  const GROK_API_KEY = process.env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    console.error('[API Chat] Grok API key not found in environment variables');
    throw new Error('Grok API key not configured');
  }

  console.log(`[API Chat] Calling Grok API with ${messages.length} messages`);
  console.log(`[API Chat] Grok API key present: ${GROK_API_KEY ? 'Yes' : 'No'}`);
  
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-beta',
        temperature: 0.7,
        messages: messages
      })
    });

    console.log(`[API Chat] Grok API response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API Chat] Grok API error response:`, errorText);
      throw new Error(`Grok API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    console.log(`[API Chat] Grok API response data keys:`, Object.keys(data));
    console.log(`[API Chat] Grok API choices length:`, data.choices?.length);
    
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.error(`[API Chat] Grok API returned empty content. Full response:`, JSON.stringify(data, null, 2));
      throw new Error('Empty response from Grok');
    }

    console.log(`[API Chat] Grok API returned content (${content.length} chars)`);
    return content;
  } catch (error) {
    console.error(`[API Chat] Grok API fetch error:`, error);
    if (error.message.includes('Grok API error')) {
      throw error; // Re-throw API errors as-is
    }
    throw new Error(`Grok API request failed: ${error.message}`);
  }
}

/**
 * Routes chat request to the appropriate API based on model selection
 * @param {string} model - Model identifier (chatgpt, gemini, claude, grok)
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<string>} Assistant's reply content
 */
async function callChatAPI(model, messages) {
  const normalizedModel = (model || 'chatgpt').toLowerCase();

  switch (normalizedModel) {
    case 'chatgpt':
      return await callOpenAIChat(messages);
    case 'gemini':
      return await callGeminiChat(messages);
    case 'claude':
      return await callClaudeChat(messages);
    case 'grok':
      return await callGrokChat(messages);
    default:
      // No fallback - throw error for unknown model
      throw new Error(`Unknown model "${model}". Supported models: chatgpt, gemini, claude, grok`);
  }
}

/**
 * POST /api/chat
 * Handle side chat requests (proxy to selected AI model API)
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, chatHistory, model } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Reset daily usage if needed (lazy reset)
    const resetOccurred = await resetDailyUsageIfNeeded(req.user.userId);
    if (resetOccurred) {
      console.log(`[API Chat] Daily reset occurred for user ${req.user.userId} before chat check`);
    }

    // Check user's subscription status and current usage
    const userResult = await query(
      'SELECT subscription_status, enhancements_used, enhancements_limit, last_reset_date FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    console.log(`[API Chat] User ${req.user.userId} usage check: ${user.enhancements_used}/${user.enhancements_limit}, last_reset: ${user.last_reset_date}`);

    // Check if user has reached their daily limit
    if (user.enhancements_used >= user.enhancements_limit) {
      return res.status(403).json({ 
        error: 'Daily enhancement limit reached. Your limit will reset tomorrow.',
        enhancementsUsed: user.enhancements_used,
        enhancementsLimit: user.enhancements_limit
      });
    }

    // Build messages array
    // chatHistory already includes the system message with context (if provided)
    // and any previous conversation messages
    const messages = Array.isArray(chatHistory) ? [...chatHistory] : [];
    messages.push({ role: 'user', content: message });

    const selectedModel = model || 'chatgpt';
    console.log(`[API Chat] ========== CHAT REQUEST ==========`);
    console.log(`[API Chat] Model selected: ${selectedModel}`);
    console.log(`[API Chat] Received request with ${messages.length} messages in history`);
    const systemMsg = messages.find(msg => msg.role === 'system');
    if (systemMsg) {
      console.log(`[API Chat] System message present (${systemMsg.content.length} chars)`);
      console.log(`[API Chat] System message preview: ${systemMsg.content.substring(0, 200)}...`);
    } else {
      console.log(`[API Chat] No system message found in chatHistory`);
    }

    // Route to appropriate API based on model selection
    let content;
    try {
      console.log(`[API Chat] Attempting to call ${selectedModel} API...`);
      content = await callChatAPI(selectedModel, messages);
      console.log(`[API Chat] ✓ Successfully received response from ${selectedModel} (${content.length} chars)`);
    } catch (apiError) {
      console.error(`[API Chat] ✗ ${selectedModel} API error:`, apiError);
      console.error(`[API Chat] Error stack:`, apiError.stack);
      console.error(`[API Chat] Error message:`, apiError.message);
      return res.status(500).json({ 
        error: `Failed to get chat response from ${selectedModel}`,
        details: apiError.message
      });
    }

    // Increment user's enhancement count (Side Chat counts as an enhancement)
    const incrementResult = await query(
      'UPDATE users SET enhancements_used = enhancements_used + 1 WHERE id = $1 RETURNING enhancements_used',
      [req.user.userId]
    );
    
    const newCount = incrementResult.rows[0]?.enhancements_used || user.enhancements_used + 1;
    console.log(`[API Chat] Incremented enhancement count for user ${req.user.userId}: ${user.enhancements_used} -> ${newCount}`);

    res.json({
      message: content || 'No response generated',
      enhancementsUsed: newCount, // Include updated count in response
      enhancementsLimit: user.enhancements_limit
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;


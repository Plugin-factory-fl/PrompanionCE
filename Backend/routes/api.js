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
 * POST /api/enhance
 * Enhance a prompt using OpenAI API (proxy request)
 */
router.post('/enhance', async (req, res) => {
  try {
    const { prompt, model, outputType, levelOfDetail } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Reset daily usage if needed (lazy reset)
    await resetDailyUsageIfNeeded(req.user.userId);

    // Check user's subscription status and current usage
    const userResult = await query(
      'SELECT subscription_status, enhancements_used, enhancements_limit FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if user has reached their daily limit
    if (user.enhancements_used >= user.enhancements_limit) {
      return res.status(403).json({ 
        error: 'Daily enhancement limit reached. Your limit will reset tomorrow.',
        enhancementsUsed: user.enhancements_used,
        enhancementsLimit: user.enhancements_limit
      });
    }

    // Call OpenAI API
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Build system prompt (simplified version - you can expand this)
    const systemPrompt = `You are an expert at refining and enhancing prompts for AI language models. 
    Create two distinct, improved versions of the user's prompt that are more effective, clear, and likely to produce better results.
    Return ONLY valid JSON in this format: {"optionA":"enhanced prompt A here","optionB":"enhanced prompt B here"}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Enhance this prompt:\n\n${prompt}` }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to enhance prompt',
        details: errorText
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return res.status(500).json({ error: 'Empty response from OpenAI' });
    }

    // Parse JSON response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to parse OpenAI response' });
    }

    // Increment user's enhancement count
    await query(
      'UPDATE users SET enhancements_used = enhancements_used + 1 WHERE id = $1',
      [req.user.userId]
    );

    res.json({
      optionA: parsed.optionA || prompt,
      optionB: parsed.optionB || prompt
    });
  } catch (error) {
    console.error('Enhancement error:', error);
    res.status(500).json({ error: 'Failed to enhance prompt' });
  }
});

/**
 * POST /api/chat
 * Handle side chat requests (proxy to OpenAI)
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, chatHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Build messages array
    const messages = Array.isArray(chatHistory) ? [...chatHistory] : [];
    messages.push({ role: 'user', content: message });

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
      return res.status(response.status).json({ 
        error: 'Failed to get chat response',
        details: errorText
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    res.json({
      message: content || 'No response generated'
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

export default router;


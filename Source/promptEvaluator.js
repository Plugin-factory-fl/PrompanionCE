/**
 * Prompt Evaluator Module
 * Provides real-time evaluation of prompts with scoring, strengths, issues, and suggestions
 * Similar to Prompt Genie's evaluation system
 * 
 * This file is loaded as a regular script (not ES module) for content script compatibility
 * Wrapped in IIFE to prevent redeclaration errors when loaded multiple times
 */

(function() {
  // Always initialize - don't skip even if it exists
  // This ensures the module is always available even if loaded multiple times
  console.log("[PromptEvaluator] Initializing module...");

/**
 * Vague terms that reduce prompt clarity
 */
const VAGUE_TERMS = [
  'thing', 'things', 'stuff', 'something', 'somewhat', 'nice', 'good', 'bad',
  'maybe', 'possibly', 'basically', 'various', 'kind of', 'sort of', 'a bit',
  'pretty', 'quite', 'rather', 'some', 'any', 'whatever', 'however', 'just'
];

/**
 * Strong action verbs that indicate clear intent
 */
const ACTION_VERBS = [
  'summarize', 'analyze', 'generate', 'evaluate', 'improve', 'refactor', 'prioritize',
  'create', 'develop', 'design', 'build', 'implement', 'construct', 'develop',
  'write', 'compose', 'draft', 'edit', 'revise', 'optimize', 'enhance', 'refine',
  'explain', 'describe', 'define', 'identify', 'compare', 'contrast', 'classify',
  'calculate', 'solve', 'determine', 'assess', 'measure', 'quantify', 'estimate'
];

/**
 * Constraint indicators that show specificity
 */
const CONSTRAINT_TERMS = [
  'limit', 'exactly', 'no more than', 'at least', 'within', 'between', 'deadline',
  'budget', 'maximum', 'minimum', 'only', 'must', 'should', 'require', 'constraint',
  'boundary', 'range', 'scope', 'specify', 'precise', 'specific', 'exact'
];

/**
 * Evaluates a prompt and returns analysis results
 * @param {string} promptText - The prompt text to evaluate
 * @returns {Object} Evaluation result with score, strengths, issues, and suggestions
 */
function evaluatePrompt(promptText) {
  if (!promptText || typeof promptText !== 'string') {
    return {
      score: 0,
      strengths: [],
      issues: ['Prompt is empty or invalid'],
      suggestions: ['Please enter a prompt to evaluate']
    };
  }

  const text = promptText.trim();
  const words = text.toLowerCase().split(/\s+/);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // Initialize analysis
  const strengths = [];
  const issues = [];
  const suggestions = [];
  let score = 50; // Base score

  // Check for vague terms
  const foundVagueTerms = [];
  VAGUE_TERMS.forEach(term => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(text)) {
      foundVagueTerms.push(term);
      score -= 5;
    }
  });

  if (foundVagueTerms.length > 0) {
    issues.push(`Contains vague terms: ${foundVagueTerms.slice(0, 3).join(', ')}${foundVagueTerms.length > 3 ? '...' : ''}`);
    suggestions.push('Replace vague terms with specific, concrete language');
  }

  // Check for action verbs
  const foundActionVerbs = [];
  ACTION_VERBS.forEach(verb => {
    const regex = new RegExp(`\\b${verb}\\b`, 'gi');
    if (regex.test(text)) {
      foundActionVerbs.push(verb);
      score += 10;
    }
  });

  if (foundActionVerbs.length > 0) {
    strengths.push(`Uses strong action verbs: ${foundActionVerbs.slice(0, 3).join(', ')}${foundActionVerbs.length > 3 ? '...' : ''}`);
  } else {
    issues.push('Lacks clear action verbs');
    suggestions.push('Start with a strong action verb (e.g., "analyze", "create", "generate")');
  }

  // Check for constraints
  const foundConstraints = [];
  CONSTRAINT_TERMS.forEach(constraint => {
    const regex = new RegExp(`\\b${constraint}\\b`, 'gi');
    if (regex.test(text)) {
      foundConstraints.push(constraint);
      score += 5;
    }
  });

  if (foundConstraints.length > 0) {
    strengths.push(`Includes specific constraints: ${foundConstraints.slice(0, 2).join(', ')}${foundConstraints.length > 2 ? '...' : ''}`);
  } else {
    suggestions.push('Add specific constraints or requirements (e.g., "limit to 500 words", "within 24 hours")');
  }

  // Structure analysis
  if (wordCount < 10) {
    issues.push('Prompt is too short');
    suggestions.push('Expand your prompt with more details and context');
    score -= 10;
  } else if (wordCount > 20 && sentenceCount > 1) {
    strengths.push('Well-structured with multiple sentences');
    score += 10;
  } else if (wordCount >= 20) {
    strengths.push('Good length and detail');
    score += 5;
  }

  // Check for question format
  if (text.includes('?') && sentenceCount > 0) {
    strengths.push('Uses question format for clarity');
    score += 5;
  }

  // Check for examples or context
  if (text.includes('example') || text.includes('for instance') || text.includes('such as')) {
    strengths.push('Includes examples or context');
    score += 5;
  }

  // Check for formatting (lists, structure)
  if (text.includes('\n') || text.match(/\d+\./)) {
    strengths.push('Uses formatting for organization');
    score += 5;
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Provide default suggestions if none found
  if (suggestions.length === 0 && score < 70) {
    suggestions.push('Consider adding more specific details and requirements');
  }

  // Provide encouragement for high scores
  if (score >= 80) {
    strengths.push('Overall well-crafted prompt');
  }

  return {
    score: Math.round(score),
    strengths: strengths.length > 0 ? strengths : ['Prompt has a clear structure'],
    issues: issues.length > 0 ? issues : [],
    suggestions: suggestions.length > 0 ? suggestions : ['Continue refining for best results']
  };
}

/**
 * Gets a color class based on score
 * @param {number} score - The evaluation score (0-100)
 * @returns {string} CSS class name for score color
 */
function getScoreColorClass(score) {
  if (score >= 80) return 'score-excellent';
  if (score >= 60) return 'score-good';
  if (score >= 40) return 'score-fair';
  return 'score-poor';
}

/**
 * Gets a descriptive label for the score
 * @param {number} score - The evaluation score (0-100)
 * @returns {string} Descriptive label
 */
function getScoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}

/**
 * Gets a short 2-3 word blurb message for the score
 * @param {number} score - The evaluation score (0-100)
 * @returns {string} Short blurb message
 */
function getScoreBlurb(score) {
  if (score === 100) return 'Perfect prompt award!';
  if (score >= 90) return 'Absolutely excellent!';
  if (score >= 80) return 'Absolutely acceptable!';
  if (score >= 70) return 'Pretty good prompt!';
  if (score >= 60) return 'Decent prompt here!';
  if (score >= 50) return 'It might work...';
  if (score >= 40) return 'Needs improvement.';
  if (score >= 30) return 'Not well engineered.';
  if (score >= 20) return 'Poorly structured.';
  return 'Very weak prompt.';
}

// Export to window for content script access (after all functions are defined)
if (typeof window !== 'undefined') {
  window.PromptEvaluator = {
    evaluatePrompt,
    getScoreColorClass,
    getScoreLabel,
    getScoreBlurb
  };
  console.log("[PromptEvaluator] Module loaded and exported to window.PromptEvaluator");
  console.log("[PromptEvaluator] Functions available:", {
    evaluatePrompt: typeof evaluatePrompt,
    getScoreColorClass: typeof getScoreColorClass,
    getScoreLabel: typeof getScoreLabel
  });
  // Verify it's actually on window
  if (window.PromptEvaluator && typeof window.PromptEvaluator.evaluatePrompt === 'function') {
    console.log("[PromptEvaluator] ✓ Successfully verified on window.PromptEvaluator");
  } else {
    console.error("[PromptEvaluator] ✗ Failed to verify on window.PromptEvaluator");
  }
}
})(); // End IIFE

/**
 * Message Formatter Utility
 * Formats text into HTML with proper headers, lists, and paragraph breaks
 * Enhanced to match ChatGPT-style formatting with bold paragraph headlines
 * Handles both markdown and plain text intelligently
 */

/**
 * Formats text into HTML with proper headers, lists, and paragraph breaks
 * @param {string} text - Plain text or markdown-like text to format
 * @returns {string} HTML formatted string
 */
export function formatMessageContent(text) {
  if (!text) {
    return "";
  }

  // Escape HTML to prevent XSS
  const escapeHtml = (str) => {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  };

  // Helper to detect if a sentence could be a paragraph headline
  const couldBeHeadline = (text) => {
    const trimmed = text.trim();
    // Short sentences (under 100 chars) that end with a colon
    if (trimmed.length < 100 && trimmed.endsWith(':')) {
      return true;
    }
    // Short sentences (under 80 chars) that end with period and are complete
    if (trimmed.length < 80 && trimmed.endsWith('.') && /^[A-Z]/.test(trimmed)) {
      return true;
    }
    // Sentences that start with common topic indicators and end with colon
    const topicIndicators = /^(What|How|Why|When|Where|The|These|This|That|Alternative|Key|Important|Note|Summary|Conclusion|Benefits|Advantages|Disadvantages|Examples|Features|Characteristics)/i;
    if (trimmed.length < 120 && topicIndicators.test(trimmed) && (trimmed.endsWith(':') || trimmed.endsWith('.'))) {
      return true;
    }
    // Short phrases that look like topic headers (no ending punctuation but very short)
    if (trimmed.length < 60 && /^[A-Z][a-z]+/.test(trimmed) && !trimmed.match(/[.!?]$/)) {
      return true;
    }
    return false;
  };

  // Split text into paragraphs (by double newlines or significant breaks)
  // First, normalize the text
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove duplicate sentences before processing
  // Split by sentence boundaries and deduplicate while preserving order
  const sentencePattern = /[^.!?]+[.!?]+(?:\s+|$)/g;
  const sentences = [];
  let match;
  while ((match = sentencePattern.exec(normalized)) !== null) {
    sentences.push({
      text: match[0].trim(),
      index: match.index
    });
  }
  
  // If no sentences found, use original text
  if (sentences.length === 0) {
    // No sentence boundaries found, use as-is
  } else {
    const seenSentences = new Set();
    const uniqueSentences = [];
    
    for (const sentence of sentences) {
      const trimmed = sentence.text;
      if (trimmed.length < 10) {
        // Keep very short fragments (might be abbreviations, etc.)
        uniqueSentences.push(trimmed);
        continue;
      }
      
      // Normalize sentence for comparison (remove extra whitespace, lowercase)
      const normalizedSentence = trimmed
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.!?]+$/, '') // Remove trailing punctuation for comparison
        .trim();
      
      if (!seenSentences.has(normalizedSentence)) {
        seenSentences.add(normalizedSentence);
        uniqueSentences.push(trimmed);
      }
    }
    
    // Rejoin sentences back into text
    normalized = uniqueSentences.join(' ');
  }
  
  // Split by double newlines first
  let paragraphs = normalized.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0);
  
  // Check for inline numbered lists (like "1. Item 2. Item 3. Item") and split them
  // This handles cases where numbered items are in the same paragraph
  const processedParagraphs = [];
  for (let para of paragraphs) {
    // First, check if paragraph ends with a colon and might introduce a list
    // Split on patterns like "Text: 1. Item 2. Item" -> ["Text:", "1. Item 2. Item"]
    const colonListPattern = /^(.+?:\s*)(\d+\.\s+.+)$/;
    const colonMatch = para.match(colonListPattern);
    
    if (colonMatch && colonMatch[2]) {
      // Split the intro from the list
      processedParagraphs.push(colonMatch[1].trim());
      para = colonMatch[2]; // Continue processing the list part
    }
    
    // Look for patterns like "1. Text 2. Text 3. Text" or "1. **Bold:** Text 2. **Bold:** Text"
    // Match: number followed by period, optional space, optional bold text, then content
    const inlineListPattern = /(\d+)\.\s+(\*\*[^*]+\*\*:?\s*)?([^0-9]+?)(?=\s+\d+\.|$)/g;
    const matches = [...para.matchAll(inlineListPattern)];
    
    if (matches.length >= 2) {
      // This looks like an inline numbered list, split it
      let lastIndex = 0;
      for (const match of matches) {
        // Add any text before the first match
        if (match.index > lastIndex) {
          const beforeText = para.substring(lastIndex, match.index).trim();
          if (beforeText.length > 0) {
            processedParagraphs.push(beforeText);
          }
        }
        
        // Add the list item
        const itemText = match[0].trim();
        processedParagraphs.push(itemText);
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text
      if (lastIndex < para.length) {
        const remaining = para.substring(lastIndex).trim();
        if (remaining.length > 0) {
          processedParagraphs.push(remaining);
        }
      }
    } else {
      // Not an inline list, keep as-is
      processedParagraphs.push(para);
    }
  }
  paragraphs = processedParagraphs;
  
  // If we only have one paragraph and it's very long, try to split it intelligently
  // Look for sentence boundaries after a certain length
  if (paragraphs.length === 1 && paragraphs[0].length > 150) {
    const longText = paragraphs[0];
    // Split on sentence endings followed by space and capital letter
    // This creates natural paragraph breaks for better readability
    const sentenceBreak = /([.!?])\s+([A-Z][a-z])/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let currentPart = '';
    
    // Find all sentence breaks
    const breaks = [];
    while ((match = sentenceBreak.exec(longText)) !== null) {
      breaks.push({
        pos: match.index + 1,
        before: match[1],
        after: match[2]
      });
    }
    
    // Group sentences into paragraphs (every 2-3 sentences or at natural breaks)
    if (breaks.length > 0) {
      let sentenceCount = 0;
      let startPos = 0;
      
      for (let i = 0; i < breaks.length; i++) {
        sentenceCount++;
        const breakPos = breaks[i].pos;
        
        // Create a paragraph every 2-3 sentences, or if we hit a natural break
        const shouldBreak = sentenceCount >= 2 || 
                          (i < breaks.length - 1 && breakPos - startPos > 250);
        
        if (shouldBreak || i === breaks.length - 1) {
          const endPos = i === breaks.length - 1 ? longText.length : breakPos + 1;
          const part = longText.substring(startPos, endPos).trim();
          if (part.length > 30) {
            parts.push(part);
          }
          startPos = breakPos + 1;
          sentenceCount = 0;
        }
      }
      
      // Add any remaining text
      if (startPos < longText.length) {
        const remaining = longText.substring(startPos).trim();
        if (remaining.length > 0) {
          parts.push(remaining);
        }
      }
    }
    
    // If we successfully split, use those parts; otherwise keep original
    if (parts.length > 1) {
      paragraphs = parts;
    }
  }
  
  const result = [];
  let inList = false;
  let listType = null;
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      const tag = listType === 'ol' ? 'ol' : 'ul';
      result.push(`<${tag}>${listItems.join('')}</${tag}>`);
      listItems = [];
    }
    inList = false;
    listType = null;
  };

  for (const para of paragraphs) {
    const lines = para.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Check for markdown headers
    if (lines.length === 1) {
      const line = lines[0];
      if (line.startsWith('### ')) {
        flushList();
        const headerText = escapeHtml(line.substring(4));
        result.push(`<div class="chat-message__header chat-message__header--h3"><strong>${headerText}</strong></div>`);
        continue;
      }
      if (line.startsWith('## ')) {
        flushList();
        const headerText = escapeHtml(line.substring(3));
        result.push(`<div class="chat-message__header chat-message__header--h2"><strong>${headerText}</strong></div>`);
        continue;
      }
      if (line.startsWith('# ')) {
        flushList();
        const headerText = escapeHtml(line.substring(2));
        result.push(`<div class="chat-message__header chat-message__header--h1"><strong>${headerText}</strong></div>`);
        continue;
      }
    }

    // Check if this paragraph is a list
    const firstLine = lines[0];
    const ulMatch = firstLine.match(/^[\-\*] (.+)$/);
    // Match numbered lists: "1. Text" or "1. **Bold:** Text" (with optional bold prefix)
    const olMatch = firstLine.match(/^(\d+)\.\s+(\*\*[^*]+\*\*:?\s*)?(.+)$/);
    
    if (ulMatch || olMatch) {
      flushList();
      const isOrdered = !!olMatch;
      listType = isOrdered ? 'ol' : 'ul';
      inList = true;
      
      for (const line of lines) {
        if (isOrdered) {
          // Match numbered list items with optional bold prefix
          const itemMatch = line.match(/^(\d+)\.\s+(\*\*[^*]+\*\*:?\s*)?(.+)$/);
          if (itemMatch) {
            const boldPart = itemMatch[2] || '';
            const content = itemMatch[3] || '';
            let itemText = escapeHtml(content);
            
            // Handle bold prefix
            if (boldPart) {
              const boldText = boldPart.replace(/\*\*/g, '').replace(/:?\s*$/, '');
              const boldEscaped = escapeHtml(boldText);
              itemText = `<strong>${boldEscaped}:</strong> ${itemText}`;
            }
            
            // Convert any remaining bold markers in content
            itemText = itemText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            listItems.push(`<li>${itemText}</li>`);
          }
        } else {
          const itemMatch = line.match(/^[\-\*] (.+)$/);
          if (itemMatch) {
            let itemText = escapeHtml(itemMatch[1]);
            // Check for bold in list items
            const boldMatch = itemText.match(/^\*\*([^*]+)\*\*(.+)$/);
            if (boldMatch) {
              listItems.push(`<li><strong>${boldMatch[1]}</strong>${boldMatch[2]}</li>`);
            } else {
              // Convert any remaining bold markers
              itemText = itemText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
              listItems.push(`<li>${itemText}</li>`);
            }
          }
        }
      }
      continue;
    }
    
    // Regular paragraph - check if it has a headline
    flushList();
    const fullText = lines.join(' ');
    const escaped = escapeHtml(fullText);
    
    // Also check if the paragraph contains inline numbered list items
    // Pattern: "1. Text 2. Text 3. Text" (items separated by spaces)
    const inlineNumberedListPattern = /^(.+?:\s*)?((?:\d+\.\s+[^0-9]+(?:\s+\d+\.\s+[^0-9]+)*)+)$/;
    const inlineMatch = fullText.match(inlineNumberedListPattern);
    if (inlineMatch && inlineMatch[2]) {
      listType = 'ol';
      inList = true;
      
      // Add intro text if present
      if (inlineMatch[1]) {
        const introText = escapeHtml(inlineMatch[1].trim());
        result.push(`<p class="chat-message__paragraph">${introText}</p>`);
      }
      
      // Extract list items
      const listItemsText = inlineMatch[2];
      const itemPattern = /(\d+)\.\s+(\*\*[^*]+\*\*:?\s*)?([^0-9]+?)(?=\s+\d+\.|$)/g;
      let itemMatch;
      while ((itemMatch = itemPattern.exec(listItemsText)) !== null) {
        const boldPart = itemMatch[2] || '';
        const content = itemMatch[3] || '';
        let itemText = escapeHtml(content.trim());
        
        // Handle bold prefix
        if (boldPart) {
          const boldText = boldPart.replace(/\*\*/g, '').replace(/:?\s*$/, '');
          const boldEscaped = escapeHtml(boldText);
          itemText = `<strong>${boldEscaped}:</strong> ${itemText}`;
        }
        
        // Convert any remaining bold markers
        itemText = itemText.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        listItems.push(`<li>${itemText}</li>`);
      }
      continue;
    }
    
    // Check for markdown bold at start
    const markdownBoldMatch = escaped.match(/^\*\*([^*]+)\*\*\s*(.+)$/);
    if (markdownBoldMatch) {
      const headline = markdownBoldMatch[1];
      let content = markdownBoldMatch[2];
      content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      result.push(`<p class="chat-message__paragraph"><strong class="chat-message__paragraph-headline">${headline}</strong> ${content}</p>`);
      continue;
    }
    
    // Check if first sentence could be a headline (plain text detection)
    // Look for the first sentence (ending with period, colon, or question mark)
    const firstSentenceMatch = fullText.match(/^([^.!?:]+[.!?:])\s+(.+)$/);
    if (firstSentenceMatch) {
      const firstSentence = firstSentenceMatch[1].trim();
      const restOfText = firstSentenceMatch[2].trim();
      
      // More aggressive: if first sentence is reasonably short and there's substantial content, make it a headline
      const isShortEnough = firstSentence.length < 120;
      const hasSubstantialContent = restOfText.length > 40;
      
      if ((couldBeHeadline(firstSentence) || (isShortEnough && hasSubstantialContent)) && restOfText.length > 30) {
        // Treat first sentence as headline
        const headlineEscaped = escapeHtml(firstSentence);
        let contentEscaped = escapeHtml(restOfText);
        contentEscaped = contentEscaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        result.push(`<p class="chat-message__paragraph"><strong class="chat-message__paragraph-headline">${headlineEscaped}</strong> ${contentEscaped}</p>`);
        continue;
      }
    }
    
    // Also check for patterns like "Topic: content" or "Topic. Content"
    const colonPattern = fullText.match(/^([^:]{10,100}):\s+(.+)$/);
    if (colonPattern) {
      const potentialHeadline = colonPattern[1].trim();
      const content = colonPattern[2].trim();
      if ((couldBeHeadline(potentialHeadline + ':') || potentialHeadline.length < 80) && content.length > 30) {
        const headlineEscaped = escapeHtml(potentialHeadline);
        let contentEscaped = escapeHtml(content);
        contentEscaped = contentEscaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        result.push(`<p class="chat-message__paragraph"><strong class="chat-message__paragraph-headline">${headlineEscaped}:</strong> ${contentEscaped}</p>`);
        continue;
      }
    }
    
    // Regular paragraph - just format it
    let formatted = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result.push(`<p class="chat-message__paragraph">${formatted}</p>`);
  }

  flushList();
  
  // Add spacing between elements for better readability
  // Join with newlines to ensure proper spacing
  return result.join('\n');
}


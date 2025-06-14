import React from 'react';
import './Markdown.css';

/**
 * Component for rendering Markdown content
 * 
 * Supports common markdown syntax:
 * - Headers (# h1, ## h2, etc.)
 * - Emphasis (*italic*, **bold**, ***bold-italic***)
 * - Lists (ordered and unordered)
 * - Links
 * - Code blocks (inline and multi-line)
 * - Blockquotes
 * - Horizontal rules
 * - Tables
 */
function MarkdownRenderer({ content }) {
  if (!content) return null;

  // Process the markdown content
  const processMarkdown = (markdown) => {
    // Clone the markdown to avoid mutating the original
    let processedText = String(markdown);

    // Pre-process code blocks
    const codeBlocks = [];
    processedText = processedText.replace(/```([\s\S]*?)```/g, (match, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push({ id, code: code.trim() });
      return id;
    });

    // Pre-process inline code
    const inlineCodes = [];
    processedText = processedText.replace(/`([^`]+)`/g, (match, code) => {
      const id = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push({ id, code });
      return id;
    });

    // Process headers
    processedText = processedText
      .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // Process emphasis
    processedText = processedText
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>');

    // Process lists
    processedText = processedText
      .replace(/^\s*-\s*(.*?)$/gm, '<li>$1</li>')
      .replace(/^\s*\*\s*(.*?)$/gm, '<li>$1</li>')
      .replace(/^\s*\d+\.\s*(.*?)$/gm, '<li class="ordered">$1</li>');

    // Group list items
    processedText = processedText
      .replace(/<li>[\s\S]*?(?=(<\/li>))/g, (match) => {
        const items = match.split('<li>').filter(Boolean);
        const isOrdered = items.some(item => item.includes('class="ordered"'));
        const tag = isOrdered ? 'ol' : 'ul';
        return `<${tag}>${match}`;
      })
      .replace(/<\/li>/g, '</li>')
      .replace(/<(ul|ol)><li/g, '<$1><li')
      .replace(/<\/li><\/(ul|ol)>/g, '</li></ul>');

    // Process blockquotes
    processedText = processedText
      .replace(/^>\s*(.*?)$/gm, '<blockquote>$1</blockquote>');

    // Process horizontal rules
    processedText = processedText
      .replace(/^(-{3,}|_{3,}|\*{3,})$/gm, '<hr />');

    // Process links
    processedText = processedText
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Process images
    processedText = processedText
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" />');

    // Process tables
    processedText = processedText.replace(/^\|(.+)\|$/gm, (match, content) => {
      const cells = content.split('|').map(cell => cell.trim());
      const row = cells.map(cell => `<td>${cell}</td>`).join('');
      return `<tr>${row}</tr>`;
    });

    // Group table rows
    const tableRegex = /<tr>[\s\S]*?<\/tr>/g;
    if (tableRegex.test(processedText)) {
      processedText = processedText.replace(tableRegex, (match) => {
        return `<table>${match}</table>`;
      });
    }

    // Process paragraphs
    processedText = processedText
      .replace(/^([^<].*?)$/gm, '<p>$1</p>')
      .replace(/<p>\s*<\/p>/g, '');

    // Replace line breaks
    processedText = processedText
      .replace(/\n/g, '<br />');

    // Restore code blocks
    codeBlocks.forEach(({ id, code }) => {
      processedText = processedText.replace(id, `<pre><code>${escapeHtml(code)}</code></pre>`);
    });

    // Restore inline code
    inlineCodes.forEach(({ id, code }) => {
      processedText = processedText.replace(id, `<code>${escapeHtml(code)}</code>`);
    });

    return processedText;
  };

  // Escape HTML special characters in code blocks
  const escapeHtml = (unsafe) => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const processedContent = processMarkdown(content);

  return (
    <div 
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: processedContent }}
    />
  );
}

export default MarkdownRenderer;
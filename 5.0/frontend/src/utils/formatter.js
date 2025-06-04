/**
 * Format message content with markdown-like syntax
 * @param {string} content - The raw message content
 * @returns {string} - HTML formatted content
 */
export function formatMessageContent(content) {
  if (!content) return '';
  
  // Convert markdown-like formatting to HTML
  let formattedContent = content
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic text
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Headers
    .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
    .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    // Lists
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/^[0-9]+\. (.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n)+/g, (match) => `<ol>${match}</ol>`)
    // Code blocks
    .replace(/```(.*?)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Convert URLs to links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  formattedContent = formattedContent.replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return formattedContent;
}

/**
 * Format date to localized string
 * @param {string|Date} date - The date to format
 * @returns {string} - Formatted date string
 */
export function formatDate(date) {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format time to localized string
 * @param {string|Date} time - The time to format
 * @returns {string} - Formatted time string
 */
export function formatTime(time) {
  if (!time) return '';
  
  const dateObj = typeof time === 'string' ? new Date(time) : time;
  
  return dateObj.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format file size
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
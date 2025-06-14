import React, { useState } from 'react';
import MarkdownRenderer from '../Markdown/MarkdownRenderer';

function Message({ message, useMarkdown = true }) {
  const { type, content, timestamp, messageType } = message;
  const [showActions, setShowActions] = useState(false);
  
  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const avatarIcon = {
    user: 'fas fa-user',
    assistant: 'fas fa-robot',
    system: 'fas fa-cog'
  }[type] || 'fas fa-circle';
  
  const senderName = {
    user: 'You',
    assistant: 'Assistant',
    system: 'System'
  }[type] || type;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content)
      .then(() => {
        // Show a temporary "Copied!" indicator
        const copyIndicator = document.createElement('div');
        copyIndicator.className = 'copy-indicator';
        copyIndicator.innerHTML = '<i class="fas fa-check"></i> Copied!';
        document.body.appendChild(copyIndicator);
        
        setTimeout(() => {
          copyIndicator.classList.add('show');
        }, 10);
        
        setTimeout(() => {
          copyIndicator.classList.remove('show');
          setTimeout(() => {
            document.body.removeChild(copyIndicator);
          }, 300);
        }, 1500);
      })
      .catch(err => {
        console.error('Failed to copy message: ', err);
      });
  };

  // Helper function for text-only rendering (no markdown)
  const formatSimpleContent = (content) => {
    // Convert markdown-like formatting
    let formattedContent = content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    
    // Convert URLs to links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    formattedContent = formattedContent.replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    
    return formattedContent;
  };

  return (
    <div 
      className={`message ${type}-message ${messageType === 'error' ? 'error-message' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="message-header">
        <div className={`message-avatar ${type}-avatar`}>
          <i className={avatarIcon}></i>
        </div>
        <div className="message-info">
          <div className="message-sender">{senderName}</div>
          <div className="message-time">{time}</div>
        </div>
      </div>
      <div className="message-body">
        {useMarkdown ? (
          <div className="message-content">
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <div 
            className="message-content"
            dangerouslySetInnerHTML={{ __html: formatSimpleContent(content) }}
          />
        )}
        
        {showActions && (
          <div className="message-actions">
            <button 
              className="message-action-btn" 
              onClick={copyToClipboard}
              title="Copy to clipboard"
            >
              <i className="fas fa-copy"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Message;
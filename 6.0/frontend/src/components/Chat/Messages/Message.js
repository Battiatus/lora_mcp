import React from 'react';

function Message({ message }) {
  const { type, content, timestamp, messageType } = message;
  
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
  
  const formatMessageContent = (content) => {
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
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    
    return formattedContent;
  };

  return (
    <div className={`message ${type}-message ${messageType === 'error' ? 'error-message' : ''}`}>
      <div className="message-header">
        <div className={`message-avatar ${type}-avatar`}>
          <i className={avatarIcon}></i>
        </div>
        <div className="message-info">
          <div className="message-sender">{senderName}</div>
          <div className="message-time">{time}</div>
        </div>
      </div>
      <div 
        className="message-content"
        dangerouslySetInnerHTML={{ __html: formatMessageContent(content) }}
      />
    </div>
  );
}

export default Message;
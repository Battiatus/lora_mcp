import React, { useState, useRef, useEffect } from 'react';

export default function MessageInput({ onSendMessage, isConnected, mode }) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      autoResizeTextarea();
    }
  }, [message]);

  const autoResizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  const handleSubmit = () => {
    if (!message.trim() || !isConnected) return;
    
    onSendMessage(message);
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="input-wrapper">
      <textarea 
        ref={textareaRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={
          mode === 'task' 
            ? 'Describe a complex task to automate...' 
            : 'Type your message or ask a question...'
        }
        rows={1}
        disabled={!isConnected}
        className="message-textarea"
      />
      
      <div className="input-actions">
        <button 
          type="button" 
          onClick={handleSubmit}
          disabled={!message.trim() || !isConnected}
          className="send-btn"
          aria-label="Send message"
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </div>
      
      <div className="input-footer">
        <span className="input-hint">Press Enter to send, Shift+Enter for new line</span>
        {!isConnected && (
          <span className="connection-status">
            <i className="fas fa-exclamation-circle"></i> Disconnected
          </span>
        )}
      </div>
    </div>
  );
}
import React, { useState, useRef, useEffect } from 'react';
import './Input.css';

function InputContainer({ onSendMessage, mode, typing, disabled }) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  
  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, [message]);
  
  const handleChange = (e) => {
    setMessage(e.target.value);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleSend = () => {
    if (!message.trim() || disabled) return;
    
    onSendMessage(message);
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };
  
  return (
    <div className="input-container">
      <div className="input-wrapper">
        <textarea 
          id="messageInput"
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'task'
              ? 'Describe a complex task to automate...'
              : 'Type your message or ask a question...'
          }
          rows="1"
        />
        <div className="input-actions">
          <button 
            className="send-btn" 
            onClick={handleSend}
            disabled={!message.trim() || disabled}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
      <div className="input-footer">
        <span className="input-hint">Press Enter to send, Shift+Enter for new line</span>
        <div className={`typing-indicator ${typing ? 'show' : ''}`}>
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>Assistant is thinking...</span>
        </div>
      </div>
    </div>
  );
}

export default InputContainer;
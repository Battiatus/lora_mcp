import React, { useState, useRef, useEffect } from 'react';
import './Input.css';

function InputContainer({ onSendMessage, mode, typing, disabled }) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  
  // Debug output for understanding prop values
  useEffect(() => {
    console.log("InputContainer props:", { mode, typing, disabled, hasMessage: Boolean(message.trim()) });
  }, [mode, typing, disabled, message]);
  
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

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };
  
  const handleSend = () => {
    // Check if message is not empty and interface is not disabled
    if (!message.trim() || disabled) {
      console.log("Cannot send message:", 
        !message.trim() ? "Message empty" : "Interface disabled");
      return;
    }
    
    console.log("Sending message:", message);
    
    // Send message
    onSendMessage(message);
    
    // Clear message after sending
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };
  
  // Determine if button should be disabled
  const isButtonDisabled = !message.trim() || disabled;
  
  return (
    <div className="input-container">
      <div className={`input-wrapper ${disabled ? 'disabled' : ''} ${isFocused ? 'focused' : ''}`}>
        <div className="input-icon">
          <i className={`fas fa-${mode === 'task' ? 'tasks' : 'comment-alt'}`}></i>
        </div>
        <textarea 
          id="messageInput"
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={
            mode === 'task'
              ? 'Describe a complex task to automate...'
              : 'Type your message or ask a question...'
          }
          rows="1"
          disabled={disabled}
          className={disabled ? 'disabled' : ''}
        />
        <div className="input-actions">
          <button 
            className={`send-btn ${isButtonDisabled ? 'disabled' : ''}`}
            onClick={handleSend}
            disabled={isButtonDisabled}
            title={
              disabled 
                ? "Session not active. Create a new session."
                : !message.trim() 
                  ? "Please enter a message" 
                  : "Send"
            }
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
      <div className="input-footer">
        <span className="input-hint">Press Enter to send, Shift+Enter for a new line</span>
        <div className={`typing-indicator ${typing ? 'show' : ''}`}>
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>Assistant is thinking...</span>
        </div>
      </div>
      
      {/* Status message when input is disabled */}
      {disabled && (
        <div className="input-status-message">
          <i className="fas fa-info-circle"></i>
          Create a new session to start chatting
        </div>
      )}
    </div>
  );
}

export default InputContainer;
import React, { useMemo } from 'react';
import { formatMessageContent } from '../../utils/formatter';

export default function MessageList({ messages, openModal }) {
  // Format messages for display
  const formattedMessages = useMemo(() => {
    return messages.map((msg, index) => {
      // Create a unique key for each message
      const key = `msg-${index}-${msg.timestamp}`;
      
      // Determine avatar icon based on sender
      const avatarIcon = {
        user: 'fas fa-user',
        assistant: 'fas fa-robot',
        system: 'fas fa-cog'
      }[msg.sender] || 'fas fa-circle';
      
      // Determine sender display name
      const senderName = {
        user: 'You',
        assistant: 'Assistant',
        system: 'System'
      }[msg.sender] || msg.sender;
      
      // Format timestamp
      const time = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Check if this is a tool message
      const isToolMessage = msg.toolName && !msg.isImage;
      
      // Check if this is a task progress message
      const isTaskProgress = msg.isTask;
      
      // Check if this is an image message
      const isImageMessage = msg.isImage && msg.imageSrc;
      
      // Render appropriate message component based on type
      return (
        <div key={key} className={`message ${msg.sender}-message`}>
          {!isTaskProgress && !isImageMessage && (
            <div className="message-header">
              <div className={`message-avatar ${msg.sender}-avatar`}>
                <i className={avatarIcon}></i>
              </div>
              <div className="message-info">
                <div className="message-sender">{senderName}</div>
                <div className="message-time">{time}</div>
              </div>
            </div>
          )}
          
          {!isToolMessage && !isTaskProgress && !isImageMessage && (
            <div className={`message-content ${msg.isError ? 'error' : ''}`}>
              {formatMessageContent(msg.content)}
            </div>
          )}
          
          {isToolMessage && (
            <div className="tool-message" data-tool-name={msg.toolName}>
              <div className="tool-header">
                <div className="tool-icon">
                  <i className="fas fa-cog"></i>
                </div>
                <div className="tool-name">{msg.toolName}</div>
                <div className={`tool-status ${msg.status || 'default'}`}>
                  {msg.status === 'executing' ? 'Executing' : 
                   msg.status === 'success' ? 'Completed' : 
                   msg.status === 'error' ? 'Failed' : 'Preparing'}
                </div>
              </div>
              <div className="tool-result">
                {msg.toolArgs && Object.keys(msg.toolArgs).length > 0 ? (
                  <div>
                    <strong>Parameters:</strong> {
                      Object.entries(msg.toolArgs).map(([key, value]) => `${key}: ${value}`).join(', ')
                    }
                  </div>
                ) : (
                  <div><strong>Parameters:</strong> No parameters</div>
                )}
                
                {msg.content && (
                  <div>
                    <strong>Status:</strong> {msg.content}
                  </div>
                )}
                
                {msg.result && (
                  <div>
                    <strong>Result:</strong> {msg.result}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {isTaskProgress && (
            <div className="task-progress">
              <div className="progress-header">
                <div className="progress-title">Task Execution</div>
                <div className="progress-steps">
                  Step <span className="current-step-num">{msg.step || 0}</span> of 
                  <span className="total-steps">{msg.steps || '?'}</span>
                </div>
              </div>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: msg.taskStatus === 'completed' ? '100%' : 
                          msg.step ? `${Math.min((msg.step / 20) * 100, 95)}%` : '0%' 
                  }}
                ></div>
              </div>
              <div className="current-step">
                {msg.content}
              </div>
            </div>
          )}
          
          {isImageMessage && (
            <div className="message-image">
              <img 
                src={msg.imageSrc} 
                alt="Screenshot" 
                style={{ maxWidth: '300px', borderRadius: '8px', cursor: 'pointer' }}
                onClick={() => openModal('Screenshot', (
                  <img src={msg.imageSrc} alt="Screenshot" style={{ maxWidth: '100%' }} />
                ))}
              />
            </div>
          )}
        </div>
      );
    });
  }, [messages, openModal]);

  return (
    <div className="messages-container">
      {messages.length === 0 ? (
        <div className="welcome-message">
          <div className="welcome-icon">
            <i className="fas fa-robot"></i>
          </div>
          <h2>Welcome to MCP Advanced Assistant</h2>
          <p>Your intelligent web automation and research companion. Choose a mode and start your conversation.</p>
          <div className="welcome-features">
            <div className="feature">
              <i className="fas fa-globe"></i>
              <span>Web Navigation</span>
            </div>
            <div className="feature">
              <i className="fas fa-search"></i>
              <span>Research & Analysis</span>
            </div>
            <div className="feature">
              <i className="fas fa-cogs"></i>
              <span>Task Automation</span>
            </div>
          </div>
        </div>
      ) : (
        formattedMessages
      )}
    </div>
  );
}
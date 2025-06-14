import React, { useEffect, useRef } from 'react';
import Message from './Message.js';
import ToolMessage from './ToolMessage.js';
import TaskProgress from './TaskProgress.js';
import ImageMessage from './ImageMessage.js';
import MarkdownRenderer from '../Markdown/MarkdownRenderer.js';
import './Messages.css';

function MessageContainer({ messages, onImageClick, useMarkdown = true }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Check if messages array is empty or only contains the welcome message
  const isEmptyChat = messages.length === 0 || 
    (messages.length === 1 && messages[0].id.startsWith('welcome'));

  return (
    <div className="messages-container">
      {isEmptyChat ? (
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
        messages.map(message => {
          switch (message.type) {
            case 'user':
            case 'assistant':
            case 'system':
              return (
                <Message 
                  key={message.id} 
                  message={message}
                  useMarkdown={useMarkdown}
                />
              );
              
            case 'tool':
              return (
                <ToolMessage 
                  key={message.id} 
                  message={message}
                  expandByDefault={window.settings?.autoExpandToolOutput}
                />
              );
              
            case 'progress':
              return (
                <TaskProgress 
                  key={message.id} 
                  progress={message} 
                />
              );
              
            case 'image':
              return (
                <ImageMessage 
                  key={message.id} 
                  image={message} 
                  onClick={() => onImageClick(message.data, message.format)} 
                />
              );
              
            default:
              return null;
          }
        })
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageContainer;
import { useState } from 'react';
import { useChatContext } from '../../context/ChatContext';
import webSocketService from '../../services/webSocketService';

export default function Sidebar({ currentMode, onSwitchMode }) {
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    message: 'Connecting...'
  });
  const { clearMessages, exportChat } = useChatContext();

  // Register connection status handler
  useState(() => {
    webSocketService.onConnectionChange((connected, message) => {
      setConnectionStatus({ connected, message });
    });
  }, []);

  // Example commands to suggest to the user
  const exampleCommands = [
    {
      title: 'AI Trends Research',
      text: 'Research the latest AI trends and create a comprehensive report',
      icon: 'fas fa-brain'
    },
    {
      title: 'News Analysis',
      text: 'Navigate to news websites and analyze current events',
      icon: 'fas fa-newspaper'
    },
    {
      title: 'UI Documentation',
      text: 'Take screenshots and document the user interface',
      icon: 'fas fa-desktop'
    }
  ];

  // Quick actions for common tasks
  const quickActions = [
    {
      title: 'Screenshot',
      action: 'screenshot',
      icon: 'fas fa-camera'
    },
    {
      title: 'Navigate',
      action: 'navigate',
      icon: 'fas fa-globe'
    },
    {
      title: 'Research',
      action: 'research',
      icon: 'fas fa-search'
    },
    {
      title: 'Analyze',
      action: 'analyze',
      icon: 'fas fa-chart-line'
    }
  ];

  // Handle quick action click
  const handleQuickAction = (action) => {
    let promptText = '';
    
    switch (action) {
      case 'screenshot':
        promptText = 'Take a screenshot of the current page';
        break;
      case 'navigate':
        promptText = 'Navigate to https://example.com';
        break;
      case 'research':
        promptText = 'Research the latest trends in artificial intelligence';
        break;
      case 'analyze':
        promptText = 'Analyze the current page content and provide insights';
        break;
      default:
        return;
    }
    
    // Set the textarea value
    const textarea = document.querySelector('.message-textarea');
    if (textarea) {
      textarea.value = promptText;
      
      // Trigger input event to resize textarea
      const event = new Event('input', { bubbles: true });
      textarea.dispatchEvent(event);
      
      // Focus the textarea
      textarea.focus();
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <i className="fas fa-robot"></i>
          <span>MCP Assistant</span>
        </div>
        <div className="status-indicator">
          <div className={`status-dot ${connectionStatus.connected ? 'connected' : ''}`}></div>
          <span>{connectionStatus.message}</span>
        </div>
      </div>
      
      <div className="sidebar-content">
        <div className="mode-selector">
          <button 
            className={`mode-btn ${currentMode === 'chat' ? 'active' : ''}`} 
            onClick={() => onSwitchMode('chat')}
          >
            <i className="fas fa-comments"></i>
            <span>Chat Mode</span>
          </button>
          <button 
            className={`mode-btn ${currentMode === 'task' ? 'active' : ''}`} 
            onClick={() => onSwitchMode('task')}
          >
            <i className="fas fa-tasks"></i>
            <span>Task Mode</span>
          </button>
        </div>
        
        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <div className="action-grid">
            {quickActions.map((action) => (
              <button 
                key={action.action} 
                className="action-btn" 
                onClick={() => handleQuickAction(action.action)}
              >
                <i className={action.icon}></i>
                <span>{action.title}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="examples-section">
          <h3>Example Commands</h3>
          <div className="examples-list">
            {exampleCommands.map((example) => (
              <div 
                key={example.title} 
                className="example-item" 
                onClick={() => {
                  // Set the textarea value
                  const textarea = document.querySelector('.message-textarea');
                  if (textarea) {
                    textarea.value = example.text;
                    
                    // Trigger input event to resize textarea
                    const event = new Event('input', { bubbles: true });
                    textarea.dispatchEvent(event);
                    
                    // Focus the textarea
                    textarea.focus();
                  }
                }}
              >
                <i className={example.icon}></i>
                <span>{example.title}</span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="chat-controls">
          <button 
            className="control-btn" 
            onClick={clearMessages}
          >
            <i className="fas fa-trash"></i>
            Clear Chat
          </button>
          <button 
            className="control-btn" 
            onClick={exportChat}
          >
            <i className="fas fa-download"></i>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
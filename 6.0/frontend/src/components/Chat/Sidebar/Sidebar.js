import React from 'react';
import QuickActions from './QuickActions.js';
import ExampleCommands from './ExampleCommands.js';
import './Sidebar.css';

function Sidebar({ mode, setMode, connected, user, onLogout, isOpen }) {
  return (
    <div className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">
          <i className="fas fa-robot"></i>
          <span>MCP Assistant</span>
        </div>
        
        <div className="user-info">
          <div className="user-avatar">
            {user.photoURL ? (
              <img src={user.photoURL} alt={user.displayName || 'User'} />
            ) : (
              <span>{user.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}</span>
            )}
          </div>
          <div className="user-details">
            <div className="user-name">{user.displayName || 'User'}</div>
            <button className="logout-btn" onClick={onLogout}>
              <i className="fas fa-sign-out-alt"></i>
              Log Out
            </button>
          </div>
        </div>
        
        <div className="status-indicator">
          <div className={`status-dot ${connected ? 'connected' : ''}`}></div>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
      
      <div className="sidebar-content">
        <div className="mode-selector">
          <h3>Mode</h3>
          <button 
            className={`mode-btn ${mode === 'chat' ? 'active' : ''}`}
            onClick={() => setMode('chat')}
          >
            <i className="fas fa-comments"></i>
            <span>Chat Mode</span>
          </button>
          <button 
            className={`mode-btn ${mode === 'task' ? 'active' : ''}`}
            onClick={() => setMode('task')}
          >
            <i className="fas fa-tasks"></i>
            <span>Task Mode</span>
          </button>
        </div>
        
        <QuickActions setMessage={message => {
          const input = document.getElementById('messageInput');
          if (input) {
            input.value = message;
            // Trigger a change event to update the state in InputContainer
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
            // Focus the input after setting the message
            input.focus();
          }
        }} />
        
        <ExampleCommands setMessage={message => {
          const input = document.getElementById('messageInput');
          if (input) {
            input.value = message;
            // Trigger a change event to update the state in InputContainer
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
            // Focus the input after setting the message
            input.focus();
          }
        }} />
      </div>
    </div>
  );
}

export default Sidebar;
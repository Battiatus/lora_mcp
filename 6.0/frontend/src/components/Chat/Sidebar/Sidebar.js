
import React from 'react';
import QuickActions from './QuickActions.js';
import ExampleCommands from './ExampleCommands.js';
import './Sidebar.css';

function Sidebar({ mode, setMode, connected, user, onLogout }) {
  return (
    <div className="sidebar">
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
        
        <QuickActions setMessage={message => document.getElementById('messageInput').value = message} />
        
        <ExampleCommands setMessage={message => document.getElementById('messageInput').value = message} />
      </div>
    </div>
  );
}

export default Sidebar;
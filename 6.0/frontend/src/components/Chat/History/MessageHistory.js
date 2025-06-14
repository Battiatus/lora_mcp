import React, { useState, useEffect } from 'react';
import './History.css';

function MessageHistory({ onSelectSession, currentSessionId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Load saved sessions from localStorage
    const loadSessions = () => {
      try {
        const savedSessions = localStorage.getItem('chat_sessions');
        if (savedSessions) {
          const parsedSessions = JSON.parse(savedSessions);
          setSessions(parsedSessions);
        }
      } catch (error) {
        console.error('Error loading sessions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, []);

  useEffect(() => {
    // Highlight current session
    if (currentSessionId) {
      setExpandedSession(currentSessionId);
    }
  }, [currentSessionId]);

  const handleSessionClick = (sessionId) => {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    } else {
      setExpandedSession(sessionId);
    }
  };

  const handleSelectSession = (sessionId) => {
    onSelectSession(sessionId);
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    
    // Filter out the session to delete
    const updatedSessions = sessions.filter(session => session.id !== sessionId);
    
    // Update state and localStorage
    setSessions(updatedSessions);
    localStorage.setItem('chat_sessions', JSON.stringify(updatedSessions));
    
    // If the deleted session was expanded, collapse it
    if (expandedSession === sessionId) {
      setExpandedSession(null);
    }
    
    // If the deleted session was the current session, inform the parent
    if (currentSessionId === sessionId) {
      onSelectSession(null);
    }
  };

  const toggleHistory = () => {
    setIsOpen(!isOpen);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSessionPreview = (session) => {
    if (session.messages && session.messages.length > 0) {
      // Find the last user message
      const lastUserMessage = [...session.messages]
        .reverse()
        .find(msg => msg.type === 'user');
      
      if (lastUserMessage) {
        return lastUserMessage.content.length > 30
          ? lastUserMessage.content.substring(0, 30) + '...'
          : lastUserMessage.content;
      }
    }
    
    return 'No messages';
  };

  return (
    <div className={`history-panel ${isOpen ? 'open' : ''}`}>
      <div className="history-toggle" onClick={toggleHistory}>
        <i className={`fas fa-history ${isOpen ? 'active' : ''}`}></i>
        <span className="history-tooltip">Message History</span>
      </div>
      
      <div className="history-content">
        <div className="history-header">
          <h3>
            <i className="fas fa-history"></i>
            Chat History
          </h3>
          <button className="history-close" onClick={toggleHistory}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        {loading ? (
          <div className="history-loading">
            <div className="history-spinner"></div>
            <span>Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="history-empty">
            <i className="fas fa-inbox"></i>
            <p>No saved chat sessions</p>
          </div>
        ) : (
          <div className="sessions-list">
            {sessions.map(session => (
              <div 
                key={session.id} 
                className={`session-item ${currentSessionId === session.id ? 'current' : ''}`}
                onClick={() => handleSessionClick(session.id)}
              >
                <div className="session-header">
                  <div className="session-info">
                    <div className="session-title">
                      {session.title || `Session ${session.id.substring(0, 8)}`}
                    </div>
                    <div className="session-date">
                      {formatDate(session.timestamp)}
                    </div>
                  </div>
                  <div className="session-actions">
                    <button 
                      className="session-load-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSession(session.id);
                      }}
                      title="Load this session"
                    >
                      <i className="fas fa-play"></i>
                    </button>
                    <button 
                      className="session-delete-btn"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      title="Delete this session"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                
                <div className="session-preview">
                  {getSessionPreview(session)}
                </div>
                
                {expandedSession === session.id && (
                  <div className="session-messages">
                    {session.messages.map((msg, idx) => (
                      <div 
                        key={idx} 
                        className={`history-message ${msg.type}-message`}
                      >
                        <div className="history-message-header">
                          <span className={`history-message-type ${msg.type}`}>
                            {msg.type === 'user' ? 'You' : 
                             msg.type === 'assistant' ? 'Assistant' : 'System'}
                          </span>
                          <span className="history-message-time">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                        <div className="history-message-content">
                          {msg.content.length > 100
                            ? msg.content.substring(0, 100) + '...'
                            : msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageHistory;
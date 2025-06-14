import React, { useState, useEffect, useRef } from 'react';
import { getAuth, signOut } from 'firebase/auth';
import Sidebar from './Sidebar/Sidebar';
import MessageContainer from './Messages/MessageContainer';
import InputContainer from './Input/InputContainer';
import ImageModal from './Modals/ImageModal';
import MessageHistory from './History/MessageHistory';
import SettingsPanel from './Settings/SettingsPanel';
import ThemeToggler from '../ThemeToggler';
import './ChatInterface.css';

// Utiliser la variable d'environnement ou un fallback vers la racine du serveur actuel
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';
console.log('Using API base URL:', API_BASE_URL);

function ChatInterface({ user }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState('chat'); // 'chat' or 'task'
  const [typing, setTyping] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [connected, setConnected] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // For mobile sidebar
  const [userSettings, setUserSettings] = useState({
    enableAutoSave: true,
    markdownRendering: true,
    enableNotifications: true,
    messageSound: true
  });
  const pollingIntervalRef = useRef(null);
  const notificationSound = useRef(new Audio('/message-notification.mp3'));
  
  // Load user settings
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedSettings = localStorage.getItem('app_settings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          setUserSettings(prevSettings => ({ ...prevSettings, ...parsedSettings }));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };
    
    loadSettings();
    
    // Listen for settings changes
    const handleSettingsChange = (e) => {
      setUserSettings(e.detail);
    };
    
    window.addEventListener('settings-changed', handleSettingsChange);
    
    return () => {
      window.removeEventListener('settings-changed', handleSettingsChange);
    };
  }, []);
  
  // Créer une session au chargement initial
  useEffect(() => {
    const createInitialSession = async () => {
      try {
        console.log('Creating initial session...');
        setInitializing(true);
        setConnectionError(null);
        
        // Utiliser l'URL API_BASE_URL pour s'assurer que nous passons par le web_interface
        const response = await fetch(`${API_BASE_URL}/sessions`, {
          method: 'POST',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'session-type': 'hello'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.session_id) {
          throw new Error('No session ID returned from server');
        }
        
        console.log('Session created:', data);
        setSessionId(data.session_id);
        setConnected(true);
        
        // Welcome message with improved animation
        setMessages([{
          id: 'welcome',
          type: 'system',
          content: 'Welcome to MCP Advanced Assistant! How can I help you today?',
          timestamp: new Date().toISOString()
        }]);
        
        // Start polling for responses
        startPolling(data.session_id);
      } catch (error) {
        console.error('Error creating session:', error);
        setConnected(false);
        setConnectionError(`Error: ${error.message}`);
      } finally {
        setInitializing(false);
      }
    };
    
    createInitialSession();
    
    // Cleanup function
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      
      if (sessionId) {
        fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
          method: 'DELETE'
        }).catch(err => console.error('Error cleaning up session:', err));
      }
    };
  }, []);
  
  // Démarrer le polling des réponses
  const startPolling = (sid) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    console.log('Starting polling for session:', sid);
    
    const pollForResponses = async () => {
      if (!sid) return;
      
      try {
        const response = await fetch(`${API_BASE_URL}/sessions/${sid}/responses`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch responses: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.responses && data.responses.length > 0) {
          console.log('Received responses:', data.responses);
          processResponses(data.responses);
        }
      } catch (error) {
        console.error('Error polling for responses:', error);
        // Ne pas modifier l'état connected ici pour éviter des changements constants sur erreurs temporaires
      }
    };
    
    // Polling immédiat puis toutes les secondes
    pollForResponses();
    pollingIntervalRef.current = setInterval(pollForResponses, 1000);
  };
  
  const processResponses = (responses) => {
    let shouldPlaySound = false;
    
    for (const response of responses) {
      switch (response.type) {
        case 'typing':
          setTyping(true);
          break;
          
        case 'assistant_message':
          setTyping(false);
          addMessage('assistant', response.message);
          shouldPlaySound = true;
          break;
          
        case 'assistant_tool_call':
          setTyping(false);
          addMessage('assistant', response.message);
          shouldPlaySound = true;
          break;
          
        case 'tool_executing':
          addOrUpdateToolMessage(
            response.tool_name,
            {},
            'executing',
            response.message
          );
          break;
          
        case 'tool_success':
          updateToolMessage(
            response.tool_name,
            'success',
            response.message,
            response.result
          );
          break;
          
        case 'tool_success_image':
          updateToolMessage(
            response.tool_name,
            'success',
            response.message
          );
          handleImageResult(response.content);
          break;
          
        case 'tool_error':
          updateToolMessage(
            response.tool_name,
            'error',
            response.message
          );
          break;
          
        case 'task_started':
          setTyping(false);
          addTaskProgress(response.message);
          break;
          
        case 'task_step':
          updateTaskProgress(response.step, response.message);
          addOrUpdateToolMessage(
            response.tool_name,
            response.tool_args,
            'executing',
            response.message
          );
          break;
          
        case 'task_completed':
          completeTaskProgress(response.steps);
          if (response.message && response.message !== "Task completed successfully!") {
            addMessage('assistant', response.message);
            shouldPlaySound = true;
          }
          break;
          
        case 'system_message':
          addMessage('system', response.message);
          break;
          
        case 'error':
          setTyping(false);
          addMessage('system', `❌ Error: ${response.message}`, 'error');
          break;
          
        default:
          console.warn('Unknown response type:', response.type);
      }
    }
    
    // Play notification sound if needed and enabled
    if (shouldPlaySound && userSettings.messageSound && userSettings.enableNotifications) {
      try {
        notificationSound.current.play().catch(err => console.log('Audio play error:', err));
      } catch (error) {
        console.error('Failed to play notification sound:', error);
      }
    }
    
    // Show desktop notification if enabled
    if (shouldPlaySound && userSettings.enableNotifications && 'Notification' in window) {
      if (Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        new Notification('New Message', {
          body: 'You have received a new message from MCP Assistant',
          icon: '/logo192.png'
        });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  };
  
  const addMessage = (sender, content, type = 'normal') => {
    const newMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: sender,
      content,
      timestamp: new Date().toISOString(),
      messageType: type
    };
    
    setMessages(prevMessages => [...prevMessages, newMessage]);
    
    // Auto-save session if enabled
    if (userSettings.enableAutoSave && sessionId) {
      saveSessionToHistory([...messages, newMessage]);
    }
  };
  
  const saveSessionToHistory = (currentMessages) => {
    try {
      // Get existing sessions
      const savedSessionsJSON = localStorage.getItem('chat_sessions') || '[]';
      let savedSessions = JSON.parse(savedSessionsJSON);
      
      // Check if current session exists
      const existingSessionIndex = savedSessions.findIndex(session => session.id === sessionId);
      
      const sessionData = {
        id: sessionId,
        title: `Chat ${new Date().toLocaleDateString()}`,
        timestamp: new Date().toISOString(),
        messages: currentMessages
      };
      
      if (existingSessionIndex !== -1) {
        // Update existing session
        savedSessions[existingSessionIndex] = sessionData;
      } else {
        // Add new session
        savedSessions.push(sessionData);
        
        // Limit the number of saved sessions (get from settings)
        const maxSessions = userSettings.maxHistorySessions || 20;
        if (savedSessions.length > maxSessions) {
          savedSessions = savedSessions.slice(-maxSessions);
        }
      }
      
      // Save back to localStorage
      localStorage.setItem('chat_sessions', JSON.stringify(savedSessions));
    } catch (error) {
      console.error('Error saving session to history:', error);
    }
  };
  
  const addTaskProgress = (message) => {
    const progressMessage = {
      id: `progress-${Date.now()}`,
      type: 'progress',
      status: 'started',
      message,
      step: 0,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prevMessages => [...prevMessages, progressMessage]);
  };
  
  const updateTaskProgress = (step, message) => {
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages];
      const progressIndex = updatedMessages.findIndex(msg => msg.type === 'progress');
      
      if (progressIndex !== -1) {
        updatedMessages[progressIndex] = {
          ...updatedMessages[progressIndex],
          status: 'in-progress',
          step,
          message
        };
      }
      
      return updatedMessages;
    });
  };
  
  const completeTaskProgress = (totalSteps) => {
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages];
      const progressIndex = updatedMessages.findIndex(msg => msg.type === 'progress');
      
      if (progressIndex !== -1) {
        updatedMessages[progressIndex] = {
          ...updatedMessages[progressIndex],
          status: 'completed',
          step: totalSteps,
          totalSteps,
          message: `Task completed in ${totalSteps} steps`
        };
      }
      
      return updatedMessages;
    });
  };
  
  const addOrUpdateToolMessage = (toolName, args, status, message = "") => {
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages];
      const toolIndex = updatedMessages.findIndex(
        msg => msg.type === 'tool' && msg.toolName === toolName
      );
      
      if (toolIndex !== -1) {
        // Update existing tool message
        updatedMessages[toolIndex] = {
          ...updatedMessages[toolIndex],
          status,
          message
        };
      } else {
        // Add new tool message
        updatedMessages.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'tool',
          toolName,
          args,
          status,
          message,
          timestamp: new Date().toISOString()
        });
      }
      
      return updatedMessages;
    });
  };
  
  const updateToolMessage = (toolName, status, message, result = null) => {
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages];
      const toolIndex = updatedMessages.findIndex(
        msg => msg.type === 'tool' && msg.toolName === toolName
      );
      
      if (toolIndex !== -1) {
        // Update existing tool message
        updatedMessages[toolIndex] = {
          ...updatedMessages[toolIndex],
          status,
          message,
          result
        };
      } else {
        // Add new tool message if not found
        updatedMessages.push({
          id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'tool',
          toolName,
          args: {},
          status,
          message,
          result,
          timestamp: new Date().toISOString()
        });
      }
      
      return updatedMessages;
    });
  };
  
  const handleImageResult = (content) => {
    // Find image data in content
    for (const item of content) {
      if (item.image) {
        const imageMessage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'image',
          format: item.image.format,
          data: item.image.data,
          timestamp: new Date().toISOString()
        };
        
        setMessages(prevMessages => [...prevMessages, imageMessage]);
        break;
      }
    }
  };
  
  const handleSendMessage = async (message) => {
    if (!sessionId || !message.trim()) {
      console.warn('Cannot send message: no session ID or empty message');
      return;
    }
    
    // Add user message to UI
    addMessage('user', message);
    
    // Indicate typing
    setTyping(true);
    
    try {
      console.log(`Sending ${mode} message:`, message);
      
      const endpoint = mode === 'task' ? 'task' : 'chat';
      const payload = mode === 'task' ? { task: message } : { message };
      
      // Utiliser l'URL définie par API_BASE_URL
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/${endpoint}`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Message sent successfully:', data);
      
      // Close sidebar on mobile after sending message
      if (window.innerWidth <= 768) {
        setSidebarOpen(false);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setTyping(false);
      addMessage('system', `Error: ${error.message}`, 'error');
      
      // Check if we need to re-establish the connection
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        setConnected(false);
        setConnectionError('Connection lost. Attempting to reconnect...');
        
        // Try to reconnect by creating a new session
        try {
          const response = await fetch(`${API_BASE_URL}/sessions`, {
            method: 'POST',
            credentials: 'omit',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            setSessionId(data.session_id);
            setConnected(true);
            setConnectionError(null);
            addMessage('system', 'Reconnected successfully!', 'normal');
            startPolling(data.session_id);
          }
        } catch (reconnectError) {
          console.error('Failed to reconnect:', reconnectError);
        }
      }
    }
  };
  
  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth).catch(error => {
      console.error('Error signing out:', error);
    });
  };
  
  const handleClearChat = () => {
    setMessages([{
      id: 'welcome',
      type: 'system',
      content: 'Chat cleared. How can I help you today?',
      timestamp: new Date().toISOString()
    }]);
  };
  
  const handleExportChat = () => {
    const chatData = {
      sessionId,
      timestamp: new Date().toISOString(),
      messages
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-chat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const showImageModal = (imageData, format) => {
    setModalImage({
      src: `data:image/${format};base64,${imageData}`,
      alt: 'Screenshot'
    });
  };
  
  const closeModal = () => {
    setModalImage(null);
  };
  
  // Toggle sidebar on mobile
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };
  
  // Load a session from history
  const handleLoadSession = (loadedSessionId) => {
    try {
      const savedSessionsJSON = localStorage.getItem('chat_sessions') || '[]';
      const savedSessions = JSON.parse(savedSessionsJSON);
      
      const session = savedSessions.find(s => s.id === loadedSessionId);
      
      if (session) {
        setMessages(session.messages);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };
  
  // Ajouter une erreur de connexion si besoin
  const connectionMessage = connectionError ? (
    <div className="connection-error">
      <i className="fas fa-exclamation-triangle"></i>
      {connectionError}
    </div>
  ) : null;
  
  return (
    <div className="app-container">
      {/* Mobile sidebar toggle button */}
      {window.innerWidth <= 768 && (
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          <i className={`fas fa-${sidebarOpen ? 'times' : 'bars'}`}></i>
        </button>
      )}
      
      {/* Sidebar overlay for mobile */}
      {sidebarOpen && window.innerWidth <= 768 && (
        <div className="sidebar-overlay show" onClick={() => setSidebarOpen(false)}></div>
      )}
      
      <Sidebar 
        mode={mode}
        setMode={setMode}
        connected={connected}
        user={user}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
      />
      
      <div className="main-content">
        <div className="chat-header">
          <h1>{mode === 'task' ? 'Task Automation Assistant' : 'Intelligent Web Assistant'}</h1>
          <div className="chat-controls">
            <button className="control-btn" onClick={handleClearChat}>
              <i className="fas fa-trash"></i>
              <span className="control-btn-text">Clear</span>
            </button>
            <button className="control-btn" onClick={handleExportChat}>
              <i className="fas fa-download"></i>
              <span className="control-btn-text">Export</span>
            </button>
          </div>
        </div>
        
        {connectionMessage}
        
        <div className="chat-container">
          <MessageContainer 
            messages={messages} 
            onImageClick={showImageModal}
            useMarkdown={userSettings.markdownRendering}
          />
          
          <InputContainer 
            onSendMessage={handleSendMessage}
            mode={mode}
            typing={typing}
            disabled={!connected}
          />
        </div>
      </div>
      
      {/* Message History Panel */}
      {userSettings.enableHistory && (
        <MessageHistory 
          onSelectSession={handleLoadSession} 
          currentSessionId={sessionId}
        />
      )}
      
      {/* Settings Panel */}
      <SettingsPanel />
      
      {/* Theme Toggler */}
      <ThemeToggler />
      
      {/* Image Modal */}
      {modalImage && (
        <ImageModal 
          image={modalImage}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

export default ChatInterface;
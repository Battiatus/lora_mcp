import React, { createContext, useState, useContext } from 'react';

// Create context
const ChatContext = createContext();

// Custom hook to use the chat context
export function useChatContext() {
  return useContext(ChatContext);
}

// Chat provider component
export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);

  // Add a message to the chat
  const addMessage = (message) => {
    setMessages(prevMessages => [...prevMessages, message]);
  };

  // Clear all messages
  const clearMessages = () => {
    setMessages([]);
  };

  // Export chat to JSON
  const exportChat = () => {
    const chatData = {
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      messages: messages
    };

    // Create a downloadable blob
    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: 'application/json'
    });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-chat-${new Date().toISOString().split('T')[0]}.json`;
    
    // Trigger download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Set session ID
  const setSession = (id) => {
    setSessionId(id);
  };

  // Value object to be provided to consumers
  const value = {
    messages,
    sessionId,
    addMessage,
    clearMessages,
    exportChat,
    setSession
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
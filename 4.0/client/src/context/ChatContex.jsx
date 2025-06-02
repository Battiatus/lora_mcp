import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from './AuthContext';
import { useSettings } from './SettingsContext';
import { getChatSessions, createChatSession, getChatHistory } from '../services/chatService';
import { executeTask, sendChatMessage } from '../services/messageService';
import { useWebSocket } from '../hooks/useWebSocket';

// Create context
const ChatContext = createContext();

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  
  // State variables
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [taskInProgress, setTaskInProgress] = useState(false);
  const [currentTask, setCurrentTask] = useState(null);
  
  // WebSocket connection for real-time updates
  const { 
    connected, 
    message: wsMessage,
    sendMessage: sendWsMessage,
    error: wsError
  } = useWebSocket(
    `${process.env.REACT_APP_WEBSOCKET_URL}/ws/${currentSessionId}`,
    !!currentSessionId
  );
  
  // Load chat sessions
  const loadSessions = useCallback(async () => {
    if (!user) return;
    
    try {
      const sessionsData = await getChatSessions();
      setSessions(sessionsData);
      
      // Set default session if none selected
      if (sessionsData.length > 0 && !currentSessionId) {
        setCurrentSessionId(sessionsData[0].id);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    }
  }, [user, currentSessionId]);
  
  // Load messages for current session
  const loadMessages = useCallback(async () => {
    if (!currentSessionId) return;
    
    setIsLoading(true);
    try {
      const messagesData = await getChatHistory(currentSessionId);
      setMessages(messagesData);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId]);
  
  // Create a new chat session
  const createSession = useCallback(async (title = 'New Conversation') => {
    if (!user) return;
    
    try {
      const newSession = await createChatSession(title);
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      setMessages([]);
      return newSession.id;
    } catch (error) {
      console.error('Error creating chat session:', error);
    }
  }, [user]);
  
  // Send a message in chat mode
  const sendMessage = useCallback(async (messageText) => {
    if (!currentSessionId || !messageText.trim()) return;
    
    // Add user message to UI immediately
    const userMessage = {
      id: uuidv4(),
      sessionId: currentSessionId,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Send message via WebSocket
    sendWsMessage({
      type: 'chat',
      message: messageText,
      llmParams: settings.llmParams
    });
  }, [currentSessionId, sendWsMessage, settings.llmParams]);
  
  // Execute a task
  const startTask = useCallback(async (taskDescription) => {
    if (!currentSessionId || !taskDescription.trim()) return;
    
    // Add user message to UI immediately
    const userMessage = {
      id: uuidv4(),
      sessionId: currentSessionId,
      role: 'user',
      content: taskDescription,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setTaskInProgress(true);
    setCurrentTask({
      description: taskDescription,
      step: 0,
      totalSteps: null
    });
    
    // Send task via WebSocket
    sendWsMessage({
      type: 'task',
      task: taskDescription,
      llmParams: settings.llmParams
    });
  }, [currentSessionId, sendWsMessage, settings.llmParams]);
  
  // Process incoming WebSocket messages
  useEffect(() => {
    if (!wsMessage) return;
    
    const data = wsMessage;
    
    switch (data.type) {
      case 'typing':
        // Handle typing indicator
        break;
        
      case 'assistant_message':
        // Add assistant message
        setMessages(prev => [
          ...prev, 
          {
            id: uuidv4(),
            sessionId: currentSessionId,
            role: 'assistant',
            content: data.message,
            timestamp: new Date().toISOString()
          }
        ]);
        break;
        
      case 'assistant_tool_call':
        // Add tool call message
        setMessages(prev => [
          ...prev, 
          {
            id: uuidv4(),
            sessionId: currentSessionId,
            role: 'assistant',
            content: data.message,
            toolName: data.tool_name,
            toolArgs: data.tool_args,
            timestamp: new Date().toISOString()
          }
        ]);
        break;
        
      case 'tool_executing':
        // Update tool execution status
        break;
        
      case 'tool_success':
      case 'tool_success_image':
        // Add tool result
        if (data.content) {
          setMessages(prev => [
            ...prev, 
            {
              id: uuidv4(),
              sessionId: currentSessionId,
              role: 'tool',
              content: data.result || data.message,
              image: data.type === 'tool_success_image' ? data.content : null,
              toolName: data.tool_name,
              success: true,
              timestamp: new Date().toISOString()
            }
          ]);
        }
        break;
        
      case 'tool_error':
        // Add tool error
        setMessages(prev => [
          ...prev, 
          {
            id: uuidv4(),
            sessionId: currentSessionId,
            role: 'tool',
            content: data.message,
            toolName: data.tool_name,
            success: false,
            timestamp: new Date().toISOString()
          }
        ]);
        break;
        
      case 'task_started':
        // Update task status
        setTaskInProgress(true);
        setCurrentTask({
          description: data.message.replace('Starting task: ', ''),
          step: 0,
          totalSteps: null
        });
        break;
        
      case 'task_step':
        // Update task progress
        setCurrentTask(prev => ({
          ...prev,
          step: data.step,
          totalSteps: prev.totalSteps || '?',
          currentAction: data.message
        }));
        break;
        
      case 'task_completed':
        // Complete task
        setTaskInProgress(false);
        setCurrentTask(prev => ({
          ...prev,
          completed: true,
          totalSteps: data.steps
        }));
        
        // Add final message if provided
        if (data.message && data.message !== 'Task completed successfully!') {
          setMessages(prev => [
            ...prev,
            {
              id: uuidv4(),
              sessionId: currentSessionId,
              role: 'assistant',
              content: data.message,
              timestamp: new Date().toISOString()
            }
          ]);
        }
        break;
        
      case 'system_message':
        // Add system message
        setMessages(prev => [
          ...prev,
          {
            id: uuidv4(),
            sessionId: currentSessionId,
            role: 'system',
            content: data.message,
            timestamp: new Date().toISOString()
          }
        ]);
        break;
        
      case 'error':
        // Add error message
        setMessages(prev => [
          ...prev,
          {
            id: uuidv4(),
            sessionId: currentSessionId,
            role: 'system',
            content: data.message,
            error: true,
            timestamp: new Date().toISOString()
          }
        ]);
        
        // Reset task state if there was a task in progress
        if (taskInProgress) {
          setTaskInProgress(false);
          setCurrentTask(prev => ({
            ...prev,
            error: true,
            errorMessage: data.message
          }));
        }
        break;
        
      default:
        console.warn('Unknown message type:', data.type);
    }
  }, [wsMessage, currentSessionId]);
  
  // Load sessions when user changes
  useEffect(() => {
    loadSessions();
  }, [user, loadSessions]);
  
  // Load messages when current session changes
  useEffect(() => {
    loadMessages();
  }, [currentSessionId, loadMessages]);
  
  const value = {
    sessions,
    messages,
    currentSessionId,
    isLoading,
    taskInProgress,
    currentTask,
    connected,
    wsError,
    setCurrentSessionId,
    createSession,
    sendMessage,
    startTask,
    loadSessions,
    loadMessages
  };
  
  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};
import React, { useState, useEffect, useRef } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import mcpClientBridge from '../../services/mcpClientBridge';
import { useChatContext } from '../../context/ChatContext';

export default function ChatWindow({ mode, openModal }) {
  const [isTyping, setIsTyping] = useState(false);
  const [typingMessage, setTypingMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const { messages, addMessage, clearMessages } = useChatContext();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Initialize MCP client
    const initClient = async () => {
      try {
        const success = await mcpClientBridge.initialize();
        if (success) {
          setIsConnected(true);
        }
      } catch (error) {
        console.error('Failed to initialize MCP client:', error);
      }
    };

    initClient();

    // Register message handlers
    mcpClientBridge.addListener('message', handleWebSocketMessage);
    mcpClientBridge.addListener('status', handleConnectionStatus);
    
    // Clean up on unmount
    return () => {
      mcpClientBridge.removeListener('message', handleWebSocketMessage);
      mcpClientBridge.removeListener('status', handleConnectionStatus);
      mcpClientBridge.cleanup();
    };
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleConnectionStatus = (status) => {
    setIsConnected(status.connected);
  };

  const handleWebSocketMessage = (data) => {
    switch (data.type) {
      case 'typing':
        setIsTyping(true);
        setTypingMessage(data.message);
        break;

      case 'assistant_message':
        setIsTyping(false);
        addMessage({
          sender: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString()
        });
        break;

      case 'assistant_tool_call':
        setIsTyping(false);
        addMessage({
          sender: 'assistant',
          content: data.message,
          timestamp: new Date().toISOString(),
          toolName: data.tool_name,
          toolArgs: data.tool_args
        });
        break;

      case 'tool_executing':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          toolName: data.tool_name,
          status: 'executing'
        });
        break;

      case 'tool_success':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          toolName: data.tool_name,
          status: 'success',
          result: data.result
        });
        break;

      case 'tool_success_image':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          toolName: data.tool_name,
          status: 'success'
        });
        
        // Handle image content
        if (data.content && data.content.some(item => item.image)) {
          const imageData = data.content.find(item => item.image);
          if (imageData && imageData.image) {
            const imgSrc = `data:image/${imageData.image.format};base64,${imageData.image.data}`;
            
            addMessage({
              sender: 'system',
              content: '',
              timestamp: new Date().toISOString(),
              isImage: true,
              imageSrc: imgSrc
            });
            
            // Show image in modal on click
            const handleImageClick = () => {
              openModal('Screenshot', <img src={imgSrc} alt="Screenshot" style={{ maxWidth: '100%' }} />);
            };
            
            // Add an onClick handler to the image
            setTimeout(() => {
              const images = document.querySelectorAll('.message-image img');
              if (images && images.length > 0) {
                const lastImage = images[images.length - 1];
                lastImage.addEventListener('click', handleImageClick);
                lastImage.style.cursor = 'pointer';
              }
            }, 100);
          }
        }
        break;

      case 'tool_error':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          toolName: data.tool_name,
          status: 'error'
        });
        break;

      case 'task_started':
        setIsTyping(false);
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          isTask: true,
          taskStatus: 'started'
        });
        break;

      case 'task_step':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          isTask: true,
          taskStatus: 'in_progress',
          step: data.step
        });
        break;

      case 'task_completed':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString(),
          isTask: true,
          taskStatus: 'completed',
          steps: data.steps
        });
        break;

      case 'system_message':
        addMessage({
          sender: 'system',
          content: data.message,
          timestamp: new Date().toISOString()
        });
        break;

      case 'error':
        setIsTyping(false);
        addMessage({
          sender: 'system',
          content: `Error: ${data.message}`,
          timestamp: new Date().toISOString(),
          isError: true
        });
        break;

      default:
        console.log('Unhandled message type:', data.type);
    }
  };

  const handleSendMessage = (message) => {
    if (!message.trim() || !isConnected) {
      return;
    }

    // Add user message to UI
    addMessage({
      sender: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Send via MCP client
    mcpClientBridge.sendMessage(message, mode);
  };

  const handleClearChat = () => {
    clearMessages();
  };

  return (
    <div className="chat-container">
      <MessageList 
        messages={messages} 
        openModal={openModal}
      />
      <div ref={messagesEndRef} />
      
      <div className="input-container">
        <MessageInput 
          onSendMessage={handleSendMessage} 
          isConnected={isConnected}
          mode={mode}
        />
        
        {isTyping && (
          <div className="typing-indicator show">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span>{typingMessage || 'Assistant is thinking...'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
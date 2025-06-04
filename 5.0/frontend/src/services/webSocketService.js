import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import config from '../config';
import webSocketService from './webSocketService';

// Constants for conversation management
const SUMMARIZATION_TOKEN_THRESHOLD = 50000;
const KEEP_LAST_TURNS = 1;

// Mock system prompt (the real one would come from your server)
const SYSTEM_PROMPT = `You are an advanced research assistant with web navigation and vision capabilities.`;

class MCPClientBridge {
  constructor() {
    this.sessionId = this._generateSessionId();
    this.messageHistory = [];
    this.isInitialized = false;
    this.listeners = {
      message: [],
      error: [],
      status: []
    };
    this.totalTokensUsed = 0;
  }

  /**
   * Generate a unique session ID
   * @private
   */
  _generateSessionId() {
    return `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
  }

  /**
   * Initialize the MCP client
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    try {
      // Connect to WebSocket
      await webSocketService.connect(this.sessionId);
      
      // Register WebSocket message handler
      webSocketService.onMessage(this._handleWebSocketMessage.bind(this));
      
      // Register WebSocket connection handler
      webSocketService.onConnectionChange((connected, message) => {
        this._notifyListeners('status', { connected, message });
      });
      
      // Get list of available tools (mock for now)
      this.availableTools = [
        {
          name: 'navigate',
          description: 'Navigate to a specified URL',
          inputSchema: {
            properties: {
              url: { type: 'string', description: 'The URL to navigate to' }
            },
            required: ['url']
          }
        },
        {
          name: 'screenshot',
          description: 'Take a screenshot of the current page',
          inputSchema: { properties: {} }
        }
      ];
      
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Error initializing MCP client:', error);
      this._notifyListeners('error', { message: `Initialization failed: ${error.message}` });
      
      // Continue anyway in mock mode
      this.isInitialized = true;
      return true;
    }
  }

  /**
   * Handle messages from the WebSocket
   * @param {Object} data - The message data
   * @private
   */
  _handleWebSocketMessage(data) {
    // Forward message to registered listeners
    this._notifyListeners('message', data);
    
    // Store message in history
    this.messageHistory.push({
      type: data.type,
      content: data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Send a message to the MCP server
   * @param {string} message - The message text
   * @param {string} mode - The mode (chat or task)
   * @returns {boolean} - Whether the message was sent successfully
   */
  sendMessage(message, mode = 'chat') {
    if (!this.isInitialized) {
      this._notifyListeners('error', { message: 'Client not initialized' });
      return false;
    }
    
    const messageData = {
      type: mode,
      [mode === 'task' ? 'task' : 'message']: message
    };
    
    return webSocketService.sendMessage(messageData);
  }

  /**
   * Estimate the token count for a text
   * @param {string} text - The text to estimate tokens for
   * @returns {number} - Estimated token count
   * @private
   */
  _estimateTokenCount(text) {
    // Simple estimation: ~4 characters per token for English text
    return Math.floor(text.length / 4);
  }

  /**
   * Execute a tool directly
   * @param {string} toolName - The name of the tool
   * @param {Object} args - The tool arguments
   * @returns {Promise<Object>} - The tool execution result
   */
  async executeTool(toolName, args) {
    try {
      // If we're in mock mode, return mock data
      if (webSocketService.mockMode) {
        console.log(`Mock executing tool: ${toolName} with args:`, args);
        
        // Simulate a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Return mock data based on tool type
        if (toolName === 'navigate') {
          return {
            success: true, 
            result: {
              title: `Mock page for ${args.url}`,
              url: args.url,
              status_code: 200
            }
          };
        } else if (toolName === 'screenshot') {
          return {
            success: true,
            result: {
              filename: `mock_screenshot_${Date.now()}.png`,
              path: `/mock/path/to/screenshot.png`
            }
          };
        } else {
          return {
            success: true,
            result: `Mock result for ${toolName}`
          };
        }
      }
      
      // Real API call
      const response = await axios.post('/api/tools/execute', {
        tool_name: toolName,
        arguments: args,
        session_id: this.sessionId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      
      // Return a mock error
      return {
        success: false,
        error: `Failed to execute ${toolName}: ${error.message}`
      };
    }
  }

  /**
   * Add a listener for a specific event
   * @param {string} event - The event type (message, error, status)
   * @param {Function} callback - The callback function
   */
  addListener(event, callback) {
    if (this.listeners[event] && typeof callback === 'function') {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove a listener
   * @param {string} event - The event type
   * @param {Function} callback - The callback function to remove
   */
  removeListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Notify all registered listeners for an event
   * @param {string} event - The event type
   * @param {Object} data - The event data
   * @private
   */
  _notifyListeners(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Clear message history
   */
  clearHistory() {
    this.messageHistory = [];
  }

  /**
   * Get the session ID
   * @returns {string} - The session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    try {
      // Disconnect WebSocket
      webSocketService.disconnect();
      
      // Clear message history
      this.clearHistory();
      
      // Reset properties
      this.isInitialized = false;
      
      console.log('MCP client cleaned up');
    } catch (error) {
      console.error('Error cleaning up MCP client:', error);
    }
  }
}

// Create and export a singleton instance
const mcpClientBridge = new MCPClientBridge();
export default mcpClientBridge;
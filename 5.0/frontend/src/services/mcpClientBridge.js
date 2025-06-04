import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import config from '../config';

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
    this.websocket = null;
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
      await this._connectWebSocket();
      
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
      return false;
    }
  }

  /**
   * Connect to WebSocket server
   * @private
   */
  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;
        
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
          this._notifyListeners('status', { connected: true, message: 'Connected' });
          resolve(true);
        };
        
        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this._handleWebSocketMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        this.websocket.onclose = () => {
          this._notifyListeners('status', { connected: false, message: 'Disconnected' });
          this._attemptReconnect();
        };
        
        this.websocket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this._notifyListeners('status', { connected: false, message: 'Connection Error' });
          reject(error);
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
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
   * Attempt to reconnect to the WebSocket server
   * @private
   */
  _attemptReconnect() {
    setTimeout(() => {
      if (this.isInitialized) {
        console.log('Attempting to reconnect...');
        this._connectWebSocket().catch((error) => {
          console.error('Reconnection failed:', error);
        });
      }
    }, config.websocket.reconnectInterval || 3000);
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
    
    try {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify(messageData));
        return true;
      } else {
        this._notifyListeners('error', { message: 'WebSocket not connected' });
        return false;
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this._notifyListeners('error', { message: `Failed to send message: ${error.message}` });
      return false;
    }
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
      throw error;
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
      if (this.websocket) {
        this.websocket.close();
        this.websocket = null;
      }
      
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
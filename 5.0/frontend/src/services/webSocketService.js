class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.sessionId = null;
    this.messageHandlers = [];
    this.connectionHandlers = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3 seconds
  }

  /**
   * Connect to the WebSocket server
   * @param {string} sessionId - The session ID to use for the connection
   * @returns {Promise} - Resolves when connection is established, rejects on error
   */
  connect(sessionId) {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve(true);
        return;
      }

      this.sessionId = sessionId;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${sessionId}`;
      
      try {
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this._notifyConnectionHandlers(true, 'Connected');
          resolve(true);
        };
        
        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this._notifyMessageHandlers(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        this.socket.onclose = () => {
          this.isConnected = false;
          this._notifyConnectionHandlers(false, 'Disconnected');
          this._attemptReconnect();
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          this._notifyConnectionHandlers(false, 'Connection Error');
          reject(error);
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Send a message through the WebSocket
   * @param {Object} message - The message to send
   * @returns {boolean} - Whether the message was sent successfully
   */
  sendMessage(message) {
    if (!this.isConnected || !this.socket) {
      console.error('Cannot send message: WebSocket not connected');
      return false;
    }
    
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      return false;
    }
  }

  /**
   * Register a handler for incoming messages
   * @param {Function} handler - The handler function
   */
  onMessage(handler) {
    if (typeof handler === 'function') {
      this.messageHandlers.push(handler);
    }
  }

  /**
   * Remove a message handler
   * @param {Function} handler - The handler function to remove
   */
  removeMessageHandler(handler) {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }

  /**
   * Register a handler for connection status changes
   * @param {Function} handler - The handler function
   */
  onConnectionChange(handler) {
    if (typeof handler === 'function') {
      this.connectionHandlers.push(handler);
      
      // Immediately notify with current status
      if (this.isConnected !== null) {
        handler(this.isConnected, this.isConnected ? 'Connected' : 'Disconnected');
      }
    }
  }

  /**
   * Remove a connection handler
   * @param {Function} handler - The handler function to remove
   */
  removeConnectionHandler(handler) {
    this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
      this._notifyConnectionHandlers(false, 'Disconnected by client');
    }
  }

  /**
   * Attempt to reconnect to the WebSocket server
   * @private
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Maximum reconnect attempts reached');
      this._notifyConnectionHandlers(false, 'Failed to reconnect after multiple attempts');
      return;
    }
    
    this.reconnectAttempts++;
    
    setTimeout(() => {
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this._notifyConnectionHandlers(false, `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.connect(this.sessionId).catch(() => {
        // If connect fails, _attemptReconnect will be called again by the onclose handler
      });
    }, this.reconnectInterval);
  }

  /**
   * Notify all registered message handlers
   * @param {Object} data - The message data
   * @private
   */
  _notifyMessageHandlers(data) {
    this.messageHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  /**
   * Notify all registered connection handlers
   * @param {boolean} connected - Whether the connection is established
   * @param {string} message - A message describing the connection status
   * @private
   */
  _notifyConnectionHandlers(connected, message) {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(connected, message);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }
}

// Create and export a singleton instance
const webSocketService = new WebSocketService();
export default webSocketService;
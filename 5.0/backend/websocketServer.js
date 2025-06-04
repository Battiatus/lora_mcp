const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');

class ConnectionManager {
  constructor() {
    this.activeConnections = {};
  }

  connect(websocket, sessionId) {
    this.activeConnections[sessionId] = websocket;
    logger.info(`WebSocket connected for session: ${sessionId}`);
  }

  disconnect(sessionId) {
    if (sessionId in this.activeConnections) {
      delete this.activeConnections[sessionId];
      logger.info(`WebSocket disconnected for session: ${sessionId}`);
    }
  }

  async sendMessage(sessionId, message) {
    if (sessionId in this.activeConnections) {
      try {
        this.activeConnections[sessionId].send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Error sending message to ${sessionId}: ${error.message}`);
        this.disconnect(sessionId);
      }
    }
  }
}

function setupWebSocketServer(server) {
  const manager = new ConnectionManager();
  const chatSessions = {};
  
  // Initialize WebSocket server
  const wss = new WebSocketServer({ server });

  // WebSocket endpoint
  wss.on('connection', (ws, req) => {
    // Extract session ID from URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.pathname.split('/').pop();
    
    // Register connection
    manager.connect(ws, sessionId);
    
    // Set up a ping interval to keep the connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30000); // Send a ping every 30 seconds
    
    ws.on('message', async (data) => {
      try {
        const messageData = JSON.parse(data);
        logger.info(`Received message from client ${sessionId}: ${messageData.type}`);
        
        // Handle message based on type
        if (messageData.type === 'chat') {
          await handleChatMessage(sessionId, messageData.message, manager);
        } else if (messageData.type === 'task') {
          await handleTaskExecution(sessionId, messageData.task, manager);
        }
      } catch (error) {
        logger.error(`Error processing WebSocket message: ${error.message}`);
        await manager.sendMessage(sessionId, {
          type: 'error',
          message: `An error occurred: ${error.message}`
        });
      }
    });
    
    ws.on('close', () => {
      clearInterval(pingInterval); // Clear the ping interval
      manager.disconnect(sessionId);
    });
    
    ws.on('error', (error) => {
      clearInterval(pingInterval); // Clear the ping interval
      logger.error(`WebSocket error for session ${sessionId}: ${error.message}`);
      manager.disconnect(sessionId);
    });
  });

  return { manager, chatSessions };
}

async function handleChatMessage(sessionId, message, manager) {
  try {
    // Send typing indicator
    await manager.sendMessage(sessionId, {
      type: 'typing',
      message: 'Assistant is thinking...'
    });
    
    // Mock response for simplicity
    setTimeout(async () => {
      await manager.sendMessage(sessionId, {
        type: 'assistant_message',
        message: `I received your message: "${message}". This is a mock response as the actual processing would be handled by your existing client.js logic.`
      });
    }, 1000);
  } catch (error) {
    logger.error(`Error handling chat message: ${error.message}`);
    await manager.sendMessage(sessionId, {
      type: 'error',
      message: `Error processing message: ${error.message}`
    });
  }
}

async function handleTaskExecution(sessionId, taskDescription, manager) {
  try {
    await manager.sendMessage(sessionId, {
      type: 'task_started',
      message: `Starting task: ${taskDescription}`
    });
    
    // Mock task execution
    setTimeout(async () => {
      await manager.sendMessage(sessionId, {
        type: 'task_step',
        step: 1,
        message: 'Analyzing task...'
      });
      
      setTimeout(async () => {
        await manager.sendMessage(sessionId, {
          type: 'assistant_message',
          message: `I'll help you with: "${taskDescription}". This is a mock response as the actual task execution would be handled by your existing client.js logic.`
        });
        
        await manager.sendMessage(sessionId, {
          type: 'task_completed',
          message: 'Task completed successfully!',
          steps: 1
        });
      }, 2000);
    }, 1000);
  } catch (error) {
    logger.error(`Error handling task execution: ${error.message}`);
    await manager.sendMessage(sessionId, {
      type: 'error',
      message: `Error executing task: ${error.message}`
    });
  }
}

module.exports = { setupWebSocketServer };
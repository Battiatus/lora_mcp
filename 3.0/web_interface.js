const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const dotenv = require('dotenv');

// Import the MCP client components
const { Configuration, HTTPServer, LLMClient, ChatSession } = require('./client');

// Load environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} - ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'web-interface.log' })
  ]
});

// WebSocket connection manager
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

// Global instances
const manager = new ConnectionManager();
const chatSessions = {};

// Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Add middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'static')));

async function getOrCreateChatSession(sessionId) {
  if (!(sessionId in chatSessions)) {
    // Load configuration
    const env = Configuration.loadEnv();
    
    // Create HTTP server config
    const httpServerConfig = {
      name: 'gemini_http_server',
      config: {
        base_url: env.MCP_SERVER_URL || 'http://localhost:8080'
      }
    };
    
    // LLM configuration
    const llmProject = env.GOOGLE_CLOUD_PROJECT || '';
    const llmLocation = env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const llmModel = env.LLM_MODEL_NAME || 'gemini-1.5-pro';
    
    // Initialize components
    const geminiServer = new HTTPServer(
      httpServerConfig.name,
      httpServerConfig.config
    );
    
    const llmClient = new LLMClient(
      llmModel, llmProject, llmLocation
    );
    
    // Create chat session
    const chatSession = new ChatSession(geminiServer, llmClient);
    
    // Initialize the session
    await chatSession._prepareLLM();
    
    chatSessions[sessionId] = chatSession;
  }
  
  return chatSessions[sessionId];
}

// WebSocket endpoint
wss.on('connection', (ws, req) => {
  // Extract session ID from URL
  const sessionId = req.url.split('/').pop();
  
  // Register connection
  manager.connect(ws, sessionId);
  
  ws.on('message', async (data) => {
    try {
      const messageData = JSON.parse(data);
      
      // Get or create chat session
      const chatSession = await getOrCreateChatSession(sessionId);
      
      if (messageData.type === 'chat') {
        await handleChatMessage(sessionId, messageData.message, chatSession);
      } else if (messageData.type === 'task') {
        await handleTaskExecution(sessionId, messageData.task, chatSession);
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
    manager.disconnect(sessionId);
  });
  
  ws.on('error', (error) => {
    logger.error(`WebSocket error for session ${sessionId}: ${error.message}`);
    manager.disconnect(sessionId);
  });
});

async function handleChatMessage(sessionId, message, chatSession) {
  try {
    // Send typing indicator
    await manager.sendMessage(sessionId, {
      type: 'typing',
      message: 'Assistant is thinking...'
    });
    
    // Check if this looks like a task requiring tools
    if (['search', 'navigate', 'browse', 'screenshot', 'click', 'research', 'analyze', 'find', 'download']
        .some(keyword => message.toLowerCase().includes(keyword))) {
      // Use task execution mode for complex requests
      await handleTaskExecution(sessionId, message, chatSession);
    } else {
      // Regular chat mode
      // Add user message to conversation
      chatSession.conversation.addMessage('user', message);
      
      // Check if conversation needs summarization
      if (chatSession.conversation.shouldSummarize()) {
        await manager.sendMessage(sessionId, {
          type: 'system_message',
          message: 'Optimizing conversation memory...'
        });
        await chatSession.conversation.summarizeConversation();
      }
      
      // Get LLM response
      const llmResponse = await chatSession.llmClient.getResponse(message);
      const parsedToolCall = LLMClient.extractToolCallJson(llmResponse);
      
      if (parsedToolCall) {
        // Tool call detected - execute automatically
        chatSession.conversation.addMessage('assistant', llmResponse);
        
        await manager.sendMessage(sessionId, {
          type: 'assistant_tool_call',
          message: llmResponse,
          tool_name: parsedToolCall.tool,
          tool_args: parsedToolCall.arguments || {}
        });
        
        // Execute the tool
        await executeToolWithFeedback(sessionId, parsedToolCall, chatSession);
        
        // Get follow-up response
        const nextPrompt = 'Continue with the task. What\'s the next step?';
        const followUpResponse = await chatSession.llmClient.getResponse(nextPrompt);
        
        chatSession.conversation.addMessage('assistant', followUpResponse);
        await manager.sendMessage(sessionId, {
          type: 'assistant_message',
          message: followUpResponse
        });
      } else {
        // Regular response
        chatSession.conversation.addMessage('assistant', llmResponse);
        await manager.sendMessage(sessionId, {
          type: 'assistant_message',
          message: llmResponse
        });
      }
    }
  } catch (error) {
    logger.error(`Error handling chat message: ${error.message}`);
    console.error(error);
    await manager.sendMessage(sessionId, {
      type: 'error',
      message: `Error processing message: ${error.message}`
    });
  }
}

async function handleTaskExecution(sessionId, taskDescription, chatSession) {
  try {
    await manager.sendMessage(sessionId, {
      type: 'task_started',
      message: `Starting task: ${taskDescription}`
    });
    
    // Add task to conversation
    chatSession.conversation.addMessage('user', taskDescription);
    
    // Initial LLM response
    const llmResponse = await chatSession.llmClient.getResponse(taskDescription);
    let parsedToolCall = LLMClient.extractToolCallJson(llmResponse);
    
    if (!parsedToolCall) {
      // Not a tool call, just a regular response
      chatSession.conversation.addMessage('assistant', llmResponse);
      await manager.sendMessage(sessionId, {
        type: 'task_completed',
        message: llmResponse,
        steps: 0
      });
      return;
    }
    
    // It's a tool call - enter the tool execution loop
    chatSession.conversation.addMessage('assistant', llmResponse);
    
    await manager.sendMessage(sessionId, {
      type: 'assistant_message',
      message: llmResponse
    });
    
    // Task automation loop
    let stopReason = 'tool_use';
    let stepCount = 0;
    const maxSteps = 20;
    
    while (stopReason === 'tool_use' && stepCount < maxSteps) {
      stepCount++;
      
      await manager.sendMessage(sessionId, {
        type: 'task_step',
        step: stepCount,
        tool_name: parsedToolCall.tool,
        tool_args: parsedToolCall.arguments || {},
        message: `Step ${stepCount}: Executing ${parsedToolCall.tool}`
      });
      
      // Execute the tool
      const toolCalls = [{
        tool: parsedToolCall.tool,
        arguments: parsedToolCall.arguments || {},
        toolUseId: uuidv4()
      }];
      
      // Process tool requests
      const toolResults = await processToolRequests(toolCalls, chatSession);
      
      // Add tool results to conversation
      chatSession.conversation.addMessage('user', toolResults.content);
      
      // Check if conversation needs summarization
      if (chatSession.conversation.shouldSummarize()) {
        await manager.sendMessage(sessionId, {
          type: 'system_message',
          message: 'Optimizing conversation memory...'
        });
        await chatSession.conversation.summarizeConversation();
      }
      
      // Remove media from old messages to reduce token usage
      chatSession.conversation.removeMediaExceptLastTurn();
      
      // Get next response from model
      const nextPrompt = 'Continue with the task. What\'s the next step?';
      const nextLlmResponse = await chatSession.llmClient.getResponse(nextPrompt);
      
      // Parse next tool call
      parsedToolCall = LLMClient.extractToolCallJson(nextLlmResponse);
      
      // Add response to conversation
      chatSession.conversation.addMessage('assistant', nextLlmResponse);
      
      await manager.sendMessage(sessionId, {
        type: 'assistant_message',
        message: nextLlmResponse
      });
      
      // Check if we should continue with tool execution
      if (parsedToolCall) {
        stopReason = 'tool_use';
      } else {
        stopReason = 'content_stopped';
        await manager.sendMessage(sessionId, {
          type: 'task_completed',
          message: 'Task completed successfully!',
          steps: stepCount
        });
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      await manager.sendMessage(sessionId, {
        type: 'task_completed',
        message: 'Task execution reached maximum steps limit. Please review the results.',
        steps: stepCount
      });
    }
  } catch (error) {
    logger.error(`Error handling task execution: ${error.message}`);
    console.error(error);
    await manager.sendMessage(sessionId, {
      type: 'error',
      message: `Error executing task: ${error.message}`
    });
  }
}

async function processToolRequests(toolCalls, chatSession) {
  const consolidatedResult = {
    role: 'user',
    content: []
  };
  
  for (const toolCall of toolCalls) {
    const toolName = toolCall.tool;
    const toolId = toolCall.toolUseId || uuidv4();
    const toolArgs = toolCall.arguments || {};
    
    // Execute the tool
    const result = await chatSession.geminiServer.executeTool(toolName, toolArgs, toolId);
    
    // Add the result to the consolidated result
    if ('toolResult' in result && 'content' in result.toolResult) {
      consolidatedResult.content.push(...result.toolResult.content);
    }
  }
  
  return consolidatedResult;
}

async function executeToolWithFeedback(sessionId, toolCall, chatSession) {
  try {
    const toolName = toolCall.tool;
    const toolArgs = toolCall.arguments || {};
    const toolId = uuidv4();
    
    // Send tool execution start
    await manager.sendMessage(sessionId, {
      type: 'tool_executing',
      tool_name: toolName,
      message: `Executing ${toolName}...`
    });
    
    // Execute the tool
    const result = await chatSession.geminiServer.executeTool(toolName, toolArgs, toolId);
    
    // Process result
    if ('toolResult' in result && 'content' in result.toolResult) {
      const content = result.toolResult.content;
      
      // Check for different types of content
      const hasImage = content.some(item => 
        typeof item === 'object' && item !== null && 'image' in item);
      
      const hasError = content.some(item => 
        (typeof item === 'object' && item !== null && 
         'text' in item && item.text.toLowerCase().includes('error')) ||
        (typeof item === 'string' && item.toLowerCase().includes('error')));
      
      if (hasError) {
        await manager.sendMessage(sessionId, {
          type: 'tool_error',
          tool_name: toolName,
          message: `Tool execution failed: ${JSON.stringify(content)}`
        });
      } else if (hasImage) {
        await manager.sendMessage(sessionId, {
          type: 'tool_success_image',
          tool_name: toolName,
          message: `✅ ${toolName} completed successfully - Screenshot captured`,
          content: content
        });
      } else {
        // Extract meaningful text from content
        const textContent = [];
        
        for (const item of content) {
          if (typeof item === 'object' && item !== null) {
            if ('text' in item) {
              textContent.push(item.text);
            } else if ('json' in item && typeof item.json === 'object' && item.json !== null && 'text' in item.json) {
              textContent.push(item.json.text);
            }
          } else if (typeof item === 'string') {
            textContent.push(item);
          }
        }
        
        await manager.sendMessage(sessionId, {
          type: 'tool_success',
          tool_name: toolName,
          message: `✅ ${toolName} completed successfully`,
          result: textContent.length ? textContent.join(' | ') : 'Operation completed'
        });
      }
      
      // Add tool result to conversation
      chatSession.conversation.addMessage('user', content);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error executing tool ${toolName}: ${error.message}`);
    await manager.sendMessage(sessionId, {
      type: 'tool_error',
      tool_name: toolName,
      message: `Tool execution failed: ${error.message}`
    });
    return null;
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-web-interface' });
});

// Start server
const PORT = process.env.PORT || 8082;
server.listen(PORT, () => {
  logger.info(`MCP Web Interface running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down web interface...');
  
  // Clean up all chat sessions
  for (const sessionId in chatSessions) {
    try {
      await chatSessions[sessionId].cleanupServers();
    } catch (error) {
      logger.error(`Error cleaning up session ${sessionId}: ${error.message}`);
    }
  }
  
  process.exit(0);
});
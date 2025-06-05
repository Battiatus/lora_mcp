const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const dotenv = require('dotenv');
const cors = require('cors');

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

// Gestionnaire de messages en attente pour le polling
class PendingResponseManager {
  constructor() {
    this.pendingResponses = {};
  }

  addResponse(sessionId, response) {
    if (!this.pendingResponses[sessionId]) {
      this.pendingResponses[sessionId] = [];
    }
    this.pendingResponses[sessionId].push(response);
  }

  getResponses(sessionId) {
    if (!this.pendingResponses[sessionId]) {
      return [];
    }
    const responses = [...this.pendingResponses[sessionId]];
    this.pendingResponses[sessionId] = [];
    return responses;
  }

  clearResponses(sessionId) {
    if (this.pendingResponses[sessionId]) {
      this.pendingResponses[sessionId] = [];
    }
  }
}

// Global instances
const manager = new ConnectionManager();
const pendingResponses = new PendingResponseManager();
const chatSessions = {};
const sessionInfo = {};

// Express app
const app = express();
const server = http.createServer(app);

// Add middleware
app.use(express.json());
app.use(cors());
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

    // Stocker les informations de session
    sessionInfo[sessionId] = {
      id: sessionId,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString()
    };
  }
  
  return chatSessions[sessionId];
}

// Nouvelles routes API pour la communication avec le frontend React
// Session management
app.post('/api/sessions', async (req, res) => {
  try {
    const sessionId = uuidv4();
    
    // Créer la session MCP
    await getOrCreateChatSession(sessionId);
    
    // Envoyer une notification de bienvenue
    pendingResponses.addResponse(sessionId, {
      type: 'system_message',
      message: 'Welcome to MCP Advanced Assistant! Session initialized.'
    });
    
    res.json({ 
      session_id: sessionId,
      created_at: sessionInfo[sessionId].created_at
    });
  } catch (error) {
    logger.error(`Error creating session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionInfo[sessionId]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Mettre à jour l'heure de dernière activité
  sessionInfo[sessionId].last_activity = new Date().toISOString();
  
  res.json(sessionInfo[sessionId]);
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!chatSessions[sessionId]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Nettoyer la session
    await chatSessions[sessionId].cleanupServers();
    delete chatSessions[sessionId];
    delete sessionInfo[sessionId];
    pendingResponses.clearResponses(sessionId);
    
    res.json({ message: `Session ${sessionId} cleaned up successfully` });
  } catch (error) {
    logger.error(`Error cleaning up session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Route de polling pour obtenir les réponses en attente
app.get('/api/sessions/:sessionId/responses', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessionInfo[sessionId]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Mettre à jour l'heure de dernière activité
  sessionInfo[sessionId].last_activity = new Date().toISOString();
  
  // Récupérer les réponses en attente
  const responses = pendingResponses.getResponses(sessionId);
  
  res.json({ responses });
});

// Chat endpoint
app.post('/api/sessions/:sessionId/chat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    if (!chatSessions[sessionId]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Mettre à jour l'heure de dernière activité
    sessionInfo[sessionId].last_activity = new Date().toISOString();
    
    // Renvoyer une réponse immédiate pour éviter le timeout
    res.json({ success: true, message: 'Message received, processing started' });
    
    // Traiter le message en arrière-plan
    handleChatMessage(sessionId, message, chatSessions[sessionId]).catch(error => {
      logger.error(`Error processing chat message: ${error.message}`);
      pendingResponses.addResponse(sessionId, {
        type: 'error',
        message: `Error processing message: ${error.message}`
      });
    });
  } catch (error) {
    logger.error(`Error in chat endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Task execution endpoint
app.post('/api/sessions/:sessionId/task', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { task } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }
    
    if (!chatSessions[sessionId]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Mettre à jour l'heure de dernière activité
    sessionInfo[sessionId].last_activity = new Date().toISOString();
    
    // Renvoyer une réponse immédiate pour éviter le timeout
    res.json({ success: true, message: 'Task received, execution started' });
    
    // Exécuter la tâche en arrière-plan
    handleTaskExecution(sessionId, task, chatSessions[sessionId]).catch(error => {
      logger.error(`Error executing task: ${error.message}`);
      pendingResponses.addResponse(sessionId, {
        type: 'error',
        message: `Error executing task: ${error.message}`
      });
    });
  } catch (error) {
    logger.error(`Error in task endpoint: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-web-interface' });
});

// Function to handle chat messages
async function handleChatMessage(sessionId, message, chatSession) {
  try {
    // Notify client that processing started
    pendingResponses.addResponse(sessionId, {
      type: 'typing',
      message: 'Assistant is thinking...'
    });
    
    // Check if this looks like a task requiring tools
    if (['search', 'navigate', 'browse', 'screenshot', 'click', 'research', 'analyze', 'find', 'download']
        .some(keyword => message.toLowerCase().includes(keyword))) {
      // Use task execution mode for complex requests
      await handleTaskExecution(sessionId, message, chatSession);
      return;
    }
    
    // Regular chat mode
    // Add user message to conversation
    chatSession.conversation.addMessage('user', message);
    
    // Check if conversation needs summarization
    if (chatSession.conversation.shouldSummarize()) {
      pendingResponses.addResponse(sessionId, {
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
      
      pendingResponses.addResponse(sessionId, {
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
      pendingResponses.addResponse(sessionId, {
        type: 'assistant_message',
        message: followUpResponse
      });
    } else {
      // Regular response
      chatSession.conversation.addMessage('assistant', llmResponse);
      pendingResponses.addResponse(sessionId, {
        type: 'assistant_message',
        message: llmResponse
      });
    }
  } catch (error) {
    logger.error(`Error handling chat message: ${error.message}`);
    console.error(error);
    pendingResponses.addResponse(sessionId, {
      type: 'error',
      message: `Error processing message: ${error.message}`
    });
  }
}

async function handleTaskExecution(sessionId, taskDescription, chatSession) {
  try {
    pendingResponses.addResponse(sessionId, {
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
      pendingResponses.addResponse(sessionId, {
        type: 'task_completed',
        message: llmResponse,
        steps: 0
      });
      return;
    }
    
    // It's a tool call - enter the tool execution loop
    chatSession.conversation.addMessage('assistant', llmResponse);
    
    pendingResponses.addResponse(sessionId, {
      type: 'assistant_message',
      message: llmResponse
    });
    
    // Task automation loop
    let stopReason = 'tool_use';
    let stepCount = 0;
    const maxSteps = 40; // Increased from 20 to 40
    
    while (stopReason === 'tool_use' && stepCount < maxSteps) {
      stepCount++;
      
      pendingResponses.addResponse(sessionId, {
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
      
      logger.info(`Executing tool: ${parsedToolCall.tool} with args: ${JSON.stringify(parsedToolCall.arguments || {})}`);
      
      // Process tool requests
      const toolResults = await chatSession.processToolRequests(toolCalls);
      
      // Add tool results to conversation
      chatSession.conversation.addMessage('user', toolResults.content);
      
      // Check if conversation needs summarization
      if (chatSession.conversation.shouldSummarize()) {
        pendingResponses.addResponse(sessionId, {
          type: 'system_message',
          message: 'Optimizing conversation memory...'
        });
        await chatSession.conversation.summarizeConversation();
      }
      
      // Remove media from old messages to reduce token usage
      chatSession.conversation.removeMediaExceptLastTurn();
      
      // Get next response from model
      const nextPrompt = 'Continue with the task. What\'s the next step?';
      logger.info(`Sending next prompt to model: ${nextPrompt}`);
      const nextLlmResponse = await chatSession.llmClient.getResponse(nextPrompt);
      logger.info(`Received model response: ${nextLlmResponse.substring(0, 100)}...`);
      
      // Parse next tool call
      parsedToolCall = LLMClient.extractToolCallJson(nextLlmResponse);
      
      // Add response to conversation
      chatSession.conversation.addMessage('assistant', nextLlmResponse);
      
      pendingResponses.addResponse(sessionId, {
        type: 'assistant_message',
        message: nextLlmResponse
      });
      
      // Check if we should continue with tool execution
      if (parsedToolCall) {
        logger.info(`Found tool call in response: ${parsedToolCall.tool}`);
        stopReason = 'tool_use';
      } else {
        logger.info('No tool call found in response, stopping execution');
        stopReason = 'content_stopped';
        pendingResponses.addResponse(sessionId, {
          type: 'task_completed',
          message: 'Task completed successfully!',
          steps: stepCount
        });
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      pendingResponses.addResponse(sessionId, {
        type: 'task_completed',
        message: 'Task execution reached maximum steps limit. Please review the results.',
        steps: stepCount
      });
    }
  } catch (error) {
    logger.error(`Error handling task execution: ${error.message}`);
    console.error(error);
    pendingResponses.addResponse(sessionId, {
      type: 'error',
      message: `Error executing task: ${error.message}`
    });
  }
}

async function executeToolWithFeedback(sessionId, toolCall, chatSession) {
  try {
    const toolName = toolCall.tool;
    const toolArgs = toolCall.arguments || {};
    const toolId = uuidv4();
    
    // Send tool execution start
    pendingResponses.addResponse(sessionId, {
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
        pendingResponses.addResponse(sessionId, {
          type: 'tool_error',
          tool_name: toolName,
          message: `Tool execution failed: ${JSON.stringify(content)}`
        });
      } else if (hasImage) {
        pendingResponses.addResponse(sessionId, {
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
        
        pendingResponses.addResponse(sessionId, {
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
    pendingResponses.addResponse(sessionId, {
      type: 'tool_error',
      tool_name: toolName,
      message: `Tool execution failed: ${error.message}`
    });
    return null;
  }
}

// Nettoyage périodique des sessions inactives
setInterval(async () => {
  const now = Date.now();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  
  for (const sessionId in sessionInfo) {
    const lastActivity = new Date(sessionInfo[sessionId].last_activity).getTime();
    
    if (now - lastActivity > inactiveThreshold) {
      logger.info(`Cleaning up inactive session: ${sessionId}`);
      
      try {
        if (chatSessions[sessionId]) {
          await chatSessions[sessionId].cleanupServers();
          delete chatSessions[sessionId];
        }
        
        delete sessionInfo[sessionId];
        pendingResponses.clearResponses(sessionId);
      } catch (error) {
        logger.error(`Error cleaning up inactive session ${sessionId}: ${error.message}`);
      }
    }
  }
}, 15 * 60 * 1000); // Vérifier toutes les 15 minutes

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Start server
const PORT = process.env.WEB_INTERFACE_PORT || 8082;
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
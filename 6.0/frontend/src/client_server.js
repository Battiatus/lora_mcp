const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const http = require('http');

// Importer les classes du client MCP
const { 
  Configuration, 
  HTTPServer, 
  LLMClient, 
  ConversationManager, 
  ChatSession 
} = require('./client');

// Charger les variables d'environnement
dotenv.config();

// Configurer le logger
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
    new winston.transports.File({ filename: 'client-server.log' })
  ]
});

// Gestionnaire des sessions actives
class SessionManager {
  constructor() {
    this.activeSessions = {};
    this.pendingResponses = {};
  }

  async createSession() {
    try {
      // Générer un ID de session
      const sessionId = uuidv4();
      logger.info(`Creating new session: ${sessionId}`);

      // Charger la configuration
      const env = Configuration.loadEnv();
      
      // Configurer le serveur HTTP
      const httpServerConfig = {
        name: 'gemini_http_server',
        config: {
          base_url: env.MCP_SERVER_URL || 'http://localhost:8080'
        }
      };
      
      // Configurer le client LLM
      const llmProject = env.GOOGLE_CLOUD_PROJECT || '';
      const llmLocation = env.GOOGLE_CLOUD_LOCATION || 'us-central1';
      const llmModel = env.LLM_MODEL_NAME || 'gemini-1.5-pro';

      // Initialiser les composants
      const geminiServer = new HTTPServer(
        httpServerConfig.name,
        httpServerConfig.config
      );
      
      const llmClient = new LLMClient(
        llmModel, llmProject, llmLocation
      );
      
      // Créer la session de chat
      const chatSession = new ChatSession(geminiServer, llmClient);
      
      // Initialiser la session (préparation du LLM et des outils)
      await chatSession._prepareLLM();
      
      // Stocker la session
      this.activeSessions[sessionId] = {
        id: sessionId,
        chatSession,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };

      // Initialiser la file des réponses en attente
      this.pendingResponses[sessionId] = [];

      return {
        session_id: sessionId,
        created_at: this.activeSessions[sessionId].created_at
      };
    } catch (error) {
      logger.error(`Error creating session: ${error.message}`);
      throw error;
    }
  }

  getSession(sessionId) {
    const session = this.activeSessions[sessionId];
    if (!session) {
      return null;
    }

    // Mettre à jour l'horodatage de dernière activité
    session.last_activity = new Date().toISOString();
    return session;
  }

  async deleteSession(sessionId) {
    const session = this.activeSessions[sessionId];
    if (!session) {
      return false;
    }

    try {
      // Nettoyer la session
      await session.chatSession.cleanupServers();
      
      // Supprimer la session
      delete this.activeSessions[sessionId];
      
      // Supprimer les réponses en attente
      if (this.pendingResponses[sessionId]) {
        delete this.pendingResponses[sessionId];
      }
      
      return true;
    } catch (error) {
      logger.error(`Error deleting session ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  addPendingResponse(sessionId, response) {
    if (!this.pendingResponses[sessionId]) {
      this.pendingResponses[sessionId] = [];
    }
    this.pendingResponses[sessionId].push(response);
  }

  getPendingResponses(sessionId) {
    if (!this.pendingResponses[sessionId]) {
      return [];
    }
    const responses = [...this.pendingResponses[sessionId]];
    this.pendingResponses[sessionId] = [];
    return responses;
  }

  // Nettoyage périodique des sessions inactives
  startCleanupTask() {
    setInterval(() => {
      this.cleanupInactiveSessions();
    }, 15 * 60 * 1000); // Vérifier toutes les 15 minutes
  }

  cleanupInactiveSessions() {
    const now = Date.now();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const sessionId in this.activeSessions) {
      const session = this.activeSessions[sessionId];
      const lastActivity = new Date(session.last_activity).getTime();
      
      if (now - lastActivity > inactiveThreshold) {
        logger.info(`Cleaning up inactive session: ${sessionId}`);
        
        try {
          this.deleteSession(sessionId).catch(err => {
            logger.error(`Error during cleanup of session ${sessionId}: ${err.message}`);
          });
        } catch (error) {
          logger.error(`Error cleaning up inactive session ${sessionId}: ${error.message}`);
        }
      }
    }
  }
}

// Créer le gestionnaire de sessions
const sessionManager = new SessionManager();

// Créer l'application Express
const app = express();
const server = http.createServer(app);

// Configurer les middlewares
app.use(express.json());
app.use(cors());

// Routes API

// Vérification de santé
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-client-server' });
});

// Création d'une session
app.post('/api/sessions', async (req, res) => {
  try {
    const sessionData = await sessionManager.createSession();
    res.json(sessionData);
  } catch (error) {
    logger.error(`Error creating session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Obtention des informations d'une session
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    id: session.id,
    created_at: session.created_at,
    last_activity: session.last_activity
  });
});

// Suppression d'une session
app.delete('/api/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const success = await sessionManager.deleteSession(sessionId);
    
    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ message: `Session ${sessionId} cleaned up successfully` });
  } catch (error) {
    logger.error(`Error deleting session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Obtention des réponses en attente
app.get('/api/sessions/:sessionId/responses', (req, res) => {
  const { sessionId } = req.params;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const responses = sessionManager.getPendingResponses(sessionId);
  res.json({ responses });
});

// Envoi d'un message de chat
app.post('/api/sessions/:sessionId/chat', async (req, res) => {
  const { sessionId } = req.params;
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Envoyer une réponse immédiate pour éviter le timeout
  res.json({ success: true, message: 'Message received, processing started' });
  
  // Traiter le message en arrière-plan
  processChat(sessionId, message, session.chatSession).catch(error => {
    logger.error(`Error processing chat message: ${error.message}`);
    sessionManager.addPendingResponse(sessionId, {
      type: 'error',
      message: `Error processing message: ${error.message}`
    });
  });
});

// Exécution d'une tâche
app.post('/api/sessions/:sessionId/task', async (req, res) => {
  const { sessionId } = req.params;
  const { task } = req.body;
  
  if (!task) {
    return res.status(400).json({ error: 'Task is required' });
  }
  
  const session = sessionManager.getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Envoyer une réponse immédiate pour éviter le timeout
  res.json({ success: true, message: 'Task received, execution started' });
  
  // Exécuter la tâche en arrière-plan
  processTask(sessionId, task, session.chatSession).catch(error => {
    logger.error(`Error executing task: ${error.message}`);
    sessionManager.addPendingResponse(sessionId, {
      type: 'error',
      message: `Error executing task: ${error.message}`
    });
  });
});

// Fonction pour traiter les messages de chat
async function processChat(sessionId, message, chatSession) {
  try {
    // Notifier le client que le traitement a commencé
    sessionManager.addPendingResponse(sessionId, {
      type: 'typing',
      message: 'Assistant is thinking...'
    });
    
    // Vérifier si cela ressemble à une tâche nécessitant des outils
    if (['search', 'navigate', 'browse', 'screenshot', 'click', 'research', 'analyze', 'find', 'download']
        .some(keyword => message.toLowerCase().includes(keyword))) {
      // Utiliser le mode d'exécution de tâche pour les requêtes complexes
      await processTask(sessionId, message, chatSession);
      return;
    }
    
    // Mode chat normal
    // Ajouter le message utilisateur à la conversation
    chatSession.conversation.addMessage('user', message);
    
    // Vérifier si la conversation doit être résumée
    if (chatSession.conversation.shouldSummarize()) {
      sessionManager.addPendingResponse(sessionId, {
        type: 'system_message',
        message: 'Optimizing conversation memory...'
      });
      await chatSession.conversation.summarizeConversation();
    }
    
    // Obtenir la réponse du LLM
    const llmResponse = await chatSession.llmClient.getResponse(message);
    const parsedToolCall = LLMClient.extractToolCallJson(llmResponse);
    
    if (parsedToolCall) {
      // Appel d'outil détecté - exécuter automatiquement
      chatSession.conversation.addMessage('assistant', llmResponse);
      
      sessionManager.addPendingResponse(sessionId, {
        type: 'assistant_tool_call',
        message: llmResponse,
        tool_name: parsedToolCall.tool,
        tool_args: parsedToolCall.arguments || {}
      });
      
      // Exécuter l'outil
      await executeToolWithFeedback(sessionId, parsedToolCall, chatSession);
      
      // Obtenir une réponse de suivi
      const nextPrompt = 'Continue with the task. What\'s the next step?';
      const followUpResponse = await chatSession.llmClient.getResponse(nextPrompt);
      
      chatSession.conversation.addMessage('assistant', followUpResponse);
      sessionManager.addPendingResponse(sessionId, {
        type: 'assistant_message',
        message: followUpResponse
      });
    } else {
      // Réponse normale
      chatSession.conversation.addMessage('assistant', llmResponse);
      sessionManager.addPendingResponse(sessionId, {
        type: 'assistant_message',
        message: llmResponse
      });
    }
  } catch (error) {
    logger.error(`Error handling chat message: ${error.message}`);
    console.error(error);
    sessionManager.addPendingResponse(sessionId, {
      type: 'error',
      message: `Error processing message: ${error.message}`
    });
  }
}

// Fonction pour traiter les tâches
async function processTask(sessionId, taskDescription, chatSession) {
  try {
    sessionManager.addPendingResponse(sessionId, {
      type: 'task_started',
      message: `Starting task: ${taskDescription}`
    });
    
    // Ajouter la tâche à la conversation
    chatSession.conversation.addMessage('user', taskDescription);
    
    // Réponse initiale du LLM
    const llmResponse = await chatSession.llmClient.getResponse(taskDescription);
    let parsedToolCall = LLMClient.extractToolCallJson(llmResponse);
    
    if (!parsedToolCall) {
      // Pas d'appel d'outil, juste une réponse normale
      chatSession.conversation.addMessage('assistant', llmResponse);
      sessionManager.addPendingResponse(sessionId, {
        type: 'task_completed',
        message: llmResponse,
        steps: 0
      });
      return;
    }
    
    // C'est un appel d'outil - entrer dans la boucle d'exécution d'outil
    chatSession.conversation.addMessage('assistant', llmResponse);
    
    sessionManager.addPendingResponse(sessionId, {
      type: 'assistant_message',
      message: llmResponse
    });
    
    // Boucle d'automatisation de tâche
    let stopReason = 'tool_use';
    let stepCount = 0;
    const maxSteps = 40;
    
    while (stopReason === 'tool_use' && stepCount < maxSteps) {
      stepCount++;
      
      sessionManager.addPendingResponse(sessionId, {
        type: 'task_step',
        step: stepCount,
        tool_name: parsedToolCall.tool,
        tool_args: parsedToolCall.arguments || {},
        message: `Step ${stepCount}: Executing ${parsedToolCall.tool}`
      });
      
      // Exécuter l'outil
      const toolCalls = [{
        tool: parsedToolCall.tool,
        arguments: parsedToolCall.arguments || {},
        toolUseId: uuidv4()
      }];
      
      logger.info(`Executing tool: ${parsedToolCall.tool} with args: ${JSON.stringify(parsedToolCall.arguments || {})}`);
      
      // Traiter les demandes d'outils
      const toolResults = await chatSession.processToolRequests(toolCalls);
      
      // Ajouter les résultats des outils à la conversation
      chatSession.conversation.addMessage('user', toolResults.content);
      
      // Vérifier si la conversation doit être résumée
      if (chatSession.conversation.shouldSummarize()) {
        sessionManager.addPendingResponse(sessionId, {
          type: 'system_message',
          message: 'Optimizing conversation memory...'
        });
        await chatSession.conversation.summarizeConversation();
      }
      
      // Supprimer les médias des anciens messages pour réduire l'utilisation des tokens
      chatSession.conversation.removeMediaExceptLastTurn();
      
      // Obtenir la réponse suivante du modèle
      const nextPrompt = 'Continue with the task. What\'s the next step?';
      logger.info(`Sending next prompt to model: ${nextPrompt}`);
      const nextLlmResponse = await chatSession.llmClient.getResponse(nextPrompt);
      logger.info(`Received model response: ${nextLlmResponse.substring(0, 100)}...`);
      
      // Analyser l'appel d'outil suivant
      parsedToolCall = LLMClient.extractToolCallJson(nextLlmResponse);
      
      // Ajouter la réponse à la conversation
      chatSession.conversation.addMessage('assistant', nextLlmResponse);
      
      sessionManager.addPendingResponse(sessionId, {
        type: 'assistant_message',
        message: nextLlmResponse
      });
      
      // Vérifier si nous devons continuer avec l'exécution de l'outil
      if (parsedToolCall) {
        logger.info(`Found tool call in response: ${parsedToolCall.tool}`);
        stopReason = 'tool_use';
      } else {
        logger.info('No tool call found in response, stopping execution');
        stopReason = 'content_stopped';
        sessionManager.addPendingResponse(sessionId, {
          type: 'task_completed',
          message: 'Task completed successfully!',
          steps: stepCount
        });
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      sessionManager.addPendingResponse(sessionId, {
        type: 'task_completed',
        message: 'Task execution reached maximum steps limit. Please review the results.',
        steps: stepCount
      });
    }
  } catch (error) {
    logger.error(`Error handling task execution: ${error.message}`);
    console.error(error);
    sessionManager.addPendingResponse(sessionId, {
      type: 'error',
      message: `Error executing task: ${error.message}`
    });
  }
}

// Fonction pour exécuter un outil avec retour d'information
async function executeToolWithFeedback(sessionId, toolCall, chatSession) {
  try {
    const toolName = toolCall.tool;
    const toolArgs = toolCall.arguments || {};
    const toolId = uuidv4();
    
    // Envoyer le début de l'exécution de l'outil
    sessionManager.addPendingResponse(sessionId, {
      type: 'tool_executing',
      tool_name: toolName,
      message: `Executing ${toolName}...`
    });
    
    // Exécuter l'outil
    const result = await chatSession.geminiServer.executeTool(toolName, toolArgs, toolId);
    
    // Traiter le résultat
    if ('toolResult' in result && 'content' in result.toolResult) {
      const content = result.toolResult.content;
      
      // Vérifier les différents types de contenu
      const hasImage = content.some(item => 
        typeof item === 'object' && item !== null && 'image' in item);
      
      const hasError = content.some(item => 
        (typeof item === 'object' && item !== null && 
         'text' in item && item.text.toLowerCase().includes('error')) ||
        (typeof item === 'string' && item.toLowerCase().includes('error')));
      
      if (hasError) {
        sessionManager.addPendingResponse(sessionId, {
          type: 'tool_error',
          tool_name: toolName,
          message: `Tool execution failed: ${JSON.stringify(content)}`
        });
      } else if (hasImage) {
        sessionManager.addPendingResponse(sessionId, {
          type: 'tool_success_image',
          tool_name: toolName,
          message: `✅ ${toolName} completed successfully - Screenshot captured`,
          content: content
        });
      } else {
        // Extraire le texte significatif du contenu
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
        
        sessionManager.addPendingResponse(sessionId, {
          type: 'tool_success',
          tool_name: toolName,
          message: `✅ ${toolName} completed successfully`,
          result: textContent.length ? textContent.join(' | ') : 'Operation completed'
        });
      }
      
      // Ajouter le résultat de l'outil à la conversation
      chatSession.conversation.addMessage('user', content);
    }
    
    return result;
  } catch (error) {
    logger.error(`Error executing tool ${toolName}: ${error.message}`);
    sessionManager.addPendingResponse(sessionId, {
      type: 'tool_error',
      tool_name: toolName,
      message: `Tool execution failed: ${error.message}`
    });
    return null;
  }
}

// Démarrer le nettoyage périodique des sessions inactives
sessionManager.startCleanupTask();

// Démarrer le serveur
const PORT = process.env.CLIENT_SERVER_PORT || 8081;
server.listen(PORT, () => {
  logger.info(`MCP Client Server running on port ${PORT}`);
});

// Gérer l'arrêt gracieux
process.on('SIGINT', async () => {
  logger.info('Shutting down client server...');
  
  // Nettoyer toutes les sessions actives
  for (const sessionId in sessionManager.activeSessions) {
    try {
      await sessionManager.deleteSession(sessionId);
    } catch (error) {
      logger.error(`Error cleaning up session ${sessionId}: ${error.message}`);
    }
  }
  
  process.exit(0);
});
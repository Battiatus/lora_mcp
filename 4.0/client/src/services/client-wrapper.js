import client from './client';

/**
 * Classe d'adaptateur pour le client MCP
 * Facilite l'utilisation du client.js dans l'application React
 */
class MCPClientWrapper {
  constructor() {
    this.client = client;
    this.chatSession = null;
    this.isInitialized = false;
    this.sessionId = null;
    this.callbacks = {
      onMessage: [],
      onError: [],
      onTaskProgress: [],
      onToolExecution: [],
      onStatusChange: []
    };
  }

  /**
   * Initialise le client MCP
   * @param {string} sessionId - ID de session (optionnel)
   * @returns {Promise<boolean>} - Résultat de l'initialisation
   */
  async initialize(sessionId = null) {
    try {
      if (this.isInitialized) {
        console.warn('MCPClient is already initialized');
        return true;
      }

      this.sessionId = sessionId;

      // Charger la configuration depuis les variables d'environnement
      const env = this.client.Configuration.loadEnv();
      
      // Créer la configuration du serveur HTTP
      const httpServerConfig = {
        name: 'mcp_http_server',
        config: {
          base_url: env.MCP_SERVER_URL || process.env.REACT_APP_MCP_SERVER_URL || 'http://localhost:8080'
        }
      };
      
      // Configuration du modèle LLM
      const llmProject = env.GOOGLE_CLOUD_PROJECT || process.env.REACT_APP_GOOGLE_CLOUD_PROJECT || '';
      const llmLocation = env.GOOGLE_CLOUD_LOCATION || process.env.REACT_APP_GOOGLE_CLOUD_LOCATION || 'us-central1';
      const llmModel = env.LLM_MODEL_NAME || process.env.REACT_APP_LLM_MODEL_NAME || 'gemini-1.5-pro';
      
      // Initialiser les composants
      this.mcpServer = new this.client.HTTPServer(
        httpServerConfig.name,
        httpServerConfig.config
      );
      
      this.llmClient = new this.client.LLMClient(
        llmModel, llmProject, llmLocation
      );
      
      // Créer la session de chat
      this.chatSession = new this.client.ChatSession(this.mcpServer, this.llmClient);
      
      // Initialiser la session
      await this.chatSession._prepareLLM();
      
      this.isInitialized = true;
      this._triggerStatusChange('initialized');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize MCPClient:', error);
      this._triggerError('initialization_failed', error.message);
      return false;
    }
  }

  /**
   * Envoie un message à l'assistant
   * @param {string} message - Message à envoyer
   * @param {string} mode - Mode d'interaction ('chat' ou 'task')
   * @returns {Promise<Object>} - Réponse de l'assistant
   */
  async sendMessage(message, mode = 'chat') {
    if (!this.isInitialized || !this.chatSession) {
      throw new Error('MCPClient not initialized');
    }

    try {
      this._triggerStatusChange('processing');
      
      // Notifier que l'assistant est en train de réfléchir
      this._triggerMessage({
        type: 'typing',
        message: 'Assistant is thinking...'
      });

      // Vérifier si cela ressemble à une tâche nécessitant des outils
      const isTaskMode = mode === 'task' || ['search', 'navigate', 'browse', 'screenshot', 'click', 'research', 'analyze', 'find', 'download']
        .some(keyword => message.toLowerCase().includes(keyword));

      if (isTaskMode) {
        // Mode d'exécution de tâche pour les requêtes complexes
        await this._handleTaskExecution(message);
      } else {
        // Mode chat normal
        await this._handleChatMessage(message);
      }

      this._triggerStatusChange('ready');
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      this._triggerError('message_failed', error.message);
      this._triggerStatusChange('error');
      throw error;
    }
  }

  /**
   * Gère l'envoi d'un message en mode chat
   * @param {string} message - Message de l'utilisateur
   */
  async _handleChatMessage(message) {
    try {
      // Ajouter le message utilisateur à la conversation
      this.chatSession.conversation.addMessage('user', message);
      
      // Vérifier si la conversation doit être résumée
      if (this.chatSession.conversation.shouldSummarize()) {
        this._triggerMessage({
          type: 'system_message',
          message: 'Optimisation de la mémoire de conversation...'
        });
        await this.chatSession.conversation.summarizeConversation();
      }
      
      // Obtenir la réponse du LLM
      const llmResponse = await this.chatSession.llmClient.getResponse(message);
      const parsedToolCall = this.client.LLMClient.extractToolCallJson(llmResponse);
      
      if (parsedToolCall) {
        // Appel d'outil détecté - exécuter automatiquement
        this.chatSession.conversation.addMessage('assistant', llmResponse);
        
        this._triggerMessage({
          type: 'assistant_tool_call',
          message: llmResponse,
          tool_name: parsedToolCall.tool,
          tool_args: parsedToolCall.arguments || {}
        });
        
        // Exécuter l'outil
        await this._executeToolWithFeedback(parsedToolCall);
        
        // Obtenir une réponse de suivi
        const nextPrompt = 'Continue with the task. What\'s the next step?';
        const followUpResponse = await this.chatSession.llmClient.getResponse(nextPrompt);
        
        this.chatSession.conversation.addMessage('assistant', followUpResponse);
        this._triggerMessage({
          type: 'assistant_message',
          message: followUpResponse
        });
      } else {
        // Réponse régulière
        this.chatSession.conversation.addMessage('assistant', llmResponse);
        this._triggerMessage({
          type: 'assistant_message',
          message: llmResponse
        });
      }
    } catch (error) {
      console.error('Error in chat message handling:', error);
      this._triggerMessage({
        type: 'error',
        message: `Error processing message: ${error.message}`
      });
      throw error;
    }
  }

  /**
   * Gère l'exécution d'une tâche complexe
   * @param {string} taskDescription - Description de la tâche
   */
  async _handleTaskExecution(taskDescription) {
    try {
      this._triggerMessage({
        type: 'task_started',
        message: `Starting task: ${taskDescription}`
      });
      
      // Ajouter la tâche à la conversation
      this.chatSession.conversation.addMessage('user', taskDescription);
      
      // Réponse initiale du LLM
      const llmResponse = await this.chatSession.llmClient.getResponse(taskDescription);
      let parsedToolCall = this.client.LLMClient.extractToolCallJson(llmResponse);
      
      if (!parsedToolCall) {
        // Pas un appel d'outil, juste une réponse régulière
        this.chatSession.conversation.addMessage('assistant', llmResponse);
        this._triggerMessage({
          type: 'task_completed',
          message: llmResponse,
          steps: 0
        });
        return;
      }
      
      // C'est un appel d'outil - entrer dans la boucle d'exécution d'outil
      this.chatSession.conversation.addMessage('assistant', llmResponse);
      
      this._triggerMessage({
        type: 'assistant_message',
        message: llmResponse
      });
      
      // Boucle d'automatisation des tâches
      let stopReason = 'tool_use';
      let stepCount = 0;
      const maxSteps = 40;
      
      while (stopReason === 'tool_use' && stepCount < maxSteps) {
        stepCount++;
        
        this._triggerMessage({
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
          toolUseId: this.client.v4()
        }];
        
        // Traiter les demandes d'outils
        const toolResults = await this.chatSession.processToolRequests(toolCalls);
        
        // Ajouter les résultats d'outil à la conversation
        this.chatSession.conversation.addMessage('user', toolResults.content);
        
        // Vérifier si la conversation doit être résumée
        if (this.chatSession.conversation.shouldSummarize()) {
          this._triggerMessage({
            type: 'system_message',
            message: 'Optimizing conversation memory...'
          });
          await this.chatSession.conversation.summarizeConversation();
        }
        
        // Supprimer les médias des anciens messages pour réduire l'utilisation de jetons
        this.chatSession.conversation.removeMediaExceptLastTurn();
        
        // Obtenir la prochaine réponse du modèle
        const nextPrompt = 'Continue with the task. What\'s the next step?';
        const nextLlmResponse = await this.chatSession.llmClient.getResponse(nextPrompt);
        
        // Analyser le prochain appel d'outil
        parsedToolCall = this.client.LLMClient.extractToolCallJson(nextLlmResponse);
        
        // Ajouter la réponse à la conversation
        this.chatSession.conversation.addMessage('assistant', nextLlmResponse);
        
        this._triggerMessage({
          type: 'assistant_message',
          message: nextLlmResponse
        });
        
        // Vérifier si nous devons continuer avec l'exécution de l'outil
        if (parsedToolCall) {
          stopReason = 'tool_use';
        } else {
          stopReason = 'content_stopped';
          this._triggerMessage({
            type: 'task_completed',
            message: 'Task completed successfully!',
            steps: stepCount
          });
          break;
        }
      }
      
      if (stepCount >= maxSteps) {
        this._triggerMessage({
          type: 'task_completed',
          message: 'Task execution reached maximum steps limit. Please review the results.',
          steps: stepCount
        });
      }
    } catch (error) {
      console.error('Error in task execution:', error);
      this._triggerMessage({
        type: 'error',
        message: `Error executing task: ${error.message}`
      });
      throw error;
    }
  }

  /**
   * Exécute un outil avec feedback à l'utilisateur
   * @param {Object} toolCall - Appel d'outil à exécuter
   */
  async _executeToolWithFeedback(toolCall) {
    // Déclarer les variables avant le bloc try pour qu'elles soient accessibles dans catch
    const toolName = toolCall.tool;
    const toolArgs = toolCall.arguments || {};
    const toolId = this.client.v4();
    
    try {
      // Envoyer le début de l'exécution de l'outil
      this._triggerMessage({
        type: 'tool_executing',
        tool_name: toolName,
        message: `Executing ${toolName}...`
      });
      
      // Exécuter l'outil
      const result = await this.chatSession.mcpServer.executeTool(toolName, toolArgs, toolId);
      
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
          this._triggerMessage({
            type: 'tool_error',
            tool_name: toolName,
            message: `Tool execution failed: ${JSON.stringify(content)}`
          });
        } else if (hasImage) {
          this._triggerMessage({
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
          
          this._triggerMessage({
            type: 'tool_success',
            tool_name: toolName,
            message: `✅ ${toolName} completed successfully`,
            result: textContent.length ? textContent.join(' | ') : 'Operation completed'
          });
        }
        
        // Ajouter le résultat de l'outil à la conversation
        this.chatSession.conversation.addMessage('user', content);
      }
      
      return result;
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      this._triggerMessage({
        type: 'tool_error',
        tool_name: toolName,
        message: `Tool execution failed: ${error.message}`
      });
      return null;
    }
  }

  /**
   * Arrête une tâche en cours d'exécution
   */
  async stopTask() {
    this._triggerStatusChange('stopping');
    this._triggerMessage({
      type: 'system_message',
      message: 'Arrêt de la tâche en cours...'
    });

    // Dans une implémentation réelle, vous pourriez avoir un mécanisme 
    // pour arrêter l'exécution en cours
    
    this._triggerStatusChange('ready');
    this._triggerMessage({
      type: 'system_message',
      message: 'Tâche arrêtée'
    });
  }

  /**
   * Enregistre un callback pour recevoir les messages
   * @param {Function} callback - Fonction de callback
   * @returns {Function} Fonction pour supprimer le callback
   */
  onMessage(callback) {
    this.callbacks.onMessage.push(callback);
    return () => {
      this.callbacks.onMessage = this.callbacks.onMessage.filter(cb => cb !== callback);
    };
  }

  /**
   * Enregistre un callback pour recevoir les erreurs
   * @param {Function} callback - Fonction de callback
   * @returns {Function} Fonction pour supprimer le callback
   */
  onError(callback) {
    this.callbacks.onError.push(callback);
    return () => {
      this.callbacks.onError = this.callbacks.onError.filter(cb => cb !== callback);
    };
  }

  /**
   * Enregistre un callback pour recevoir les changements de statut
   * @param {Function} callback - Fonction de callback
   * @returns {Function} Fonction pour supprimer le callback
   */
  onStatusChange(callback) {
    this.callbacks.onStatusChange.push(callback);
    return () => {
      this.callbacks.onStatusChange = this.callbacks.onStatusChange.filter(cb => cb !== callback);
    };
  }

  /**
   * Déclenche un message pour tous les callbacks enregistrés
   * @param {Object} message - Message à envoyer
   */
  _triggerMessage(message) {
    this.callbacks.onMessage.forEach(callback => {
      try {
        callback(message);
      } catch (err) {
        console.error('Error in message callback:', err);
      }
    });
  }

  /**
   * Déclenche une erreur pour tous les callbacks enregistrés
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   */
  _triggerError(code, message) {
    const error = { code, message };
    this.callbacks.onError.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('Error in error callback:', err);
      }
    });
  }

  /**
   * Déclenche un changement de statut pour tous les callbacks enregistrés
   * @param {string} status - Nouveau statut
   */
  _triggerStatusChange(status) {
    this.callbacks.onStatusChange.forEach(callback => {
      try {
        callback(status);
      } catch (err) {
        console.error('Error in status callback:', err);
      }
    });
  }

  /**
   * Nettoie les ressources utilisées par le client
   */
  async cleanup() {
    if (this.chatSession) {
      try {
        await this.chatSession.cleanupServers();
        this.isInitialized = false;
        this._triggerStatusChange('cleaned');
      } catch (error) {
        console.error('Error cleaning up chat session:', error);
        this._triggerError('cleanup_failed', error.message);
      }
    }
  }
}

// Exporter une instance singleton
const mcpClient = new MCPClientWrapper();
export default mcpClient;
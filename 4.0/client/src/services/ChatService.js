// src/services/ChatService.js - Service révisé avec gestion de reconnexion améliorée
import { v4 as uuidv4 } from 'uuid';

/**
 * Service qui gère la communication avec le backend via WebSocket
 * et utilise les fonctionnalités avancées de client.js
 */
class ChatService {
  /**
   * Constructeur du service de chat
   * @param {string} sessionId - ID de session unique
   * @param {string} userId - ID de l'utilisateur
   */
  constructor(sessionId, userId) {
    this.sessionId = sessionId || this._generateSessionId();
    this.userId = userId;
    this.websocket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // Augmenté de 5 à 10
    this.reconnectTimeout = null;
    this.messageListeners = [];
    this.connectionChangeListeners = [];
    this.reconnectInterval = 2000; // Réduit à 2 secondes pour une reconnexion plus rapide
    this.pingInterval = null;
    this.lastPingTime = null;
    this.serverUrl = process.env.REACT_APP_API_URL || window.location.origin;
  }

  /**
   * Génère un ID de session unique
   * @returns {string} ID de session
   */
  _generateSessionId() {
    return `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
  }

  /**
   * Vérifie si le serveur est accessible avant de tenter une connexion WebSocket
   * @returns {Promise<boolean>} true si le serveur est accessible
   */
  async _checkServerHealth() {
    try {
      // Utiliser le endpoint /health ou /ping pour vérifier si le serveur est accessible
      const response = await fetch(`${this.serverUrl}/ping`, { 
        method: 'GET',
        headers: { 'Accept': 'text/plain' }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Erreur lors de la vérification de la santé du serveur:', error);
      return false;
    }
  }

  /**
   * Établit la connexion WebSocket avec une vérification préalable de la santé du serveur
   */
async connect() {
  if (this.websocket) {
    this.disconnect();
  }

  try {
    // Vérifier d'abord si le serveur est accessible
    const isServerHealthy = await this._checkServerHealth();
    
    if (!isServerHealthy) {
      console.error('Le serveur ne répond pas. Impossible d\'établir une connexion WebSocket');
      this._triggerMessage({
        type: 'error',
        message: 'Le serveur ne répond pas. Tentative de reconnexion...'
      });
      this._triggerConnectionChange(false);
      this._scheduleReconnect();
      return;
    }
    
    // MODIFICATION: Utiliser une approche plus compatible avec CSP
    let wsUrl;
    
    // Déterminer l'URL WebSocket en fonction de l'environnement
    if (process.env.NODE_ENV === 'development') {
      // En développement, construire l'URL de manière à respecter la CSP
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = process.env.REACT_APP_WS_PORT || '8080';
      wsUrl = `${protocol}//${host}:${port}/ws/${this.sessionId}`;
    } else {
      // En production, utiliser l'URL relative qui respecte automatiquement la CSP
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;
    }
    
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    this.websocket = new WebSocket(wsUrl);
    
    // Définir un timeout pour la connexion
    const connectionTimeout = setTimeout(() => {
      if (this.websocket && this.websocket.readyState !== WebSocket.OPEN) {
        console.error('La connexion WebSocket a expiré');
        this.websocket.close();
        this._handleClose({ code: 4000, reason: 'Connection timeout' });
      }
    }, 10000); // 10 secondes timeout
    
    this.websocket.onopen = () => {
      clearTimeout(connectionTimeout);
      this._handleOpen();
    };
    
    this.websocket.onmessage = this._handleMessage.bind(this);
    this.websocket.onclose = this._handleClose.bind(this);
    this.websocket.onerror = this._handleError.bind(this);
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    this._triggerConnectionChange(false);
    this._scheduleReconnect();
  }
}

  /**
   * Ferme la connexion WebSocket
   */
  disconnect() {
    if (this.websocket) {
      // Annuler les tentatives de reconnexion
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Annuler le ping interval
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      
      // Détacher les gestionnaires d'événements
      this.websocket.onopen = null;
      this.websocket.onmessage = null;
      this.websocket.onclose = null;
      this.websocket.onerror = null;
      
      // Fermer la connexion si elle est ouverte
      if (this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close();
      }
      
      this.websocket = null;
      this.isConnected = false;
      this._triggerConnectionChange(false);
    }
  }

  /**
   * Planifie une tentative de reconnexion avec backoff exponentiel
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      // Backoff exponentiel avec jitter pour éviter les tempêtes de connexion
      const jitter = Math.random() * 1000;
      const delay = Math.min(
        (this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1)) + jitter,
        60000 // Maximum 60 secondes
      );
      
      console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${Math.round(delay)}ms`);
      
      this._triggerMessage({
        type: 'system_message',
        message: `Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${Math.round(delay/1000)} secondes...`
      });
      
      this.reconnectTimeout = setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, delay);
    } else {
      console.error('Maximum reconnection attempts reached. Giving up.');
      this._triggerMessage({
        type: 'system_message',
        message: 'Impossible de se reconnecter au serveur après plusieurs tentatives. Veuillez rafraîchir la page.'
      });
    }
  }

  /**
   * Envoie un ping au serveur pour maintenir la connexion active
   */
  _sendPing() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      try {
        this.lastPingTime = Date.now();
        this.websocket.send(JSON.stringify({ type: 'ping' }));
      } catch (error) {
        console.error('Error sending ping:', error);
      }
    }
  }

  /**
   * Envoie un message via WebSocket
   * @param {string} message - Message à envoyer
   * @param {string} type - Type de message ('chat' ou 'task')
   */
  sendMessage(message, type = 'chat') {
    if (!this.isConnected || !this.websocket) {
      console.error('Cannot send message: WebSocket not connected');
      this._triggerMessage({
        type: 'error',
        message: 'Impossible d\'envoyer le message: non connecté au serveur'
      });
      
      // Tenter de se reconnecter
      this.connect();
      return;
    }
    
    try {
      const messageData = {
        type,
        [type === 'task' ? 'task' : 'message']: message
      };
      
      this.websocket.send(JSON.stringify(messageData));
      
      // Réinitialiser le compteur de reconnexion après un envoi réussi
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Error sending message:', error);
      this._triggerMessage({
        type: 'error',
        message: `Erreur lors de l'envoi du message: ${error.message}`
      });
      
      // Si une erreur se produit lors de l'envoi, c'est que la connexion est probablement rompue
      this._handleError(error);
    }
  }

  /**
   * Arrête la tâche en cours
   */
  stopTask() {
    if (!this.isConnected || !this.websocket) {
      console.error('Cannot stop task: WebSocket not connected');
      return;
    }
    
    try {
      const messageData = {
        type: 'stop_task'
      };
      
      this.websocket.send(JSON.stringify(messageData));
      
      // Envoyer un message de confirmation à l'UI
      this._triggerMessage({
        type: 'system_message',
        message: 'Demande d\'arrêt de la tâche envoyée'
      });
    } catch (error) {
      console.error('Error stopping task:', error);
    }
  }

  /**
   * Ajoute un écouteur de messages
   * @param {Function} listener - Fonction appelée lorsqu'un message est reçu
   * @returns {Function} Fonction pour supprimer l'écouteur
   */
  onMessage(listener) {
    this.messageListeners.push(listener);
    
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  /**
   * Ajoute un écouteur de changement de connexion
   * @param {Function} listener - Fonction appelée lorsque l'état de connexion change
   * @returns {Function} Fonction pour supprimer l'écouteur
   */
  onConnectionChange(listener) {
    this.connectionChangeListeners.push(listener);
    
    // Notifier immédiatement de l'état actuel
    listener(this.isConnected);
    
    return () => {
      this.connectionChangeListeners = this.connectionChangeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Déclenche l'événement de message pour tous les écouteurs
   * @param {Object} message - Message à transmettre
   */
  _triggerMessage(message) {
    this.messageListeners.forEach(listener => {
      try {
        listener(message);
      } catch (error) {
        console.error('Error in message listener:', error);
      }
    });
  }

  /**
   * Déclenche l'événement de changement de connexion
   * @param {boolean} isConnected - Nouvel état de connexion
   */
  _triggerConnectionChange(isConnected) {
    this.isConnected = isConnected;
    
    this.connectionChangeListeners.forEach(listener => {
      try {
        listener(isConnected);
      } catch (error) {
        console.error('Error in connection change listener:', error);
      }
    });
  }

  /**
   * Gestionnaire d'événement d'ouverture de connexion
   */
  _handleOpen() {
    console.log('WebSocket connection established');
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this._triggerConnectionChange(true);
    
    // Notifier l'UI que la connexion est établie
    this._triggerMessage({
      type: 'system_message',
      message: 'Connecté au serveur'
    });
    
    // Envoyer un ping régulier pour maintenir la connexion
    this.pingInterval = setInterval(() => {
      this._sendPing();
      
      // Vérifier si le dernier ping a reçu une réponse
      if (this.lastPingTime && Date.now() - this.lastPingTime > 30000) {
        console.warn('Aucune réponse au ping depuis 30 secondes, fermeture de la connexion');
        this.websocket.close();
      }
    }, 15000); // Toutes les 15 secondes
  }

  /**
   * Gestionnaire d'événement de message reçu
   * @param {MessageEvent} event - Événement de message
   */
  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      // Traiter les pings spécialement
      if (data.type === 'pong') {
        this.lastPingTime = null; // Réinitialiser le timer de ping
        return;
      }
      
      // Journaliser les messages non-ping
      console.log('Received message:', data);
      
      // Transmettre le message aux écouteurs
      this._triggerMessage(data);
    } catch (error) {
      console.error('Error parsing message:', error, event.data);
    }
  }

  /**
   * Gestionnaire d'événement de fermeture de connexion
   * @param {CloseEvent} event - Événement de fermeture
   */
  _handleClose(event) {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    
    // Nettoyer le ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Si la connexion était établie, notifier de la déconnexion
    if (this.isConnected) {
      this.isConnected = false;
      this._triggerConnectionChange(false);
    }
    
    // Codes de fermeture normale
    const normalCloseCodes = [1000, 1001];
    
    // Si la fermeture n'est pas propre, tenter de se reconnecter
    if (!normalCloseCodes.includes(event.code)) {
      this._scheduleReconnect();
    }
  }

  /**
   * Gestionnaire d'événement d'erreur
   * @param {Event} error - Événement d'erreur
   */
  _handleError(error) {
    console.error('WebSocket error:', error);
    
    // Notifier l'UI de l'erreur
    this._triggerMessage({
      type: 'error',
      message: 'Erreur de connexion WebSocket'
    });
    
    // Ne pas déclencher de reconnexion ici, cela sera fait dans handleClose
    // qui est généralement appelé juste après une erreur
  }
}

export default ChatService;
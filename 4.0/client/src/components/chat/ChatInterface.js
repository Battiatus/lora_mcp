import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../contexts/NotificationContext';
import Button from '../common/Button';
import Loader from '../common/Loader';
import Modal from '../common/Modal';
import MessagesList from './MessagesList';
// import ToolResultView from './ToolResultView';
import QuickActionBar from './QuickActionBar';

// Ce service utilise le client.js sophistiqué fourni
import ChatService from '../../services/ChatService';

const ChatInterface = () => {
  const { currentUser } = useAuth();
  const { success, error: showError } = useNotification();
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [currentMode, setCurrentMode] = useState('chat'); // 'chat' or 'task'
  const [sessionId, setSessionId] = useState(null);
  const [taskProgress, setTaskProgress] = useState(null);
  const [modalImage, setModalImage] = useState(null);
  const messageInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const chatService = useRef(null);

  // Fonctions auxiliaires - définies avant d'être utilisées pour éviter les erreurs ESLint

  // Faire défiler vers le bas de la conversation
  const scrollToBottom = () => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Auto-resize du textarea
  const autoResizeTextarea = () => {
    if (messageInputRef.current) {
      messageInputRef.current.style.height = 'auto';
      messageInputRef.current.style.height = 
        Math.min(messageInputRef.current.scrollHeight, 120) + 'px';
    }
  };

  // Ajouter un message à l'historique
  const addMessage = (sender, content, type = 'normal') => {
    setMessages(prevMessages => [
      ...prevMessages, 
      {
        id: Date.now(),
        sender,
        content,
        type,
        timestamp: new Date().toISOString()
      }
    ]);
  };

  // Ajouter ou mettre à jour un message d'outil
  const addOrUpdateToolMessage = (toolName, args, status, message = '') => {
    // Vérifier si un message d'outil existe déjà
    const toolMessageIndex = messages.findIndex(
      m => m.type === 'tool' && m.toolName === toolName
    );

    if (toolMessageIndex === -1) {
      // Créer un nouveau message d'outil
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: Date.now(),
          sender: 'tool',
          type: 'tool',
          toolName,
          args,
          status,
          content: message,
          timestamp: new Date().toISOString()
        }
      ]);
    } else {
      // Mettre à jour le message d'outil existant
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        newMessages[toolMessageIndex] = {
          ...newMessages[toolMessageIndex],
          status,
          content: message
        };
        return newMessages;
      });
    }
  };

  // Mettre à jour un message d'outil existant
  const updateToolMessage = (toolName, status, message, result = null) => {
    const toolMessageIndex = messages.findIndex(
      m => m.type === 'tool' && m.toolName === toolName
    );

    if (toolMessageIndex === -1) {
      // Créer le message s'il n'existe pas
      addOrUpdateToolMessage(toolName, {}, status, message);
    } else {
      // Mettre à jour le message existant
      setMessages(prevMessages => {
        const newMessages = [...prevMessages];
        newMessages[toolMessageIndex] = {
          ...newMessages[toolMessageIndex],
          status,
          content: message,
          result: result
        };
        return newMessages;
      });
    }
  };

  // Gérer les résultats d'image (captures d'écran)
  const handleImageResult = (content) => {
    for (const item of content) {
      if (item.image) {
        setMessages(prevMessages => [
          ...prevMessages,
          {
            id: Date.now(),
            sender: 'image',
            type: 'image',
            content: `data:image/${item.image.format};base64,${item.image.data}`,
            timestamp: new Date().toISOString()
          }
        ]);
        break;
      }
    }
  };

  // Gérer le début d'une tâche
  const startTaskProgress = (message) => {
    setTaskProgress({
      step: 0,
      totalSteps: '?',
      message,
      progress: 0,
      isComplete: false
    });
  };

  // Mettre à jour la progression d'une tâche
  const updateTaskProgress = (step, message) => {
    setTaskProgress(prev => {
      if (!prev) return null;
      
      const progress = Math.min((step / 20) * 100, 95);
      
      return {
        ...prev,
        step,
        message,
        progress
      };
    });
  };

  // Compléter une tâche
  const completeTaskProgress = (totalSteps) => {
    setTaskProgress(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        step: totalSteps,
        totalSteps,
        progress: 100,
        message: `Tâche terminée en ${totalSteps} étapes`,
        isComplete: true
      };
    });
  };

  // Traiter les messages entrants depuis le service
  const handleIncomingMessage = (message) => {
    console.log('Message reçu:', message);
    
    switch (message.type) {
      case 'typing':
        setIsTyping(true);
        break;
        
      case 'assistant_message':
        setIsTyping(false);
        addMessage('assistant', message.message);
        break;
        
      case 'assistant_tool_call':
        setIsTyping(false);
        addMessage('assistant', message.message);
        break;
        
      case 'tool_executing':
        addOrUpdateToolMessage(message.tool_name, {}, 'executing', message.message);
        break;
        
      case 'tool_success':
        setIsTyping(false);
        updateToolMessage(message.tool_name, 'success', message.message, message.result);
        break;
        
      case 'tool_success_image':
        setIsTyping(false);
        updateToolMessage(message.tool_name, 'success', message.message);
        handleImageResult(message.content);
        break;
        
      case 'tool_error':
        setIsTyping(false);
        updateToolMessage(message.tool_name, 'error', message.message);
        break;
        
      case 'task_started':
        setIsTyping(false);
        startTaskProgress(message.message);
        break;
        
      case 'task_step':
        updateTaskProgress(message.step, message.message);
        addOrUpdateToolMessage(message.tool_name, message.tool_args, 'executing', message.message);
        break;
        
      case 'task_completed':
        setIsTyping(false);
        completeTaskProgress(message.steps);
        if (message.message && message.message !== "Task completed successfully!") {
          addMessage('assistant', message.message);
        }
        break;
        
      case 'system_message':
        addMessage('system', message.message);
        break;
        
      case 'error':
        setIsTyping(false);
        addMessage('system', `❌ Error: ${message.message}`, 'error');
        break;
        
      default:
        console.warn('Type de message non géré:', message.type);
    }
  };

  // Initialiser le service de chat lors du montage du composant
  useEffect(() => {
    if (currentUser && !chatService.current) {
      // Générer un ID de session unique
      const newSessionId = `session_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
      setSessionId(newSessionId);
      
      // Initialiser le service de chat
      chatService.current = new ChatService(newSessionId, currentUser.uid);
      
      // Configurer les écouteurs d'événements
      chatService.current.onConnectionChange((status) => {
        setIsConnected(status);
        if (status) {
          success('Connecté au serveur');
        } else {
          showError('Déconnecté du serveur. Tentative de reconnexion...');
        }
      });
      
      chatService.current.onMessage((message) => {
        handleIncomingMessage(message);
      });
      
      // Démarrer la connexion
      chatService.current.connect();
    }
    
    // Nettoyage lors du démontage
    return () => {
      if (chatService.current) {
        chatService.current.disconnect();
        chatService.current = null;
      }
    };
  }, [currentUser, success, showError]);

  // Faire défiler vers le bas lorsque de nouveaux messages arrivent
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Gérer l'auto-resize du textarea
  useEffect(() => {
    if (messageInputRef.current) {
      autoResizeTextarea();
    }
  }, [messageInput]);

  // Envoyer un message
  const sendMessage = () => {
    if (!messageInput.trim() || !isConnected) return;
    
    // Ajouter le message à l'historique
    addMessage('user', messageInput);
    
    // Envoyer le message via le service
    chatService.current.sendMessage(messageInput, currentMode);
    
    // Réinitialiser l'entrée
    setMessageInput('');
    autoResizeTextarea();
  };

  // Changer de mode (chat ou tâche)
  const switchMode = (mode) => {
    setCurrentMode(mode);
  };

  // Afficher une image en modal
  const showImageModal = (imageUrl) => {
    setModalImage(imageUrl);
  };

  // Fermer la modal d'image
  const closeImageModal = () => {
    setModalImage(null);
  };

  // Effacer l'historique des messages
  const clearChat = () => {
    if (window.confirm('Êtes-vous sûr de vouloir effacer tout l\'historique de conversation ?')) {
      setMessages([]);
      setTaskProgress(null);
    }
  };

  // Exporter l'historique des messages
  const exportChat = () => {
    const chatData = {
      sessionId,
      timestamp: new Date().toISOString(),
      messages
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-chat-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    success('Conversation exportée avec succès');
  };

  // Arrêter la tâche en cours
  const stopCurrentTask = () => {
    if (window.confirm('Êtes-vous sûr de vouloir arrêter la tâche en cours ?')) {
      chatService.current.stopTask();
      setTaskProgress(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          message: 'Tâche arrêtée par l\'utilisateur',
          isComplete: true
        };
      });
      
      addMessage('system', 'Tâche arrêtée par l\'utilisateur');
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-64px)]">
      {/* En-tête de la conversation */}
      <div className="flex justify-between items-center p-4 bg-white border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            {currentMode === 'chat' ? 'Assistant Intelligent' : 'Assistant d\'Automatisation'}
          </h2>
          <div className="flex items-center text-sm text-gray-500">
            <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{isConnected ? 'Connecté' : 'Déconnecté'}</span>
            {sessionId && (
              <span className="ml-4 font-mono text-xs">Session: {sessionId.substring(0, 8)}...</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => switchMode('chat')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                currentMode === 'chat' 
                  ? 'bg-white shadow-sm text-blue-600' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-comments mr-1"></i>
              Chat
            </button>
            <button
              onClick={() => switchMode('task')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                currentMode === 'task' 
                  ? 'bg-white shadow-sm text-blue-600' 
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <i className="fas fa-tasks mr-1"></i>
              Tâche
            </button>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
          >
            <i className="fas fa-trash mr-1"></i>
            Effacer
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={exportChat}
          >
            <i className="fas fa-download mr-1"></i>
            Exporter
          </Button>
        </div>
      </div>
      
      {/* Barre d'actions rapides */}
      <QuickActionBar
        onAction={(action) => {
          setMessageInput(action);
          autoResizeTextarea();
        }}
      />
      
      {/* Progression de la tâche */}
      {taskProgress && (
        <div className="m-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <div className="font-medium text-gray-800">Exécution de tâche</div>
            <div className="text-sm text-gray-600">
              Étape <span className="font-medium">{taskProgress.step}</span> sur <span>{taskProgress.totalSteps}</span>
            </div>
          </div>
          
          <div className="relative w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="absolute top-0 left-0 h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${taskProgress.progress}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between items-center mt-2">
            <div className="text-sm text-gray-600">{taskProgress.message}</div>
            
            {!taskProgress.isComplete && (
              <Button
                variant="danger"
                size="sm"
                onClick={stopCurrentTask}
              >
                <i className="fas fa-stop mr-1"></i>
                Arrêter
              </Button>
            )}
          </div>
        </div>
      )}
      
      {/* Liste des messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <i className="fas fa-robot text-blue-600 text-2xl"></i>
            </div>
            <h3 className="text-xl font-medium mb-2">Bienvenue sur MCP Assistant</h3>
            <p className="text-center max-w-md mb-4">
              Votre assistant intelligent pour la navigation web, la recherche et l'automatisation. Posez une question ou décrivez une tâche à accomplir.
            </p>
            {currentMode === 'task' && (
              <div className="text-center text-sm bg-blue-50 p-3 rounded-lg">
                <p className="font-medium text-blue-700 mb-1">Mode Tâche activé</p>
                <p>Décrivez une tâche complexe et l'assistant l'exécutera automatiquement.</p>
              </div>
            )}
          </div>
        ) : (
          <MessagesList 
            messages={messages} 
            onImageClick={showImageModal}
          />
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Zone de saisie */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-end bg-white border border-gray-300 rounded-lg focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
          <textarea
            ref={messageInputRef}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={currentMode === 'chat' 
              ? "Posez une question ou démarrez une conversation..." 
              : "Décrivez une tâche à automatiser..."
            }
            className="flex-1 p-3 border-none focus:ring-0 resize-none max-h-32 min-h-[40px]"
            rows={1}
          />
          
          <button
            onClick={sendMessage}
            disabled={!isConnected || !messageInput.trim()}
            className={`p-3 mr-2 rounded-full ${
              !isConnected || !messageInput.trim()
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-blue-600 hover:text-blue-700'
            }`}
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
        
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <span>Appuyez sur Entrée pour envoyer, Maj+Entrée pour un saut de ligne</span>
          
          {isTyping && (
            <div className="flex items-center">
              <div className="flex space-x-1 mr-2">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <span>Assistant en train d'écrire...</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal pour afficher les images en plein écran */}
      <Modal
        isOpen={!!modalImage}
        onClose={closeImageModal}
        title="Capture d'écran"
        size="xl"
      >
        <div className="flex justify-center">
          <img
            src={modalImage}
            alt="Capture d'écran"
            className="max-w-full max-h-[calc(100vh-200px)]"
          />
        </div>
      </Modal>
    </div>
  );
};

export default ChatInterface;
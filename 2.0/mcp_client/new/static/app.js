 /**
 * MCP Client - Interface utilisateur avancée
 * Application JavaScript complète avec support responsive et fonctionnalités avancées
 */

class MCPClient {
  constructor() {
    // Gestion des états
    this.state = {
      sessionId: this.generateSessionId(),
      isConnected: false,
      isAuthenticated: false,
      isExecuting: false,
      currentMode: "chat",
      messageHistory: [],
      conversations: [],
      currentConversationId: null,
      apiUsage: {
        count: 0,
        limit: 100,
      },
      screenshots: [],
      userAvatar: "/static/default-avatar.png",
      username: "Utilisateur",
      taskSteps: [],
      currentTaskStep: 0,
    };

    // Initialiser l'interface
    this.initializeElements();
    this.setupEventListeners();
    this.checkAuthentication();
  }

  /**
   * Génère un identifiant de session unique
   */
  generateSessionId() {
    return (
      "session_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now()
    );
  }

  /**
   * Initialise les références aux éléments DOM
   */
  initializeElements() {
    // Conteneurs principaux
    this.elements = {
      // Authentification
      authOverlay: document.getElementById("authOverlay"),
      loginForm: document.getElementById("loginForm"),
      loginError: document.getElementById("loginError"),
      usernameInput: document.getElementById("username"),
      passwordInput: document.getElementById("password"),

      // Sidebar et éléments de navigation
      sidebar: document.getElementById("sidebar"),
      sidebarToggle: document.getElementById("sidebarToggle"),
      connectionStatus: document.getElementById("connectionStatus"),
      displayUsername: document.getElementById("displayUsername"),
      userAvatar: document.getElementById("userAvatar"),
      avatarEditBtn: document.getElementById("avatarEditBtn"),
      conversationsList: document.getElementById("conversationsList"),
      newChatBtn: document.getElementById("newChatBtn"),

      // Stats et progess
      usageCount: document.getElementById("usageCount"),
      usageLimit: document.getElementById("usageLimit"),
      usageProgressFill: document.getElementById("usageProgressFill"),

      // Chat et messages
      chatTitle: document.getElementById("chatTitle"),
      messagesContainer: document.getElementById("messagesContainer"),
      messageInput: document.getElementById("messageInput"),
      sendBtn: document.getElementById("sendBtn"),
      typingIndicator: document.getElementById("typingIndicator"),
      clearChat: document.getElementById("clearChat"),
      exportBtn: document.getElementById("exportBtn"),
      exportDropdown: document.getElementById("exportDropdown"),

      // Barre de progression des tâches
      taskProgressContainer: document.getElementById("taskProgressContainer"),
      progressFill: document.getElementById("progressFill"),
      currentStep: document.getElementById("currentStep"),
      progressDetailBtn: document.getElementById("progressDetailBtn"),

      // Modals
      imageModalOverlay: document.getElementById("imageModalOverlay"),
      modalImage: document.getElementById("modalImage"),
      closeImageModal: document.getElementById("closeImageModal"),
      downloadImageBtn: document.getElementById("downloadImageBtn"),

      taskDetailModalOverlay: document.getElementById("taskDetailModalOverlay"),
      taskStepsContainer: document.getElementById("taskStepsContainer"),
      closeTaskDetailModal: document.getElementById("closeTaskDetailModal"),

      avatarModalOverlay: document.getElementById("avatarModalOverlay"),
      avatarPreview: document.getElementById("avatarPreview"),
      avatarUpload: document.getElementById("avatarUpload"),
      saveAvatarBtn: document.getElementById("saveAvatarBtn"),
      cancelAvatarBtn: document.getElementById("cancelAvatarBtn"),

      resultModalOverlay: document.getElementById("resultModalOverlay"),
      resultContent: document.getElementById("resultContent"),
      closeResultModal: document.getElementById("closeResultModal"),
      downloadResultBtn: document.getElementById("downloadResultBtn"),

      galleryModalOverlay: document.getElementById("galleryModalOverlay"),
      screenshotGallery: document.getElementById("screenshotGallery"),
      closeGalleryModal: document.getElementById("closeGalleryModal"),
      downloadAllImagesBtn: document.getElementById("downloadAllImagesBtn"),
    };
  }

  /**
   * Configure tous les écouteurs d'événements
   */
  setupEventListeners() {
    // Authentification
    this.elements.loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // Sidebar toggle
    this.elements.sidebarToggle.addEventListener("click", () => {
      this.toggleSidebar();
    });

    // Edition avatar
    this.elements.avatarEditBtn.addEventListener("click", () => {
      this.showAvatarModal();
    });

    // Nouvelle conversation
    this.elements.newChatBtn.addEventListener("click", () => {
      this.startNewConversation();
    });

    // Envoi de message
    this.elements.sendBtn.addEventListener("click", () => {
      if (this.state.isExecuting) {
        this.stopExecution();
      } else {
        this.sendMessage();
      }
    });

    // Gestion du textarea
    this.elements.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (this.state.isExecuting) {
          this.stopExecution();
        } else {
          this.sendMessage();
        }
      }
    });

    this.elements.messageInput.addEventListener("input", () => {
      this.autoResizeTextarea();
    });

    // Sélecteur de mode
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.switchMode(btn.dataset.mode));
    });

    // Actions rapides
    document.querySelectorAll(".action-btn").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.handleQuickAction(btn.dataset.action)
      );
    });

    // Contrôles du chat
    this.elements.clearChat.addEventListener("click", () => this.clearChat());
    
    // Gestion du dropdown pour l'export
    this.elements.exportBtn.addEventListener("click", () => {
      this.elements.exportDropdown.querySelector(".dropdown-menu").classList.toggle("show");
    });
    
    // Fermer le dropdown si on clique ailleurs
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#exportDropdown") && this.elements.exportDropdown.querySelector(".dropdown-menu").classList.contains("show")) {
        this.elements.exportDropdown.querySelector(".dropdown-menu").classList.remove("show");
      }
    });
    
    // Options d'export
    this.elements.exportDropdown.querySelectorAll(".dropdown-item").forEach(item => {
      item.addEventListener("click", () => {
        const format = item.dataset.format;
        this.exportChat(format);
        this.elements.exportDropdown.querySelector(".dropdown-menu").classList.remove("show");
      });
    });

    // Gestion des modals
    this.elements.closeImageModal.addEventListener("click", () => {
      this.elements.imageModalOverlay.classList.remove("show");
    });
    
    this.elements.imageModalOverlay.addEventListener("click", (e) => {
      if (e.target === this.elements.imageModalOverlay) {
        this.elements.imageModalOverlay.classList.remove("show");
      }
    });
    
    this.elements.downloadImageBtn.addEventListener("click", () => {
      this.downloadCurrentImage();
    });
    
    // Modal détails des tâches
    this.elements.progressDetailBtn.addEventListener("click", () => {
      this.showTaskDetailModal();
    });
    
    this.elements.closeTaskDetailModal.addEventListener("click", () => {
      this.elements.taskDetailModalOverlay.classList.remove("show");
    });
    
    // Modal avatar
    this.elements.avatarUpload.addEventListener("change", (e) => {
      this.handleAvatarUpload(e);
    });
    
    this.elements.saveAvatarBtn.addEventListener("click", () => {
      this.saveAvatarChanges();
    });
    
    this.elements.cancelAvatarBtn.addEventListener("click", () => {
      this.elements.avatarModalOverlay.classList.remove("show");
    });
    
    document.querySelectorAll(".color-option").forEach(option => {
      option.addEventListener("click", () => {
        document.querySelectorAll(".color-option").forEach(opt => opt.classList.remove("selected"));
        option.classList.add("selected");
        this.generateAvatarFromColor(option.dataset.color);
      });
    });
    
    // Modal résultat
    this.elements.closeResultModal.addEventListener("click", () => {
      this.elements.resultModalOverlay.classList.remove("show");
    });
    
    this.elements.downloadResultBtn.addEventListener("click", () => {
      this.downloadCurrentResult();
    });
    
    // Modal galerie
    this.elements.closeGalleryModal.addEventListener("click", () => {
      this.elements.galleryModalOverlay.classList.remove("show");
    });
    
    this.elements.downloadAllImagesBtn.addEventListener("click", () => {
      this.downloadAllScreenshots();
    });
  }

  /**
   * Vérifie l'authentification et affiche le formulaire de connexion si nécessaire
   */
  checkAuthentication() {
    // Vérifier si un token existe en localStorage
    const token = localStorage.getItem("mcp_auth_token");
    
    if (token) {
      // Valider le token côté serveur
      fetch("/api/auth/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.valid) {
            // Token valide, définir l'état et les informations utilisateur
            this.state.isAuthenticated = true;
            this.state.username = data.username || "Utilisateur";
            this.state.userAvatar = data.avatar || "/static/default-avatar.png";
            
            // Mettre à jour l'interface
            this.updateUserInterface();
            this.connectWebSocket();
            
            // Charger les conversations
            this.loadConversations();
          } else {
            // Token invalide, afficher le formulaire de connexion
            this.showLoginForm();
          }
        })
        .catch((error) => {
          console.error("Erreur de validation du token:", error);
          this.showLoginForm();
        });
    } else {
      // Pas de token, afficher le formulaire de connexion
      this.showLoginForm();
    }
  }

  /**
   * Gère la soumission du formulaire de connexion
   */
  handleLogin() {
    const username = this.elements.usernameInput.value.trim();
    const password = this.elements.passwordInput.value;
    
    if (!username || !password) {
      this.elements.loginError.textContent = "Veuillez remplir tous les champs";
      return;
    }
    
    // En attendant l'implémentation côté serveur, on utilise une authentification simple
    // À remplacer par un appel API réel
    if (username === "admin" && password === "password") {
      // Simuler un token d'authentification
      const token = btoa(username + ":" + Date.now());
      localStorage.setItem("mcp_auth_token", token);
      
      // Mettre à jour l'état
      this.state.isAuthenticated = true;
      this.state.username = username;
      
      // Mettre à jour l'interface
      this.updateUserInterface();
      this.connectWebSocket();
      
      // Masquer le formulaire de connexion
      this.elements.authOverlay.style.display = "none";
    } else {
      this.elements.loginError.textContent = "Identifiants incorrects";
    }
  }

  /**
   * Affiche le formulaire de connexion
   */
  showLoginForm() {
    this.elements.authOverlay.style.display = "flex";
  }

  /**
   * Met à jour l'interface utilisateur après authentification
   */
  updateUserInterface() {
    this.elements.displayUsername.textContent = this.state.username;
    this.elements.userAvatar.src = this.state.userAvatar;
    
    // Mettre à jour les stats d'utilisation API
    this.updateApiUsageDisplay();
  }

  /**
   * Charge les conversations depuis le serveur ou le stockage local
   */
  loadConversations() {
    // Simuler le chargement des conversations depuis le localStorage
    // À remplacer par un appel API réel
    const savedConversations = localStorage.getItem("mcp_conversations");
    
    if (savedConversations) {
      try {
        this.state.conversations = JSON.parse(savedConversations);
        this.renderConversationsList();
      } catch (e) {
        console.error("Erreur lors du chargement des conversations:", e);
        this.state.conversations = [];
      }
    }
    
    // Créer une nouvelle conversation si aucune n'existe
    if (this.state.conversations.length === 0) {
      this.startNewConversation();
    } else {
      // Charger la dernière conversation
      this.loadConversation(this.state.conversations[0].id);
    }
  }

  /**
   * Démarre une nouvelle conversation
   */
  startNewConversation() {
    const newConversation = {
      id: "conv_" + Date.now(),
      title: "Nouvelle conversation",
      date: new Date().toISOString(),
      messages: [],
    };
    
    // Ajouter à la liste et définir comme conversation actuelle
    this.state.conversations.unshift(newConversation);
    this.state.currentConversationId = newConversation.id;
    this.state.messageHistory = [];
    
    // Sauvegarder et mettre à jour l'interface
    this.saveConversations();
    this.renderConversationsList();
    this.clearMessagesContainer();
  }

  /**
   * Charge une conversation existante
   */
  loadConversation(conversationId) {
    const conversation = this.state.conversations.find(
      (conv) => conv.id === conversationId
    );
    
    if (conversation) {
      this.state.currentConversationId = conversationId;
      this.state.messageHistory = conversation.messages;
      
      // Mettre à jour l'interface
      this.renderConversationsList();
      this.renderMessages();
    }
  }

  /**
   * Sauvegarde les conversations dans le stockage local
   */
  saveConversations() {
    localStorage.setItem(
      "mcp_conversations",
      JSON.stringify(this.state.conversations)
    );
  }

  /**
   * Sauvegarde la conversation actuelle
   */
  saveCurrentConversation() {
    if (this.state.currentConversationId) {
      const index = this.state.conversations.findIndex(
        (conv) => conv.id === this.state.currentConversationId
      );
      
      if (index !== -1) {
        // Mettre à jour le titre si besoin
        if (this.state.messageHistory.length > 0) {
          const firstUserMessage = this.state.messageHistory.find(
            (msg) => msg.sender === "user"
          );
          
          if (firstUserMessage) {
            const title = firstUserMessage.content.substring(0, 30) + 
              (firstUserMessage.content.length > 30 ? "..." : "");
            this.state.conversations[index].title = title;
          }
        }
        
        // Mettre à jour les messages
        this.state.conversations[index].messages = this.state.messageHistory;
        this.state.conversations[index].lastUpdated = new Date().toISOString();
        
        // Sauvegarder et mettre à jour l'interface
        this.saveConversations();
        this.renderConversationsList();
      }
    }
  }

  /**
   * Affiche la liste des conversations
   */
  renderConversationsList() {
    this.elements.conversationsList.innerHTML = "";
    
    this.state.conversations.forEach((conv) => {
      const item = document.createElement("div");
      item.className = `conversation-item ${
        conv.id === this.state.currentConversationId ? "active" : ""
      }`;
      item.dataset.id = conv.id;
      
      item.innerHTML = `
        <div class="conversation-icon">
          <i class="fas fa-comment"></i>
        </div>
        <div class="conversation-title">${conv.title}</div>
      `;
      
      item.addEventListener("click", () => {
        this.loadConversation(conv.id);
      });
      
      this.elements.conversationsList.appendChild(item);
    });
  }

  /**
   * Bascule l'affichage de la sidebar
   */
  toggleSidebar() {
    this.elements.sidebar.classList.toggle("collapsed");
  }

  /**
   * Établit la connexion WebSocket
   */
  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/${this.state.sessionId}`;

    this.websocket = new WebSocket(wsUrl);

    this.websocket.onopen = () => {
      this.state.isConnected = true;
      this.updateConnectionStatus("Connecté", true);
    };

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleWebSocketMessage(data);
    };

    this.websocket.onclose = () => {
      this.state.isConnected = false;
      this.updateConnectionStatus("Déconnecté", false);
      this.hideTypingIndicator();

      // Tenter de se reconnecter après 3 secondes
      setTimeout(() => {
        if (!this.state.isConnected) {
          this.connectWebSocket();
        }
      }, 3000);
    };

    this.websocket.onerror = (error) => {
      console.error("Erreur WebSocket:", error);
      this.updateConnectionStatus("Erreur de connexion", false);
    };
  }

  /**
   * Met à jour l'indicateur de statut de connexion
   */
  updateConnectionStatus(message, connected) {
    const statusElement = this.elements.connectionStatus;
    const dot = statusElement.querySelector(".status-dot");
    const text = statusElement.querySelector("span");

    text.textContent = message;
    if (connected) {
      dot.classList.add("connected");
    } else {
      dot.classList.remove("connected");
    }
  }

  /**
   * Gère les messages WebSocket reçus
   */
  handleWebSocketMessage(data) {
    switch (data.type) {
      case "typing":
        this.showTypingIndicator(data.message);
        break;

      case "assistant_message":
        this.hideTypingIndicator();
        this.addMessage("assistant", data.message);
        this.setExecutionState(false);
        break;

      case "assistant_tool_call":
        this.hideTypingIndicator();
        this.addMessage("assistant", data.message);
        break;

      case "tool_executing":
        this.setExecutionState(true);
        this.addOrUpdateToolMessage(
          data.tool_name,
          {},
          "executing",
          data.message
        );
        break;

      case "tool_success":
        this.updateToolMessage(
          data.tool_name,
          "success",
          data.message,
          data.result
        );
        // Incrémenter le compteur d'utilisation API
        this.incrementApiUsage();
        break;

      case "tool_success_image":
        this.updateToolMessage(data.tool_name, "success", data.message);
        this.handleImageResult(data.content);
        // Incrémenter le compteur d'utilisation API
        this.incrementApiUsage();
        break;

      case "tool_error":
        this.updateToolMessage(data.tool_name, "error", data.message);
        this.setExecutionState(false);
        break;

      case "task_started":
        this.hideTypingIndicator();
        this.setExecutionState(true);
        this.startTaskProgress(data.message);
        break;

      case "task_step":
        this.updateTaskProgress(data.step, data.message);
        this.addOrUpdateToolMessage(
          data.tool_name,
          data.tool_args,
          "executing",
          data.message
        );
        // Ajouter cette étape à l'historique des étapes
        this.addTaskStep(data.step, data.message, data.tool_name);
        break;

      case "task_completed":
        this.completeTaskProgress(data.steps);
        if (data.message && data.message !== "Task completed successfully!") {
          this.addMessage("assistant", data.message);
          // Afficher le résultat dans une prévisualisation
          this.showResultPreview(data.message);
        }
        this.setExecutionState(false);
        break;

      case "system_message":
        this.addMessage("system", data.message);
        break;

      case "error":
        this.hideTypingIndicator();
        this.addMessage("system", `❌ Erreur: ${data.message}`, "error");
        this.setExecutionState(false);
        break;
    }
    
    // Sauvegarder la conversation après chaque message
    this.saveCurrentConversation();
  }

  /**
   * Ajoute ou met à jour un message d'outil
   */
  addOrUpdateToolMessage(toolName, args, status, message = "") {
    // Vérifier si le message d'outil existe déjà
    let toolElement = this.elements.messagesContainer.querySelector(
      `[data-tool-name="${toolName}"]`
    );

    if (!toolElement) {
      // Créer un nouveau message d'outil
      this.addToolMessage(toolName, args, status);
      toolElement = this.elements.messagesContainer.querySelector(
        `[data-tool-name="${toolName}"]`
      );
    }

    if (toolElement) {
      this.updateToolStatus(toolElement, status, message);
    }
  }

  /**
   * Met à jour un message d'outil existant
   */
  updateToolMessage(toolName, status, message, result = null) {
    const toolElement = this.elements.messagesContainer.querySelector(
      `[data-tool-name="${toolName}"]`
    );
    if (!toolElement) {
      // Créer le message d'outil s'il n'existe pas
      this.addToolMessage(toolName, {}, status);
      const newToolElement = this.elements.messagesContainer.querySelector(
        `[data-tool-name="${toolName}"]`
      );
      return this.updateToolStatus(newToolElement, status, message, result);
    }

    this.updateToolStatus(toolElement, status, message, result);
  }

  /**
   * Change l'état d'exécution et met à jour l'interface
   */
  setExecutionState(isExecuting) {
    this.state.isExecuting = isExecuting;
    
    // Mettre à jour le bouton d'envoi
    if (isExecuting) {
      this.elements.sendBtn.classList.add("stop-btn");
      this.elements.sendBtn.title = "Arrêter l'exécution";
    } else {
      this.elements.sendBtn.classList.remove("stop-btn");
      this.elements.sendBtn.title = "Envoyer";
    }
  }

  /**
   * Arrête l'exécution en cours
   */
  stopExecution() {
    // Envoyer une demande d'arrêt au serveur
    if (this.websocket && this.state.isConnected) {
      this.websocket.send(JSON.stringify({
        type: "stop_execution",
        session_id: this.state.sessionId
      }));
    }
    
    // Mettre à jour l'interface
    this.setExecutionState(false);
    this.hideTaskProgress();
    
    // Ajouter un message système
    this.addMessage("system", "Exécution arrêtée par l'utilisateur.");
  }

  /**
   * Envoie un message
   */
  sendMessage() {
    const message = this.elements.messageInput.value.trim();
    if (!message || !this.state.isConnected) return;

    // Ajouter le message utilisateur à l'interface
    this.addMessage("user", message);

    // Effacer l'input
    this.elements.messageInput.value = "";
    this.autoResizeTextarea();

    // Envoyer via WebSocket
    const messageData = {
      type: this.state.currentMode,
      [this.state.currentMode === "task" ? "task" : "message"]: message,
    };

    this.websocket.send(JSON.stringify(messageData));

    // Afficher l'indicateur de frappe
    this.showTypingIndicator("L'assistant réfléchit...");
  }

  /**
   * Ajoute un message à l'interface
   */
  addMessage(sender, content, type = "normal") {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}-message`;

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const avatarIcon =
      {
        user: "fas fa-user",
        assistant: "fas fa-robot",
        system: "fas fa-cog",
      }[sender] || "fas fa-circle";

    const senderName =
      {
        user: "Vous",
        assistant: "Assistant",
        system: "Système",
      }[sender] || sender;

    // Formater le contenu selon le type de message
    const formattedContent = this.formatMessageContent(content, sender);

    messageDiv.innerHTML = `
      <div class="message-header">
        <div class="message-avatar ${sender}-avatar">
          <i class="${avatarIcon}"></i>
        </div>
        <div class="message-info">
          <div class="message-sender">${senderName}</div>
          <div class="message-time">${time}</div>
        </div>
      </div>
      <div class="message-content ${sender === 'assistant' ? 'markdown-content' : ''}">
        ${formattedContent}
      </div>
    `;

    // Supprimer le message d'accueil s'il existe
    const welcomeMessage =
      this.elements.messagesContainer.querySelector(".welcome-message");
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    this.elements.messagesContainer.appendChild(messageDiv);
    this.scrollToBottom();

    // Stocker dans l'historique
    this.state.messageHistory.push({
      sender,
      content,
      timestamp: new Date().toISOString(),
      type,
    });

    // Si c'est un message de l'assistant, appliquer le highlighting pour le code
    if (sender === 'assistant') {
      this.applyCodeHighlighting(messageDiv);
    }
  }

  /**
   * Applique la coloration syntaxique pour les blocs de code
   */
  applyCodeHighlighting(messageElement) {
    // Sélectionner tous les blocs <pre><code> dans le message
    const codeBlocks = messageElement.querySelectorAll('pre code');
    if (codeBlocks.length > 0) {
      codeBlocks.forEach(block => {
        hljs.highlightElement(block);
      });
    }
  }

  /**
   * Formate le contenu du message (Markdown, liens, etc.)
   */
  formatMessageContent(content, sender) {
    // Pour les messages de l'assistant, utiliser marked pour le Markdown
    if (sender === 'assistant') {
      // Configurer les options de marked
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        highlight: function(code, lang) {
          if (lang && hljs.getLanguage(lang)) {
            try {
              return hljs.highlight(code, { language: lang }).value;
            } catch (e) {
              console.error(e);
            }
          }
          return code;
        }
      });
      
      return marked.parse(content);
    }
    
    // Pour les autres types de messages
    let formattedContent = content
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");

    // Convertir les URLs en liens
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    formattedContent = formattedContent.replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );

    return formattedContent;
  }

  /**
   * Ajoute un message d'outil
   */
  addToolMessage(toolName, args, status) {
    const toolDiv = document.createElement("div");
    toolDiv.className = "tool-message";
    toolDiv.dataset.toolName = toolName;

    const statusText =
      {
        preparing: "Préparation",
        executing: "Exécution",
        success: "Terminé",
        error: "Échec",
      }[status] || status;

    const argsText =
      Object.keys(args).length > 0
        ? Object.entries(args)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ")
        : "Aucun paramètre";

    toolDiv.innerHTML = `
      <div class="tool-header">
        <div class="tool-icon">
          <i class="fas fa-cog"></i>
        </div>
        <div class="tool-name">${toolName}</div>
        <div class="tool-status ${status}">${statusText}</div>
      </div>
      <div class="tool-result">
        <strong>Paramètres:</strong> ${argsText}
        <div class="tool-output"></div>
      </div>
    `;

    this.elements.messagesContainer.appendChild(toolDiv);
    this.scrollToBottom();
  }
 
 /**
   * Met à jour le statut d'un outil
   */
  updateToolStatus(toolElement, status, message, result = null) {
    if (!toolElement) return;

    const statusElement = toolElement.querySelector(".tool-status");
    const outputElement = toolElement.querySelector(".tool-output");

    const statusText =
      {
        executing: "Exécution",
        success: "Terminé",
        error: "Échec",
      }[status] || status;

    statusElement.className = `tool-status ${status}`;
    statusElement.textContent = statusText;

    if (result) {
      outputElement.innerHTML = `<br><strong>Résultat:</strong> ${result}`;
    } else if (message) {
      outputElement.innerHTML = `<br><strong>Statut:</strong> ${message}`;
    }

    this.scrollToBottom();
  }

  /**
   * Gère le résultat d'image (capture d'écran)
   */
  handleImageResult(content) {
    // Vérifier si le contenu contient des images
    for (const item of content) {
      if (item.image) {
        // Créer l'élément d'image
        const imageDiv = document.createElement("div");
        imageDiv.className = "message-image";
        
        const imageUrl = `data:image/${item.image.format};base64,${item.image.data}`;
        
        imageDiv.innerHTML = `
          <img src="${imageUrl}" 
               alt="Capture d'écran" 
               style="max-width: 300px; border-radius: 8px; cursor: pointer;">
        `;
        
        // Ajouter à l'interface
        this.elements.messagesContainer.appendChild(imageDiv);
        
        // Ajouter l'événement de clic pour agrandir l'image
        imageDiv.querySelector("img").addEventListener("click", () => {
          this.showImageModal(imageUrl);
        });
        
        // Ajouter à la collection de captures d'écran
        this.state.screenshots.push({
          id: "screenshot_" + Date.now() + "_" + this.state.screenshots.length,
          url: imageUrl,
          timestamp: new Date().toISOString(),
          format: item.image.format
        });
        
        this.scrollToBottom();
        break;
      }
    }
  }

  /**
   * Affiche la modale d'image avec l'image agrandie
   */
  showImageModal(src) {
    this.elements.modalImage.src = src;
    this.elements.imageModalOverlay.classList.add("show");
  }

  /**
   * Télécharge l'image actuellement affichée dans la modale
   */
  downloadCurrentImage() {
    const src = this.elements.modalImage.src;
    const a = document.createElement("a");
    a.href = src;
    a.download = `screenshot_${new Date().toISOString().replace(/:/g, "-")}.${src.includes("image/png") ? "png" : "jpg"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * Télécharge toutes les captures d'écran en ZIP
   */
  downloadAllScreenshots() {
    // Pour simplifier, télécharger une par une
    this.state.screenshots.forEach((screenshot, index) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = screenshot.url;
        a.download = `screenshot_${index + 1}.${screenshot.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 500); // Délai pour éviter les blocages de navigateur
    });
  }

  /**
   * Affiche la galerie de captures d'écran
   */
  showScreenshotGallery() {
    // Remplir la galerie avec les captures d'écran
    this.elements.screenshotGallery.innerHTML = "";
    
    if (this.state.screenshots.length === 0) {
      this.elements.screenshotGallery.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-camera"></i>
          <p>Aucune capture d'écran disponible</p>
        </div>
      `;
    } else {
      this.state.screenshots.forEach((screenshot, index) => {
        const galleryItem = document.createElement("div");
        galleryItem.className = "gallery-item";
        
        galleryItem.innerHTML = `
          <img src="${screenshot.url}" alt="Capture ${index + 1}">
          <div class="gallery-item-overlay">
            ${new Date(screenshot.timestamp).toLocaleString()}
          </div>
        `;
        
        galleryItem.addEventListener("click", () => {
          this.showImageModal(screenshot.url);
        });
        
        this.elements.screenshotGallery.appendChild(galleryItem);
      });
    }
    
    this.elements.galleryModalOverlay.classList.add("show");
  }

  /**
   * Démarre la barre de progression pour une tâche
   */
  startTaskProgress(message) {
    // Réinitialiser les étapes
    this.state.taskSteps = [];
    this.state.currentTaskStep = 0;
    
    // Afficher la barre de progression
    this.elements.taskProgressContainer.classList.add("show");
    this.elements.progressFill.style.width = "5%";
    this.elements.currentStep.textContent = message || "Initialisation...";
  }

  /**
   * Met à jour la progression d'une tâche
   */
  updateTaskProgress(step, message) {
    this.state.currentTaskStep = step;
    
    // Mettre à jour l'interface
    const progress = Math.min((step / 20) * 100, 95);
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.currentStep.textContent = message || `Étape ${step}`;
  }

  /**
   * Complète la progression d'une tâche
   */
  completeTaskProgress(totalSteps) {
    this.elements.progressFill.style.width = "100%";
    this.elements.currentStep.textContent = `Tâche terminée en ${totalSteps} étapes`;
    
    // Masquer la barre de progression après un délai
    setTimeout(() => {
      this.hideTaskProgress();
    }, 3000);
  }

  /**
   * Masque la barre de progression
   */
  hideTaskProgress() {
    this.elements.taskProgressContainer.classList.remove("show");
  }

  /**
   * Ajoute une étape à l'historique des étapes
   */
  addTaskStep(stepNumber, message, toolName) {
    this.state.taskSteps.push({
      number: stepNumber,
      message: message,
      tool: toolName,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Affiche la modale de détail des étapes
   */
  showTaskDetailModal() {
    // Remplir le conteneur avec les étapes
    this.elements.taskStepsContainer.innerHTML = "";
    
    if (this.state.taskSteps.length === 0) {
      this.elements.taskStepsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-tasks"></i>
          <p>Aucune étape disponible</p>
        </div>
      `;
    } else {
      this.state.taskSteps.forEach(step => {
        const stepItem = document.createElement("div");
        stepItem.className = "task-step-item";
        
        stepItem.innerHTML = `
          <div class="step-number">${step.number}</div>
          <div class="step-content">
            <div class="step-title">${step.tool || "Étape"}</div>
            <div class="step-details">${step.message}</div>
            <div class="step-time">${new Date(step.timestamp).toLocaleTimeString()}</div>
          </div>
        `;
        
        this.elements.taskStepsContainer.appendChild(stepItem);
      });
    }
    
    this.elements.taskDetailModalOverlay.classList.add("show");
  }

  /**
   * Affiche la prévisualisation du résultat
   */
  showResultPreview(content) {
    // Créer un élément de prévisualisation
    const previewDiv = document.createElement("div");
    previewDiv.className = "result-preview";
    
    // Déterminer si le contenu est trop long
    const isTooLong = content.length > 1000;
    
    if (isTooLong) {
      previewDiv.classList.add("truncated");
      // Afficher une version tronquée
      const truncatedContent = content.substring(0, 1000) + "...";
      previewDiv.innerHTML = this.formatMessageContent(truncatedContent, 'assistant');
      
      // Ajouter un bouton pour voir plus
      const showMoreBtn = document.createElement("button");
      showMoreBtn.className = "show-more-btn";
      showMoreBtn.textContent = "Voir plus";
      showMoreBtn.addEventListener("click", () => {
        this.showResultModal(content);
      });
      
      this.elements.messagesContainer.appendChild(previewDiv);
      this.elements.messagesContainer.appendChild(showMoreBtn);
    } else {
      previewDiv.innerHTML = this.formatMessageContent(content, 'assistant');
      this.elements.messagesContainer.appendChild(previewDiv);
    }
    
    this.scrollToBottom();
  }

  /**
   * Affiche la modale de résultat complet
   */
  showResultModal(content) {
    this.elements.resultContent.innerHTML = this.formatMessageContent(content, 'assistant');
    this.elements.resultModalOverlay.classList.add("show");
    
    // Appliquer la coloration syntaxique
    this.elements.resultContent.querySelectorAll('pre code').forEach(block => {
      hljs.highlightElement(block);
    });
  }

  /**
   * Télécharge le résultat actuel
   */
  downloadCurrentResult() {
    const content = this.elements.resultContent.innerHTML;
    const plainText = this.elements.resultContent.textContent;
    
    // Créer un fichier HTML
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Résultat MCP Client</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
          code { font-family: monospace; }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-resultat-${new Date().toISOString().split("T")[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Affiche la modale d'édition d'avatar
   */
  showAvatarModal() {
    this.elements.avatarPreview.src = this.state.userAvatar;
    this.elements.avatarModalOverlay.classList.add("show");
  }

  /**
   * Gère le téléversement d'une image d'avatar
   */
  handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image.');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      this.elements.avatarPreview.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Génère un avatar de couleur avec les initiales
   */
  generateAvatarFromColor(color) {
    // Créer un canvas
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    
    // Dessiner le fond
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Dessiner les initiales
    ctx.fillStyle = 'white';
    ctx.font = 'bold 80px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Obtenir les initiales à partir du nom d'utilisateur
    const initials = this.state.username
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    ctx.fillText(initials, canvas.width/2, canvas.height/2);
    
    // Définir l'aperçu
    this.elements.avatarPreview.src = canvas.toDataURL('image/png');
  }

  /**
   * Enregistre les modifications de l'avatar
   */
  saveAvatarChanges() {
    this.state.userAvatar = this.elements.avatarPreview.src;
    this.elements.userAvatar.src = this.state.userAvatar;
    
    // Sauvegarder dans le localStorage
    localStorage.setItem('mcp_user_avatar', this.state.userAvatar);
    
    // Fermer la modale
    this.elements.avatarModalOverlay.classList.remove("show");
  }

  /**
   * Exporte la conversation dans différents formats
   */
  exportChat(format = 'json') {
    switch (format) {
      case 'markdown':
        this.exportAsMarkdown();
        break;
      case 'html':
        this.exportAsHtml();
        break;
      case 'pdf':
        this.exportAsPdf();
        break;
      case 'csv':
        this.exportAsCsv();
        break;
      case 'images':
        this.showScreenshotGallery();
        break;
      default:
        this.exportAsJson();
        break;
    }
  }

  /**
   * Exporte la conversation au format Markdown
   */
  exportAsMarkdown() {
    let markdown = `# Conversation MCP Client - ${new Date().toLocaleDateString()}\n\n`;
    
    this.state.messageHistory.forEach(msg => {
      const sender = msg.sender === 'user' ? 'Vous' : 
                    msg.sender === 'assistant' ? 'Assistant' : 'Système';
                    
      markdown += `## ${sender} - ${new Date(msg.timestamp).toLocaleString()}\n\n`;
      markdown += `${msg.content}\n\n`;
    });
    
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-conversation-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Exporte la conversation au format HTML
   */
  exportAsHtml() {
    let content = '';
    
    this.state.messageHistory.forEach(msg => {
      const sender = msg.sender === 'user' ? 'Vous' : 
                    msg.sender === 'assistant' ? 'Assistant' : 'Système';
      
      const formattedContent = this.formatMessageContent(msg.content, msg.sender);
      
      content += `
        <div class="message ${msg.sender}-message">
          <h3>${sender} - ${new Date(msg.timestamp).toLocaleString()}</h3>
          <div class="message-content">${formattedContent}</div>
        </div>
      `;
    });
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Conversation MCP Client</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; margin: 20px; }
          .message { margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
          .user-message h3 { color: #4f46e5; }
          .assistant-message h3 { color: #10b981; }
          .system-message h3 { color: #64748b; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; }
          code { font-family: monospace; }
        </style>
      </head>
      <body>
        <h1>Conversation MCP Client - ${new Date().toLocaleDateString()}</h1>
        ${content}
      </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-conversation-${new Date().toISOString().split("T")[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Exporte la conversation au format PDF
   */
  exportAsPdf() {
    // Utiliser html2canvas et jsPDF pour générer un PDF
    const messageElements = Array.from(this.elements.messagesContainer.querySelectorAll('.message'));
    if (messageElements.length === 0) return;
    
    // Créer un conteneur temporaire
    const container = document.createElement('div');
    container.style.width = '700px';
    container.style.position = 'absolute';
    container.style.top = '-9999px';
    container.style.padding = '20px';
    container.style.backgroundColor = 'white';
    document.body.appendChild(container);
    
    // Ajouter un titre
    const title = document.createElement('h1');
    title.textContent = `Conversation MCP Client - ${new Date().toLocaleDateString()}`;
    title.style.marginBottom = '20px';
    container.appendChild(title);
    
    // Cloner les messages
    messageElements.forEach(el => {
      const clone = el.cloneNode(true);
      clone.style.marginBottom = '20px';
      clone.style.paddingBottom = '20px';
      clone.style.borderBottom = '1px solid #eee';
      container.appendChild(clone);
    });
    
    // Créer le PDF
    html2canvas(container, { scale: 1 }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', imgX, position, imgWidth * ratio, imgHeight * ratio);
      heightLeft -= pdfHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', imgX, position, imgWidth * ratio, imgHeight * ratio);
        heightLeft -= pdfHeight;
      }
      
      pdf.save(`mcp-conversation-${new Date().toISOString().split("T")[0]}.pdf`);
      
      // Nettoyer
      document.body.removeChild(container);
    });
  }

  /**
   * Exporte la conversation au format CSV
   */
  exportAsCsv() {
    let csv = 'Émetteur,Horodatage,Message\n';
    
    this.state.messageHistory.forEach(msg => {
      // Échapper les guillemets et préparer pour CSV
      const content = msg.content.replace(/"/g, '""');
      csv += `"${msg.sender}","${msg.timestamp}","${content}"\n`;
    });
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-conversation-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Exporte la conversation au format JSON
   */
  exportAsJson() {
    const data = {
      sessionId: this.state.sessionId,
      timestamp: new Date().toISOString(),
      messages: this.state.messageHistory,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcp-conversation-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Change le mode de l'interface (chat/task)
   */
  switchMode(mode) {
    this.state.currentMode = mode;

    // Mettre à jour l'interface
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    // Mettre à jour le titre et le placeholder
    if (mode === "task") {
      this.elements.chatTitle.textContent = "Assistant d'automatisation";
      this.elements.messageInput.placeholder =
        "Décrivez une tâche complexe à automatiser...";
    } else {
      this.elements.chatTitle.textContent = "Assistant Web Intelligent";
      this.elements.messageInput.placeholder =
        "Écrivez un message ou posez une question...";
    }
  }

  /**
   * Gère les actions rapides
   */
  handleQuickAction(action) {
    const actions = {
      screenshot: "Prendre une capture d'écran de la page actuelle",
      navigate: "Naviguer vers https://example.com",
      research: "Rechercher les dernières tendances en intelligence artificielle",
      analyze: "Analyser le contenu de la page actuelle et fournir des insights",
    };

    if (actions[action]) {
      this.elements.messageInput.value = actions[action];
      this.autoResizeTextarea();
    }
  }

  /**
   * Redimensionne automatiquement le textarea
   */
  autoResizeTextarea() {
    const textarea = this.elements.messageInput;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  /**
   * Vide le conteneur de messages
   */
  clearMessagesContainer() {
    this.elements.messagesContainer.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">
          <i class="fas fa-robot"></i>
        </div>
        <h2>Bienvenue sur MCP Client Avancé</h2>
        <p>Votre compagnon intelligent pour l'automatisation web et la recherche. Choisissez un mode et commencez votre conversation.</p>
        <div class="welcome-features">
          <div class="feature">
            <i class="fas fa-globe"></i>
            <span>Navigation Web</span>
          </div>
          <div class="feature">
            <i class="fas fa-search"></i>
            <span>Recherche & Analyse</span>
          </div>
          <div class="feature">
            <i class="fas fa-cogs"></i>
            <span>Automatisation</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Efface la conversation actuelle
   */
  clearChat() {
    this.clearMessagesContainer();
    this.state.messageHistory = [];
    this.state.screenshots = [];
    this.state.taskSteps = [];
    
    // Réinitialiser les statistiques d'API
    this.state.apiUsage.count = 0;
    this.updateApiUsageDisplay();
    
    // Sauvegarder la conversation vide
    this.saveCurrentConversation();
  }

  /**
   * Affiche l'indicateur de frappe
   */
  showTypingIndicator(message = "L'assistant réfléchit...") {
    this.elements.typingIndicator.querySelector("span:last-child").textContent =
      message;
    this.elements.typingIndicator.classList.add("show");
  }

  /**
   * Masque l'indicateur de frappe
   */
  hideTypingIndicator() {
    this.elements.typingIndicator.classList.remove("show");
  }

  /**
   * Fait défiler le conteneur de messages vers le bas
   */
  scrollToBottom() {
    setTimeout(() => {
      this.elements.messagesContainer.scrollTop =
        this.elements.messagesContainer.scrollHeight;
    }, 100);
  }

  /**
   * Rend tous les messages de l'historique
   */
  renderMessages() {
    this.clearMessagesContainer();
    
    this.state.messageHistory.forEach(msg => {
      this.addMessage(msg.sender, msg.content, msg.type);
    });
  }

  /**
   * Incrémente le compteur d'utilisation de l'API
   */
  incrementApiUsage() {
    this.state.apiUsage.count += 1;
    this.updateApiUsageDisplay();
  }

  /**
   * Met à jour l'affichage des statistiques d'utilisation de l'API
   */
  updateApiUsageDisplay() {
    this.elements.usageCount.textContent = this.state.apiUsage.count;
    this.elements.usageLimit.textContent = this.state.apiUsage.limit;
    
    const percentage = Math.min(
      (this.state.apiUsage.count / this.state.apiUsage.limit) * 100,
      100
    );
    this.elements.usageProgressFill.style.width = `${percentage}%`;
    
    // Changer la couleur en fonction du pourcentage
    if (percentage > 80) {
      this.elements.usageProgressFill.style.background = 
        "linear-gradient(90deg, var(--error-color), #ff6b6b)";
    } else if (percentage > 50) {
      this.elements.usageProgressFill.style.background = 
        "linear-gradient(90deg, var(--warning-color), #ffc078)";
    } else {
      this.elements.usageProgressFill.style.background = 
        "linear-gradient(90deg, var(--primary-color), var(--primary-hover))";
    }
  }
}

// Initialiser l'interface quand la page est chargée
document.addEventListener("DOMContentLoaded", () => {
  window.mcpClient = new MCPClient();
});
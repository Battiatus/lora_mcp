class MCPAssistant {
    constructor() {
        this.websocket = null;
        this.sessionId = null;
        this.currentConversationId = null;
        this.isConnected = false;
        this.isTaskRunning = false;
        this.currentUser = null;
        this.authToken = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthentication();
        this.setupMarkdownRenderer();
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Sidebar toggle
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // New chat button
        document.getElementById('newChatBtn').addEventListener('click', () => {
            this.createNewConversation();
        });

        // Send message
        document.getElementById('sendBtn').addEventListener('click', () => {
            if (this.isTaskRunning) {
                this.stopExecution();
            } else {
                this.sendMessage();
            }
        });

        // Message input
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.isTaskRunning) {
                    this.stopExecution();
                } else {
                    this.sendMessage();
                }
            }
        });

        // Auto-resize textarea
        messageInput.addEventListener('input', () => {
            this.autoResizeTextarea(messageInput);
        });

        // Mode selector
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMode(btn.dataset.mode);
            });
        });

        // Quick actions
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.executeQuickAction(btn.dataset.action);
            });
        });

        // Examples
        document.querySelectorAll('.example-item').forEach(item => {
            item.addEventListener('click', () => {
                this.useExample(item.dataset.example);
            });
        });

        // User menu
        document.getElementById('userAvatar').addEventListener('click', () => {
            this.toggleUserMenu();
        });

        // Change avatar
        document.getElementById('changeAvatar').addEventListener('click', () => {
            this.changeAvatar();
        });

        // Export data
        document.getElementById('exportData').addEventListener('click', () => {
            this.showExportModal();
        });

        // Progress details
        document.getElementById('progressDetailsBtn').addEventListener('click', () => {
            this.showProgressDetails();
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal(btn.closest('.modal').id);
            });
        });

        // Export buttons
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.exportConversation(btn.dataset.format);
            });
        });

        // Click outside to close modals and dropdowns
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu')) {
                this.closeUserMenu();
            }
            if (e.target.classList.contains('modal-overlay')) {
                this.closeAllModals();
            }
        });

        // Avatar file input
        document.getElementById('avatarInput').addEventListener('change', (e) => {
            this.handleAvatarChange(e);
        });
    }

    async checkAuthentication() {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            this.showLogin();
            return;
        }

        try {
            const response = await fetch('/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const user = await response.json();
                this.currentUser = user;
                this.authToken = token;
                this.showApp();
                this.loadConversations();
                this.loadApiLimits();
                this.connectWebSocket();
            } else {
                localStorage.removeItem('auth_token');
                this.showLogin();
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            this.showLogin();
        }
    }

    async handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('auth_token', data.access_token);
                this.currentUser = data.user;
                this.authToken = data.access_token;
                this.showApp();
                this.loadConversations();
                this.loadApiLimits();
                this.connectWebSocket();
            } else {
                const error = await response.json();
                errorDiv.textContent = error.detail || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorDiv.textContent = 'Connection error. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    logout() {
        localStorage.removeItem('auth_token');
        this.currentUser = null;
        this.authToken = null;
        if (this.websocket) {
            this.websocket.close();
        }
        this.showLogin();
    }

    showLogin() {
        document.getElementById('loginContainer').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }

    showApp() {
        document.getElementById('loginContainer').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        
        // Update user info
        if (this.currentUser) {
            document.getElementById('username').textContent = this.currentUser.username;
            document.getElementById('avatarImg').src = this.currentUser.avatar;
            document.getElementById('dropdownAvatar').src = this.currentUser.avatar;
        }
    }

    connectWebSocket() {
        this.sessionId = this.generateSessionId();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;

        this.websocket = new WebSocket(wsUrl);

        this.websocket.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus('Connected', 'connected');
        };

        this.websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };

        this.websocket.onclose = () => {
            this.isConnected = false;
            this.updateConnectionStatus('Disconnected', 'disconnected');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectWebSocket();
                }
            }, 3000);
        };

        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('Error', 'error');
        };
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'progress_update':
                this.updateProgress(message);
                break;
            case 'progress_complete':
                this.hideProgress();
                this.setTaskRunning(false);
                break;
            case 'assistant_message':
                this.addMessage('assistant', message.message, message);
                if (message.final) {
                    this.setTaskRunning(false);
                }
                break;
            case 'user_message':
                this.addMessage('user', message.message, message);
                break;
            case 'tool_executing':
                this.showToolExecution(message);
                break;
            case 'tool_success':
            case 'tool_success_image':
                this.showToolResult(message);
                break;
            case 'tool_error':
                this.showToolError(message);
                break;
            case 'task_started':
                this.setTaskRunning(true);
                this.showProgress('Starting task...', 0);
                break;
            case 'task_completed':
                this.hideProgress();
                this.setTaskRunning(false);
                if (message.final) {
                    this.addMessage('assistant', message.message, message);
                }
                break;
            case 'screenshots_summary':
                this.showScreenshotsSummary(message.screenshots);
                break;
            case 'execution_stopped':
                this.hideProgress();
                this.setTaskRunning(false);
                this.addMessage('system', message.message, message);
                break;
            case 'error':
                this.showError(message.message);
                this.setTaskRunning(false);
                break;
        }
    }

    async loadConversations() {
        try {
            const response = await fetch('/conversations', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.renderConversations(data.conversations);
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }

    async loadApiLimits() {
        try {
            const response = await fetch('/api/limits', {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                document.getElementById('remainingCalls').textContent = `${data.remaining_calls} calls remaining`;
            }
        } catch (error) {
            console.error('Failed to load API limits:', error);
        }
    }

    renderConversations(conversations) {
        const container = document.getElementById('conversationsList');
        container.innerHTML = '';

        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.dataset.conversationId = conv.id;
            
            item.innerHTML = `
                <div class="conversation-title">${conv.title}</div>
                <div class="conversation-date">${new Date(conv.updated_at).toLocaleDateString()}</div>
            `;

            item.addEventListener('click', () => {
                this.loadConversation(conv.id);
            });

            container.appendChild(item);
        });
    }

    async createNewConversation() {
        try {
            const response = await fetch('/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: JSON.stringify({
                    title: `New Conversation ${new Date().toLocaleDateString()}`
                })
            });

            if (response.ok) {
                const conversation = await response.json();
                this.currentConversationId = conversation.id;
                this.clearMessages();
                this.loadConversations();
                this.updateChatTitle(conversation.title);
            }
        } catch (error) {
            console.error('Failed to create conversation:', error);
        }
    }

    async loadConversation(conversationId) {
        try {
            const response = await fetch(`/conversations/${conversationId}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const conversation = await response.json();
                this.currentConversationId = conversationId;
                this.clearMessages();
                this.updateChatTitle(conversation.title);
                
                // Load messages
                conversation.messages.forEach(msg => {
                    this.addMessage(msg.role, msg.content, { conversation_id: conversationId });
                });

                // Update active conversation
                document.querySelectorAll('.conversation-item').forEach(item => {
                    item.classList.remove('active');
                });
                document.querySelector(`[data-conversation-id="${conversationId}"]`)?.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to load conversation:', error);
        }
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();

        if (!message || !this.isConnected) return;

        // Add user message to UI
        this.addMessage('user', message);
        input.value = '';
        this.autoResizeTextarea(input);

        // Send to WebSocket
        const messageData = {
            type: this.getCurrentMode() === 'task' ? 'task' : 'chat',
            message: message,
            conversation_id: this.currentConversationId
        };

        this.websocket.send(JSON.stringify(messageData));
        this.setTaskRunning(true);
        this.showProgress('Processing your request...', 10);
    }

    stopExecution() {
        if (this.websocket && this.isTaskRunning) {
            this.websocket.send(JSON.stringify({
                type: 'stop_execution'
            }));
        }
    }

    setTaskRunning(isRunning) {
        this.isTaskRunning = isRunning;
        const sendBtn = document.getElementById('sendBtn');
        
        if (isRunning) {
            sendBtn.classList.add('stop');
            sendBtn.innerHTML = '<i class="fas fa-stop"></i>';
            sendBtn.title = 'Stop execution';
        } else {
            sendBtn.classList.remove('stop');
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
            sendBtn.title = 'Send message';
        }
    }

    addMessage(role, content, metadata = {}) {
        const container = document.getElementById('messagesContainer');
        const welcomeMessage = document.getElementById('welcomeMessage');
        
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        const avatarIcon = role === 'user' ? 'U' : 
                          role === 'assistant' ? 'A' : 'S';
        
        const timestamp = new Date().toLocaleTimeString();
        
        // Process content based on type
        let processedContent = content;
        if (typeof content === 'string') {
            processedContent = this.renderMarkdown(content);
        }

        messageDiv.innerHTML = `
            <div class="message-header">
                <div class="message-avatar">${avatarIcon}</div>
                <div class="message-info">
                    <div class="message-sender">${role.charAt(0).toUpperCase() + role.slice(1)}</div>
                    <div class="message-time">${timestamp}</div>
                </div>
            </div>
            <div class="message-content">
                ${this.createResultPreview(processedContent)}
                ${this.createMessageActions(role, content, metadata)}
            </div>
        `;

        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    }

    createResultPreview(content) {
        const maxLength = 1000;
        if (content.length > maxLength) {
            return `
                <div class="result-preview truncated">
                    ${content.substring(0, maxLength)}...
                </div>
                <button class="show-more-btn" onclick="mcpAssistant.showFullResult('${btoa(content)}')">
                    <i class="fas fa-expand-alt"></i> Show Full Result
                </button>
            `;
        }
        return content;
    }

    createMessageActions(role, content, metadata) {
        if (role === 'assistant') {
            return `
                <div class="message-actions">
                    <button class="message-action" onclick="mcpAssistant.copyToClipboard('${btoa(content)}')">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="message-action" onclick="mcpAssistant.downloadContent('${btoa(content)}', 'result.md')">
                        <i class="fas fa-download"></i> Download
                    </button>
                </div>
            `;
        }
        return '';
    }

    showFullResult(encodedContent) {
        const content = atob(encodedContent);
        const modal = document.getElementById('resultModal');
        const contentDiv = document.getElementById('resultContent');
        
        contentDiv.innerHTML = this.renderMarkdown(content);
        this.showModal('resultModal');
        
        // Setup download button
        document.getElementById('downloadResult').onclick = () => {
            this.downloadContent(encodedContent, 'full_result.md');
        };
    }

    copyToClipboard(encodedContent) {
        const content = atob(encodedContent);
        navigator.clipboard.writeText(content).then(() => {
            this.showNotification('Content copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.showNotification('Failed to copy content', 'error');
        });
    }

    downloadContent(encodedContent, filename) {
        const content = atob(encodedContent);
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    showProgress(message, progress) {
        const container = document.getElementById('progressContainer');
        const fill = document.getElementById('progressFill');
        const messageSpan = document.getElementById('progressMessage');
        
        container.style.display = 'block';
        fill.style.width = `${progress}%`;
        messageSpan.textContent = message;
    }

    updateProgress(data) {
        this.showProgress(data.message, data.progress || 0);
    }

    hideProgress() {
        document.getElementById('progressContainer').style.display = 'none';
    }

    showToolExecution(data) {
        const container = document.getElementById('messagesContainer');
        const toolDiv = document.createElement('div');
        toolDiv.className = 'tool-indicator executing';
        toolDiv.innerHTML = `
            <i class="fas fa-cog"></i>
            <span>Executing ${data.tool_name}...</span>
        `;
        container.appendChild(toolDiv);
        container.scrollTop = container.scrollHeight;
    }

    showToolResult(data) {
        const indicators = document.querySelectorAll('.tool-indicator.executing');
        const lastIndicator = indicators[indicators.length - 1];
        
        if (lastIndicator) {
            lastIndicator.className = 'tool-indicator success';
            lastIndicator.innerHTML = `
                <i class="fas fa-check"></i>
                <span>${data.message}</span>
            `;
        }
    }

    showToolError(data) {
        const indicators = document.querySelectorAll('.tool-indicator.executing');
        const lastIndicator = indicators[indicators.length - 1];
        
        if (lastIndicator) {
            lastIndicator.className = 'tool-indicator error';
            lastIndicator.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <span>${data.message}</span>
            `;
        }
    }

    showScreenshotsSummary(screenshots) {
        if (screenshots.length === 0) return;

        const container = document.getElementById('messagesContainer');
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'screenshots-summary';
        
        summaryDiv.innerHTML = `
            <h4><i class="fas fa-images"></i> Screenshots Captured (${screenshots.length})</h4>
            <div class="screenshots-grid">
                ${screenshots.map(screenshot => `
                    <div class="screenshot-thumb" onclick="mcpAssistant.showScreenshot('${screenshot.path}')">
                        <img src="${screenshot.path}" alt="${screenshot.filename}" loading="lazy">
                    </div>
                `).join('')}
            </div>
            <button class="btn-secondary" onclick="mcpAssistant.showScreenshotsGallery(${JSON.stringify(screenshots).replace(/"/g, '&quot;')})">
                <i class="fas fa-expand"></i> View All Screenshots
            </button>
        `;

        container.appendChild(summaryDiv);
        container.scrollTop = container.scrollHeight;
    }

    showScreenshot(path) {
        const modal = document.getElementById('imageModal');
        const img = document.getElementById('modalImage');
        img.src = path;
        this.showModal('imageModal');
    }

    showScreenshotsGallery(screenshots) {
        const modal = document.getElementById('screenshotsModal');
        const gallery = document.getElementById('screenshotsGallery');
        
        gallery.innerHTML = screenshots.map(screenshot => `
            <div class="screenshot-item">
                <img src="${screenshot.path}" alt="${screenshot.filename}" onclick="mcpAssistant.showScreenshot('${screenshot.path}')">
                <div class="screenshot-info">
                    <div class="screenshot-name">${screenshot.filename}</div>
                    <div class="screenshot-date">${new Date(screenshot.created_at).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
        
        this.showModal('screenshotsModal');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        
        // On mobile, use show/hide instead of collapsed
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('show');
        }
    }

    toggleUserMenu() {
        const dropdown = document.getElementById('userDropdown');
        dropdown.classList.toggle('show');
    }

    closeUserMenu() {
        document.getElementById('userDropdown').classList.remove('show');
    }

    changeAvatar() {
        document.getElementById('avatarInput').click();
        this.closeUserMenu();
    }

    handleAvatarChange(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const newAvatarUrl = e.target.result;
                document.getElementById('avatarImg').src = newAvatarUrl;
                document.getElementById('dropdownAvatar').src = newAvatarUrl;
                
                // In a real app, you would upload this to the server
                this.showNotification('Avatar updated successfully!', 'success');
            };
            reader.readAsDataURL(file);
        }
    }

    setMode(mode) {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
        
        // Update placeholder text
        const input = document.getElementById('messageInput');
        if (mode === 'task') {
            input.placeholder = 'Describe a task to automate...';
        } else {
            input.placeholder = 'Type your message...';
        }
    }

    getCurrentMode() {
        const activeBtn = document.querySelector('.mode-btn.active');
        return activeBtn ? activeBtn.dataset.mode : 'chat';
    }

    executeQuickAction(action) {
        const actions = {
            screenshot: 'Take a screenshot of the current page',
            navigate: 'Navigate to a website and analyze its content',
            research: 'Research a topic and provide a comprehensive analysis',
            analyze: 'Analyze the current page content and provide insights'
        };
        
        const message = actions[action];
        if (message) {
            document.getElementById('messageInput').value = message;
            this.sendMessage();
        }
    }

    useExample(example) {
        document.getElementById('messageInput').value = example;
        document.getElementById('messageInput').focus();
    }

    showExportModal() {
        this.showModal('exportModal');
        this.closeUserMenu();
    }

    async exportConversation(format) {
        if (!this.currentConversationId) {
            this.showNotification('No conversation selected', 'error');
            return;
        }

        try {
            const response = await fetch(`/conversations/${this.currentConversationId}/export/${format}`, {
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.downloadContent(btoa(data.content), data.filename);
                this.closeModal('exportModal');
                this.showNotification('Export completed successfully!', 'success');
            } else {
                this.showNotification('Export failed', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showNotification('Export failed', 'error');
        }
    }

    showProgressDetails() {
        this.showModal('progressModal');
        // Populate with current progress details
        document.getElementById('progressDetails').innerHTML = `
            <div class="progress-step">
                <i class="fas fa-check-circle"></i>
                <span>Connection established</span>
            </div>
            <div class="progress-step active">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Processing request...</span>
            </div>
            <div class="progress-step">
                <i class="fas fa-circle"></i>
                <span>Generating response</span>
            </div>
        `;
    }

    showModal(modalId) {
        document.getElementById('modalOverlay').classList.add('show');
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = modal.id === modalId ? 'flex' : 'none';
        });
    }

    closeModal(modalId) {
        if (modalId) {
            document.getElementById(modalId).style.display = 'none';
        }
        document.getElementById('modalOverlay').classList.remove('show');
    }

    closeAllModals() {
        document.getElementById('modalOverlay').classList.remove('show');
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    clearMessages() {
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '<div class="welcome-message" id="welcomeMessage" style="display: block;">...</div>';
    }

    updateChatTitle(title) {
        document.getElementById('chatTitle').textContent = title;
    }

    updateConnectionStatus(status, type) {
        const statusElement = document.getElementById('connectionStatus');
        const dot = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('span');
        
        text.textContent = status;
        dot.className = `status-dot ${type}`;
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    setupMarkdownRenderer() {
        // Configure marked for better markdown rendering
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false
            });
        }
    }

    renderMarkdown(content) {
        if (typeof marked !== 'undefined') {
            return marked.parse(content);
        }
        
        // Fallback basic markdown rendering
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9);
    }
}

// Initialize the application
const mcpAssistant = new MCPAssistant();

// Add notification styles
const notificationStyles = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 3000;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideInRight 0.3s ease-out;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    
    .notification.success {
        background: var(--success-color);
    }
    
    .notification.error {
        background: var(--error-color);
    }
    
    .notification.info {
        background: var(--primary-color);
    }
    
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .progress-step {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        color: var(--text-secondary);
    }
    
    .progress-step.active {
        color: var(--primary-color);
        font-weight: 500;
    }
    
    .progress-step i {
        width: 16px;
        text-align: center;
    }
    
    .screenshot-item {
        margin-bottom: 16px;
        border: 1px solid var(--border);
        border-radius: var(--border-radius);
        overflow: hidden;
    }
    
    .screenshot-item img {
        width: 100%;
        height: auto;
        cursor: pointer;
        transition: var(--transition);
    }
    
    .screenshot-item img:hover {
        transform: scale(1.02);
    }
    
    .screenshot-info {
        padding: 12px;
        background: var(--surface-hover);
    }
    
    .screenshot-name {
        font-weight: 500;
        margin-bottom: 4px;
    }
    
    .screenshot-date {
        font-size: 12px;
        color: var(--text-muted);
    }
`;

// Inject notification styles
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);
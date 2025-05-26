class MCPInterface {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.websocket = null;
        this.currentMode = 'chat';
        this.isConnected = false;
        this.messageHistory = [];
        
        this.initializeElements();
        this.setupEventListeners();
        this.connectWebSocket();
    }
    
    generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }
    
    initializeElements() {
        this.elements = {
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            messagesContainer: document.getElementById('messagesContainer'),
            connectionStatus: document.getElementById('connectionStatus'),
            typingIndicator: document.getElementById('typingIndicator'),
            chatTitle: document.getElementById('chatTitle'),
            clearChat: document.getElementById('clearChat'),
            exportChat: document.getElementById('exportChat'),
            modalOverlay: document.getElementById('modalOverlay'),
            modalImage: document.getElementById('modalImage'),
            closeModal: document.getElementById('closeModal')
        };
    }
    
    setupEventListeners() {
        // Send message
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Enter key handling
        this.elements.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.elements.messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });
        
        // Mode selector
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });
        
        // Quick actions
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleQuickAction(btn.dataset.action));
        });
        
        // Example commands
        document.querySelectorAll('.example-item').forEach(item => {
            item.addEventListener('click', () => {
                this.elements.messageInput.value = item.dataset.example;
                this.autoResizeTextarea();
            });
        });
        
        // Chat controls
        this.elements.clearChat.addEventListener('click', () => this.clearChat());
        this.elements.exportChat.addEventListener('click', () => this.exportChat());
        
        // Modal
        this.elements.closeModal.addEventListener('click', () => this.closeModal());
        this.elements.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.elements.modalOverlay) this.closeModal();
        });
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}`;
        
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus('Connected', true);
        };
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
        
        this.websocket.onclose = () => {
            this.isConnected = false;
            this.updateConnectionStatus('Disconnected', false);
            this.hideTypingIndicator();
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectWebSocket();
                }
            }, 3000);
        };
        
        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('Connection Error', false);
        };
    }
    
    updateConnectionStatus(message, connected) {
        const statusElement = this.elements.connectionStatus;
        const dot = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('span');
        
        text.textContent = message;
        dot.className = `status-dot ${connected ? 'connected' : ''}`;
    }
    
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'typing':
                this.showTypingIndicator(data.message);
                break;
                
            case 'assistant_message':
                this.hideTypingIndicator();
                this.addMessage('assistant', data.message);
                break;
                
            case 'assistant_tool_call':
                this.hideTypingIndicator();
                this.addMessage('assistant', data.message);
                this.addToolMessage(data.tool_name, data.tool_args, 'preparing');
                break;
                
            case 'tool_executing':
                this.updateToolStatus(data.tool_name, 'executing', data.message);
                break;
                
            case 'tool_success':
                this.updateToolStatus(data.tool_name, 'success', data.message, data.result);
                break;
                
            case 'tool_success_image':
                this.updateToolStatus(data.tool_name, 'success', data.message);
                this.handleImageResult(data.content);
                break;
                
            case 'tool_error':
                this.updateToolStatus(data.tool_name, 'error', data.message);
                break;
                
            case 'task_started':
                this.hideTypingIndicator();
                this.addTaskProgress(data.message);
                break;
                
            case 'task_step':
                this.updateTaskProgress(data.step, data.message);
                this.addToolMessage(data.tool_name, data.tool_args, 'executing');
                break;
                
            case 'task_completed':
                this.completeTaskProgress(data.steps);
                this.addMessage('assistant', data.message);
                break;
                
            case 'system_message':
                this.addMessage('system', data.message);
                break;
                
            case 'error':
                this.hideTypingIndicator();
                this.addMessage('system', `❌ Error: ${data.message}`, 'error');
                break;
        }
    }
    
    sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message || !this.isConnected) return;
        
        // Add user message to UI
        this.addMessage('user', message);
        
        // Clear input
        this.elements.messageInput.value = '';
        this.autoResizeTextarea();
        
        // Send via WebSocket
        const messageData = {
            type: this.currentMode,
            [this.currentMode === 'task' ? 'task' : 'message']: message
        };
        
        this.websocket.send(JSON.stringify(messageData));
        
        // Show typing indicator
        this.showTypingIndicator('Assistant is thinking...');
    }
    
    addMessage(sender, content, type = 'normal') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const avatarIcon = {
            'user': 'fas fa-user',
            'assistant': 'fas fa-robot',
            'system': 'fas fa-cog'
        }[sender] || 'fas fa-circle';
        
        const senderName = {
            'user': 'You',
            'assistant': 'Assistant',
            'system': 'System'
        }[sender] || sender;
        
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
            <div class="message-content">
                ${this.formatMessageContent(content)}
            </div>
        `;
        
        // Remove welcome message if it exists
        const welcomeMessage = this.elements.messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        this.elements.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
        
        // Store in history
        this.messageHistory.push({
            sender,
            content,
            timestamp: new Date().toISOString(),
            type
        });
    }
    
    formatMessageContent(content) {
        // Convert markdown-like formatting
        content = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        
        // Convert URLs to links
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        content = content.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        
        return content;
    }
    
    addToolMessage(toolName, args, status) {
        const toolDiv = document.createElement('div');
        toolDiv.className = 'tool-message';
        toolDiv.dataset.toolName = toolName;
        
        const statusText = {
            'preparing': 'Preparing',
            'executing': 'Executing',
            'success': 'Completed',
            'error': 'Failed'
        }[status] || status;
        
        const argsText = Object.keys(args).length > 0 
            ? Object.entries(args).map(([key, value]) => `${key}: ${value}`).join(', ')
            : 'No parameters';
        
        toolDiv.innerHTML = `
            <div class="tool-header">
                <div class="tool-icon">
                    <i class="fas fa-cog"></i>
                </div>
                <div class="tool-name">${toolName}</div>
                <div class="tool-status ${status}">${statusText}</div>
            </div>
            <div class="tool-result">
                <strong>Parameters:</strong> ${argsText}
                <div class="tool-output"></div>
            </div>
        `;
        
        this.elements.messagesContainer.appendChild(toolDiv);
        this.scrollToBottom();
    }
    
    updateToolStatus(toolName, status, message, result = null) {
        const toolElement = this.elements.messagesContainer.querySelector(`[data-tool-name="${toolName}"]`);
        if (!toolElement) return;
        
        const statusElement = toolElement.querySelector('.tool-status');
        const outputElement = toolElement.querySelector('.tool-output');
        
        const statusText = {
            'executing': 'Executing',
            'success': 'Completed',
            'error': 'Failed'
        }[status] || status;
        
        statusElement.className = `tool-status ${status}`;
        statusElement.textContent = statusText;
        
        if (result) {
            outputElement.innerHTML = `<br><strong>Result:</strong> ${result}`;
        } else if (message) {
            outputElement.innerHTML = `<br><strong>Status:</strong> ${message}`;
        }
        
        this.scrollToBottom();
    }
    
    addTaskProgress(message) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'task-progress';
        progressDiv.id = 'currentTaskProgress';
        
        progressDiv.innerHTML = `
            <div class="progress-header">
                <div class="progress-title">Task Execution</div>
                <div class="progress-steps">Step <span class="current-step-num">0</span> of <span class="total-steps">?</span></div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="current-step">${message}</div>
        `;
        
        this.elements.messagesContainer.appendChild(progressDiv);
        this.scrollToBottom();
    }
    
    updateTaskProgress(step, message) {
        const progressElement = document.getElementById('currentTaskProgress');
        if (!progressElement) return;
        
        const currentStepNum = progressElement.querySelector('.current-step-num');
        const currentStepText = progressElement.querySelector('.current-step');
        const progressFill = progressElement.querySelector('.progress-fill');
        
        currentStepNum.textContent = step;
        currentStepText.textContent = message;
        
        // Estimate progress (assuming max 20 steps)
        const progress = Math.min((step / 20) * 100, 95);
        progressFill.style.width = `${progress}%`;
        
        this.scrollToBottom();
    }
    
    completeTaskProgress(totalSteps) {
        const progressElement = document.getElementById('currentTaskProgress');
        if (!progressElement) return;
        
        const totalStepsElement = progressElement.querySelector('.total-steps');
        const progressFill = progressElement.querySelector('.progress-fill');
        const currentStepText = progressElement.querySelector('.current-step');
        
        totalStepsElement.textContent = totalSteps;
        progressFill.style.width = '100%';
        currentStepText.textContent = `Task completed in ${totalSteps} steps`;
        
        this.scrollToBottom();
    }
    
    handleImageResult(content) {
        // Find image data in content
        for (const item of content) {
            if (item.image) {
                const imageDiv = document.createElement('div');
                imageDiv.className = 'message-image';
                imageDiv.innerHTML = `
                    <img src="data:image/${item.image.format};base64,${item.image.data}" 
                         alt="Screenshot" 
                         style="max-width: 300px; border-radius: 8px; cursor: pointer;"
                         onclick="mcpInterface.showImageModal(this.src)">
                `;
                
                this.elements.messagesContainer.appendChild(imageDiv);
                this.scrollToBottom();
                break;
            }
        }
    }
    
    showImageModal(src) {
        this.elements.modalImage.src = src;
        this.elements.modalOverlay.classList.add('show');
    }
    
    closeModal() {
        this.elements.modalOverlay.classList.remove('show');
    }
    
    showTypingIndicator(message = 'Assistant is thinking...') {
        this.elements.typingIndicator.querySelector('span:last-child').textContent = message;
        this.elements.typingIndicator.classList.add('show');
    }
    
    hideTypingIndicator() {
        this.elements.typingIndicator.classList.remove('show');
    }
    
    switchMode(mode) {
        this.currentMode = mode;
        
        // Update UI
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        // Update title and placeholder
        if (mode === 'task') {
            this.elements.chatTitle.textContent = 'Task Automation Assistant';
            this.elements.messageInput.placeholder = 'Describe a complex task to automate...';
        } else {
            this.elements.chatTitle.textContent = 'Intelligent Web Assistant';
            this.elements.messageInput.placeholder = 'Type your message or ask a question...';
        }
    }
    
    handleQuickAction(action) {
        const actions = {
            'screenshot': 'Take a screenshot of the current page',
            'navigate': 'Navigate to https://example.com',
            'research': 'Research the latest trends in artificial intelligence',
            'analyze': 'Analyze the current page content and provide insights'
        };
        
        if (actions[action]) {
            this.elements.messageInput.value = actions[action];
            this.autoResizeTextarea();
        }
    }
    
    autoResizeTextarea() {
        const textarea = this.elements.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
    
    clearChat() {
        this.elements.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h2>Welcome to MCP Advanced Assistant</h2>
                <p>Your intelligent web automation and research companion. Choose a mode and start your conversation.</p>
                <div class="welcome-features">
                    <div class="feature">
                        <i class="fas fa-globe"></i>
                        <span>Web Navigation</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-search"></i>
                        <span>Research & Analysis</span>
                    </div>
                    <div class="feature">
                        <i class="fas fa-cogs"></i>
                        <span>Task Automation</span>
                    </div>
                </div>
            </div>
        `;
        this.messageHistory = [];
    }
    
    exportChat() {
        const chatData = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            messages: this.messageHistory
        };
        
        const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcp-chat-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesContainer.scrollTop = this.elements.messagesContainer.scrollHeight;
        }, 100);
    }
}

// Initialize the interface when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.mcpInterface = new MCPInterface();
});
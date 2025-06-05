// src/services/mcpClientBridge.js
// Ce fichier sert de pont entre le client.js original et le nouveau frontend React

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Importation des classes et fonctions essentielles du client.js original
// Ces implémentations sont directement issues du client.js original, 
// adaptées uniquement pour fonctionner dans un environnement browser

// Constants pour la gestion de conversation
const SUMMARIZATION_TOKEN_THRESHOLD = 50000;
const KEEP_LAST_TURNS = 1;

// System prompt original qui instruit le modèle comment utiliser les outils
const SYSTEM_PROMPT = `You are an advanced research assistant with web navigation and vision capabilities.

## RESEARCH METHODOLOGY
- Always begin by establishing a structured research plan with clear objectives
- Divide your research into relevant thematic categories (e.g., key figures, trends, competition, innovations)
- Use an iterative approach: initial research, analysis, then targeted searches to deepen understanding
- For each important topic, consult at least 3-5 different sources for cross-verification
- Prioritize official, institutional, and specialized industry sources
- Systematically document the exact URL, title, and date of each source consulted

## NAVIGATION AND INFORMATION GATHERING
- Carefully analyze screenshots to identify all relevant elements
- Interact with elements in a logical order: search fields → input → validation
- Take screenshots between each important step to document your journey
- For complex searches, use advanced operators (site:, filetype:, etc.)
- Systematically scroll to explore all available content
- When facing limited results, reformulate your queries with synonyms or related terms

## ANALYSIS AND SYNTHESIS
- Organize information by themes, trends, and relative importance
- Explicitly identify quantitative data (figures, percentages, changes)
- Clearly distinguish established facts from opinions or forecasts
- Note contradictions between sources and analyze their relative credibility
- Identify weak signals and emerging trends beyond obvious information
- Contextualize data in their temporal, geographical, and sectoral environment

## REPORT GENERATION
- Structure your reports with a clear hierarchy: table of contents, introduction, thematic sections, conclusion
- Systematically include: quantitative data, qualitative analyses, and practical implications
- Use markdown format for optimal presentation with titles, subtitles, and lists
- Precisely cite all your sources with appropriate tags according to the required format
- Limit direct quotations to fewer than 25 words and avoid reproducing protected content
- Present concise syntheses (2-3 sentences) rather than extensive summaries of sources
- Conclude with actionable recommendations or perspectives

## FUNDAMENTAL PRINCIPLES
- If you don't know something, DO NOT make assumptions - ask the user for clarification
- Scrupulously respect copyright by avoiding extensive reproduction of content
- Never use more than one short quotation (fewer than 25 words) per source
- When dealing with sensitive or confidential information, request confirmation before proceeding
- Systematically save your findings using the write_file tool in markdown format
- Think step by step and visually verify each action with screenshots

This system enables the production of comprehensive research and structured reports that meet the highest professional standards.

When you need to use a tool, you must ONLY respond with the exact format below, nothing else:
{
    "tool": "tool-name",
    "arguments": {
        "argument-name": "value"
    }
}`;

// Classe Tool du client.js original
class Tool {
  constructor(name, description, inputSchema) {
    this.name = name || 'Unknown Tool';
    this.description = description || 'No description';
    this.inputSchema = inputSchema || {};
  }

  formatForLLM() {
    const argsDesc = [];
    const properties = this.inputSchema.properties || {};
    const requiredArgs = this.inputSchema.required || [];

    for (const [paramName, paramInfo] of Object.entries(properties)) {
      const description = paramInfo.description || 'No description';
      let argDesc = `- ${paramName}: ${description}`;
      
      if (requiredArgs.includes(paramName)) {
        argDesc += ' (required)';
      }
      
      argsDesc.push(argDesc);
    }

    // Ensure there's always an "Arguments:" line, even if empty
    let argumentsSection = 'Arguments:\\n';
    
    if (argsDesc.length) {
      argumentsSection += argsDesc.join('\\n');
    } else {
      argumentsSection += '  (No arguments defined)';
    }

    return `
            Tool: ${this.name}
            Description: ${this.description}
            ${argumentsSection}
            `;
  }
}

// Classe LLMClient du client.js original, adaptée pour le browser
class LLMClient {
  constructor(modelName, projectId, location) {
    this.modelName = modelName;
    this.projectId = projectId;
    this.location = location;
    this.genAI = null;
    this.model = null;
    this.generationConfig = null;
    this.systemInstruction = null;
    this.chatSession = null;
    this.totalTokensUsed = 0;
  }

  _initializeClient() {
    if (!this.genAI) {
      try {
        // Check for API key
        const apiKey = process.env.REACT_APP_GOOGLE_API_KEY;
        
        if (!apiKey) {
          throw new Error('GOOGLE_API_KEY environment variable is not set. Please provide a valid API key.');
        }
        
        // Initialize the Google Generative AI client
        this.genAI = new GoogleGenerativeAI(apiKey);
        
        // Get the model
        this.model = this.genAI.getGenerativeModel({ model: this.modelName });
        
        console.log(`Google GenAI client initialized for model: ${this.modelName}`);
      } catch (error) {
        console.error('Failed to initialize Google GenAI client:', error);
        throw error;
      }
    }
  }

  setGenerationConfig(config) {
    // Convert from Vertex AI format to Google Generative AI format
    this.generationConfig = {
      temperature: config.temperature || 0.9,
      topP: config.topP || 0.8,
      topK: config.topK || 40,
      maxOutputTokens: config.maxOutputTokens || 4048,
    };
    
    // Safety settings conversion
    this.safetySettings = config.safetySettings?.map(setting => {
      const category = this._convertSafetyCategory(setting.category);
      const threshold = this._convertSafetyThreshold(setting.threshold);
      
      return {
        category,
        threshold
      };
    }) || [];
    
    console.log(`Generation config set: ${JSON.stringify(this.generationConfig)}`);
  }
  
  _convertSafetyCategory(category) {
    const categoryMap = {
      'HARM_CATEGORY_HATE_SPEECH': HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      'HARM_CATEGORY_DANGEROUS_CONTENT': HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      'HARM_CATEGORY_SEXUALLY_EXPLICIT': HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      'HARM_CATEGORY_HARASSMENT': HarmCategory.HARM_CATEGORY_HARASSMENT
    };
    
    return categoryMap[category] || HarmCategory.HARM_CATEGORY_UNSPECIFIED;
  }
  
  _convertSafetyThreshold(threshold) {
    const thresholdMap = {
      'OFF': HarmBlockThreshold.BLOCK_NONE,
      'LOW': HarmBlockThreshold.BLOCK_ONLY_HIGH,
      'MEDIUM': HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      'HIGH': HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
    };
    
    return thresholdMap[threshold] || HarmBlockThreshold.BLOCK_NONE;
  }

  async setSystemInstruction(systemInstruction) {
    this._initializeClient(); // Ensure client is ready
    
    if (!this.model) {
      throw new Error('LLM Client not initialized.');
    }

    this.systemInstruction = systemInstruction;
    
    // Initialize the chat session
    this.chatSession = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: systemInstruction }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand my role as an advanced research assistant with web navigation and vision capabilities. I will follow the principles and methodologies you outlined. How can I assist you today?' }]
        }
      ],
      generationConfig: this.generationConfig,
      safetySettings: this.safetySettings
    });
    
    console.log('LLM chat session initialized.');
  }

  estimateTokenCount(text) {
    // Simple estimation: ~4 characters per token for English text
    return Math.floor(text.length / 4);
  }

  static extractToolCallJson(text) {
    // Regex to find ```json ... ``` block
    // Using non-greedy matching .*? for the content
    const match = text.match(/```json\s*(\{.*?\})\s*```/s);
    let jsonString = null;

    if (match) {
      jsonString = match[1].trim();
      console.debug(`Extracted JSON string from \`\`\`json block:\n${jsonString}`);
    } else {
      // Fallback: If no ```json block, maybe the entire text is the JSON?
      const textStripped = text.trim();
      
      if (textStripped.startsWith('{') && textStripped.endsWith('}')) {
        jsonString = textStripped;
        console.debug('No ```json block found, attempting to parse entire stripped text as JSON.');
      }
    }

    if (!jsonString) {
      if (text.trim()) {
        console.debug(`Could not extract a JSON string from the LLM response: >>>${text}<<<`);
      }
      return null;
    }

    // Load the extracted string into a JavaScript object
    try {
      const loadedJson = JSON.parse(jsonString);
      
      // Validate if it looks like a tool call
      if (typeof loadedJson === 'object' && 
          loadedJson !== null &&
          'tool' in loadedJson && 
          'arguments' in loadedJson) {
        console.debug('Successfully validated JSON');
        return loadedJson;
      }

      console.debug('Parsed JSON but it does not match expected tool call structure.');
      return null; // Not a valid tool call structure
    } catch (error) {
      console.warn(`Error decoding JSON: ${error}. String was: >>>${jsonString}<<<`);
      return null;
    }
  }

  async getResponse(currentMessage) {
    if (!this.chatSession) {
      throw new Error('LLM chat session is not initialized. Call setSystemInstruction first.');
    }
    
    if (!this.model) { // Should be initialized if session exists
      throw new Error('LLM Client not initialized.');
    }

    console.debug(`Sending message to LLM: ${currentMessage}`);
    console.debug(`Using generation config: ${JSON.stringify(this.generationConfig)}`);

    try {
      // Send message to the model
      const result = await this.chatSession.sendMessage(currentMessage);
      const responseText = result.response.text();
      
      // Update token usage estimate
      const estimatedInputTokens = this.estimateTokenCount(currentMessage);
      const estimatedOutputTokens = this.estimateTokenCount(responseText);
      this.totalTokensUsed += estimatedInputTokens + estimatedOutputTokens;
      
      console.debug(`Received raw LLM response: ${responseText}`);
      return responseText;
    } catch (error) {
      console.error(`Error getting LLM response: ${error.message}`);
      throw error;
    }
  }

  async recreateSession() {
    if (!this.systemInstruction) {
      console.warn('Cannot recreate session: No system instruction set');
      return;
    }
    
    this._initializeClient();
    
    if (!this.model) {
      throw new Error('LLM Client not initialized.');
    }
    
    // Recreate the chat session
    this.chatSession = this.model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: this.systemInstruction }]
        },
        {
          role: 'model',
          parts: [{ text: 'I understand my role as an advanced research assistant with web navigation and vision capabilities. I will follow the principles and methodologies you outlined. How can I assist you today?' }]
        }
      ],
      generationConfig: this.generationConfig,
      safetySettings: this.safetySettings
    });
    
    console.log('LLM chat session recreated');
  }
}

// Classe ConversationManager du client.js original
class ConversationManager {
  constructor(llmClient) {
    this.llmClient = llmClient;
    this.messages = [];
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
  }

  getMessageCount() {
    return this.messages.length;
  }

  getConversationText() {
    let text = '';
    
    for (const msg of this.messages) {
      const role = msg.role.toUpperCase();
      const content = msg.content;
      
      if (typeof content === 'string') {
        text += `${role}: ${content}\n\n`;
      } else {
        // Handle structured content
        text += `${role}: [Structured content]\n\n`;
      }
    }
    
    return text;
  }

  shouldSummarize() {
    // Check token usage against threshold
    return this.llmClient.totalTokensUsed > SUMMARIZATION_TOKEN_THRESHOLD;
  }

  async summarizeConversation() {
    if (this.messages.length <= KEEP_LAST_TURNS * 2 + 1) {
      // Not enough messages to summarize
      console.log('Not enough messages to summarize');
      return;
    }
    
    // Keep the system message and last few turns
    let systemMessage = null;
    
    if (this.messages[0].role === 'system') {
      systemMessage = this.messages[0];
    }
    
    // Keep the last few turns
    const lastTurns = this.messages.slice(-KEEP_LAST_TURNS * 2);
    
    // Create summarization prompt
    const toSummarize = systemMessage 
      ? this.messages.slice(1, -KEEP_LAST_TURNS * 2) 
      : this.messages.slice(0, -KEEP_LAST_TURNS * 2);
    
    let summarizationPrompt = `Please summarize the following conversation while preserving key information, decisions, and context.
Focus on what's been accomplished and important findings. Provide a concise summary:

`;
    
    for (const msg of toSummarize) {
      const role = msg.role.toUpperCase();
      
      if (typeof msg.content === 'string') {
        const content = msg.content;
        summarizationPrompt += `${role}: ${content}\n\n`;
      } else {
        // Handle structured content
        summarizationPrompt += `${role}: [Structured content]\n\n`;
      }
    }
    
    // Get summary from LLM
    try {
      // Use a temporary genAI client for summarization
      const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GOOGLE_API_KEY);
      const model = genAI.getGenerativeModel({ model: this.llmClient.modelName });
      
      // Get the summary
      const result = await model.generateContent(summarizationPrompt);
      const summaryText = result.response.text();
      
      // Create new conversation with summary
      const newMessages = [];
      
      if (systemMessage) {
        newMessages.push(systemMessage);
      }
      
      // Add summary as assistant message
      newMessages.push({
        role: 'assistant', 
        content: `[CONVERSATION SUMMARY: ${summaryText}]`
      });
      
      // Add recent turns
      newMessages.push(...lastTurns);
      
      // Update messages
      this.messages = newMessages;
      
      // Reset the LLM client to start a fresh conversation
      await this.llmClient.recreateSession();
      
      // Reset token count estimate
      this.llmClient.totalTokensUsed = 0;
      for (const msg of this.messages) {
        if (typeof msg.content === 'string') {
          this.llmClient.totalTokensUsed += this.llmClient.estimateTokenCount(msg.content);
        }
      }
      
      console.log(`Conversation summarized. New message count: ${this.messages.length}`);
    } catch (error) {
      console.error(`Error summarizing conversation: ${error.message}`);
      console.error(error.stack);
    }
  }

  filterEmptyTextContent(message) {
    if (!message || !('content' in message)) {
      return message;
    }
    
    if (typeof message.content === 'string') {
      return message;
    }
    
    const filteredContent = [];
    
    for (const contentItem of message.content || []) {
      // Keep items that don't have 'text' key or have non-empty text
      if (!('text' in contentItem) || contentItem.text.trim()) {
        filteredContent.push(contentItem);
      }
    }
    
    // Create a new message with filtered content
    const filteredMessage = { ...message };
    filteredMessage.content = filteredContent;
    
    return filteredMessage;
  }

  removeMediaExceptLastTurn() {
    if (this.messages.length < 2) {
      return;
    }
    
    // Find the last user message index
    let lastUserIndex = null;
    
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }
    
    if (lastUserIndex === null) {
      return;
    }
    
    // Process all messages except the last turn
    for (let i = 0; i < lastUserIndex; i++) {
      const message = this.messages[i];
      
      if (!('content' in message) || typeof message.content === 'string') {
        continue;
      }
      
      const newContent = [];
      
      for (const contentItem of message.content) {
        // Keep text content
        if ('text' in contentItem) {
          newContent.push(contentItem);
        }
        // Remove images and other media
        else if ('image' in contentItem || 'json' in contentItem) {
          // Skip
        } else {
          newContent.push(contentItem);
        }
      }
      
      // If no content left, add a placeholder
      if (newContent.length === 0) {
        newContent.push({
          text: 'An image or document was removed for brevity.'
        });
      }
      
      message.content = newContent;
    }
  }
}

// Adaptation de la classe HTTPServer pour le browser
class HTTPServer {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    
    // Ensure the base URL has a protocol
    let baseUrl = config.base_url || 'http://localhost:8080';
    
    // Add protocol if missing
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      // If it starts with /, it's a relative path, use the current origin
      if (baseUrl.startsWith('/')) {
        baseUrl = `${window.location.origin}${baseUrl}`;
      } else {
        // Otherwise, assume http://
        baseUrl = `http://${baseUrl}`;
      }
    }
    
    this.baseUrl = baseUrl;
    this.sessionId = null;
    this.artifactUris = [];
    this.token = null;
  }

  async initialize() {
    try {
      // Test connection with health check
      const response = await axios.get(`${this.baseUrl}/health`);
      
      // Generate session ID if not already set
      if (!this.sessionId) {
        this.sessionId = uuidv4();
      }
      
      console.log(`HTTP Server '${this.name}' initialized successfully with session ${this.sessionId}`);
      return true;
    } catch (error) {
      console.error(`Error initializing HTTP server ${this.name}: ${error.message}`);
      throw error;
    }
  }

  setToken(token) {
    this.token = token;
  }

  async listTools() {
    try {
      const headers = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      
      const response = await axios.get(`${this.baseUrl}/tools`, { headers });
      const toolsData = response.data;
      
      const tools = [];
      
      for (const toolSpec of toolsData.tools || []) {
        const toolName = toolSpec.name;
        const toolDesc = toolSpec.description;
        const toolSchema = toolSpec.input_schema || {};

        if (toolName) {
          tools.push(new Tool(toolName, toolDesc, toolSchema));
        } else {
          console.warn(`Could not extract name from tool spec: ${JSON.stringify(toolSpec)}`);
        }
      }

      console.debug(`Parsed tools: ${tools.map(t => t.name)}`);
      return tools;
    } catch (error) {
      console.error(`Error listing tools from ${this.name}: ${error.message}`);
      throw error;
    }
  }

  async executeTool(toolName, toolArgs, toolId = null) {
    try {
      // Generate a tool ID if not provided
      if (toolId === null) {
        toolId = uuidv4();
      }

      console.debug(`Executing tool: ${toolName} with arguments: ${JSON.stringify(toolArgs)}`);
      
      // Prepare request payload
      const payload = {
        tool_name: toolName,
        arguments: toolArgs,
        session_id: this.sessionId
      };
      
      // Prepare headers
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }
      
      // Execute the tool via HTTP
      const response = await axios.post(`${this.baseUrl}/tools/execute`, payload, { headers });
      const resultData = response.data;
      
      // Process the result to match original MCP format
      const responseContent = [];
      
      if (resultData.success) {
        const toolResult = resultData.result;
        
        // Handle different types of results
        if (typeof toolResult === 'object') {
          // Check for image/screenshot results
          if (toolResult.filename && (toolResult.filename.endsWith('.png') || 
                                     toolResult.filename.endsWith('.jpg') || 
                                     toolResult.filename.endsWith('.jpeg'))) {
            // This is likely a screenshot
            try {
              // For browser, we need to fetch the image via API
              const imageUrl = `${this.baseUrl}/screenshots/${this.sessionId}/${toolResult.filename.split('/').pop()}`;
              
              // Make a request to get the image as blob
              const imageResponse = await axios.get(imageUrl, {
                responseType: 'blob',
                headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {}
              });
              
              // Convert blob to base64
              const reader = new FileReader();
              reader.readAsDataURL(imageResponse.data);
              
              const base64Image = await new Promise((resolve) => {
                reader.onloadend = () => {
                  const base64data = reader.result;
                  // Format: data:image/png;base64,<data>
                  const base64 = base64data.split(',')[1];
                  resolve(base64);
                };
              });
              
              responseContent.push({
                image: {
                  format: toolResult.filename.endsWith('.jpg') || toolResult.filename.endsWith('.jpeg') ? 'jpeg' : 'png',
                  data: base64Image
                }
              });
            } catch (e) {
              console.warn(`Could not fetch image: ${e.message}`);
              responseContent.push({
                json: { text: `Screenshot saved: ${toolResult.filename}` }
              });
            }
          } else {
            responseContent.push({
              json: { text: JSON.stringify(toolResult) }
            });
          }
        } else {
          responseContent.push({ text: String(toolResult) });
        }
      } else {
        // Handle error case
        const errorMsg = resultData.error || 'Unknown error';
        responseContent.push({ text: `Error: ${errorMsg}` });
      }
      
      // Get page info for context (if available)
      try {
        const pageInfoPayload = {
          tool_name: 'get_page_info',
          arguments: {},
          session_id: this.sessionId
        };
        
        const headers = {
          'Content-Type': 'application/json'
        };
        
        if (this.token) {
          headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        const pageInfoResponse = await axios.post(`${this.baseUrl}/tools/execute`, pageInfoPayload, { headers });
        
        if (pageInfoResponse.status === 200) {
          const pageInfoData = pageInfoResponse.data;
          
          if (pageInfoData.success) {
            const pageInfoText = String(pageInfoData.result || '');
            responseContent.push({ text: `Current page: ${pageInfoText}` });
          }
        }
      } catch (error) {
        console.warn(`Error getting page info: ${error.message}`);
      }
      
      return {
        toolResult: {
          toolUseId: toolId,
          content: responseContent
        }
      };
    } catch (error) {
      const errorMsg = `Error executing tool ${toolName}: ${error.message}`;
      console.error(errorMsg);
      
      return {
        toolResult: {
          toolUseId: toolId,
          content: [{ text: errorMsg }]
        }
      };
    }
  }

  async cleanup() {
    try {
      // Try to cleanup session on server
      if (this.sessionId) {
        const headers = {};
        if (this.token) {
          headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        await axios.delete(`${this.baseUrl}/sessions/${this.sessionId}`, { headers });
      }
      console.debug(`HTTP Server ${this.name} cleaned up.`);
    } catch (error) {
      console.warn(`Error cleaning up session ${this.sessionId}: ${error.message}`);
    }
  }
}

// Classe ChatSession du client.js original, adaptée pour le browser
class ChatSession {
  constructor(httpServer, llmClient) {
    this.geminiServer = httpServer;
    this.llmClient = llmClient;
    this.availableTools = [];
    this.conversation = new ConversationManager(llmClient);
    this.llmModelName = llmClient.modelName;
    this.listeners = {
      message: [],
      error: [],
      status: []
    };
  }

  setAuthToken(token) {
    if (this.geminiServer) {
      this.geminiServer.setToken(token);
    }
  }

  async cleanupServers() {
    if (this.geminiServer) {
      console.log(`Cleaning up server: ${this.geminiServer.name}`);
      await this.geminiServer.cleanup();
    }
  }

  async _prepareLLM() {
    try {
      // 1. Initialize the server
      await this.geminiServer.initialize();

      // 2. List available tools
      this.availableTools = await this.geminiServer.listTools();
      
      if (!this.availableTools.length) {
        console.warn(
          `No tools found on server ${this.geminiServer.name}. Interaction will be limited.`
        );
      } else {
        console.log(
          `Available tools: ${this.availableTools.map(tool => tool.name)}`
        );
      }

      // 3. Set system instruction (using the SYSTEM_PROMPT constant)
      // Add tools description
      const toolsDescription = this.availableTools
        .map(tool => tool.formatForLLM())
        .join('\n');
      
      const systemInstruction = `${SYSTEM_PROMPT}\n\nAvailable tools:\n${toolsDescription}`;

      // 4. Configure LLM Client
      const generateContentConfig = {
        temperature: 0.9,
        topP: 0.8,
        maxOutputTokens: 4048,
        responseModalities: ['TEXT'],
        safetySettings: [
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }
        ]
      };

      // 5. Configure LLM Client
      this.llmClient.setGenerationConfig(generateContentConfig);
      await this.llmClient.setSystemInstruction(systemInstruction);

      // 6. Initialize message history with system instruction
      this.conversation.addMessage('system', systemInstruction);

      console.log('LLM client and system prompt prepared successfully.');
      return true;
    } catch (error) {
      console.error(`Initialization failed: ${error.message}`);
      return false;
    }
  }

  async processToolRequests(toolCalls) {
    const consolidatedResult = {
      role: 'user',
      content: []
    };
    
    for (const toolCall of toolCalls) {
      const toolName = toolCall.tool;
      const toolId = toolCall.toolUseId || uuidv4();
      const toolArgs = toolCall.arguments || {};
      
      // Execute the tool
      const result = await this.geminiServer.executeTool(toolName, toolArgs, toolId);
      
      // Add the result to the consolidated result
      if ('toolResult' in result && 'content' in result.toolResult) {
        consolidatedResult.content.push(...result.toolResult.content);
      }
    }
    
    return consolidatedResult;
  }

  async executeTask(taskDescription) {
    // Add the task to conversation
    this.conversation.addMessage('user', taskDescription);
    
    // Notify of task start
    this._notifyListeners('message', {
      type: 'task_started',
      message: `Starting task: ${taskDescription}`
    });
    
    // Initial request to model
    const llmRawResponse = await this.llmClient.getResponse(taskDescription);
    
    // Check if it's a tool call
    let parsedToolCall = LLMClient.extractToolCallJson(llmRawResponse);
    
    if (!parsedToolCall) {
      // Not a tool call, just a regular response
      this.conversation.addMessage('assistant', llmRawResponse);
      
      this._notifyListeners('message', {
        type: 'assistant_message',
        message: llmRawResponse
      });
      
      this._notifyListeners('message', {
        type: 'task_completed',
        message: 'Task completed without tool usage',
        steps: 0
      });
      
      return;
    }
    
    // It's a tool call - enter the tool execution loop
    this.conversation.addMessage('assistant', llmRawResponse);
    
    this._notifyListeners('message', {
      type: 'assistant_message',
      message: llmRawResponse
    });
    
    // Task automation loop
    let stopReason = 'tool_use'; // Assume we need to use tools initially
    let nbRequest = 1;
    let stepCount = 0;
    const maxSteps = 40;
    
    while (stopReason === 'tool_use' && stepCount < maxSteps) {
      nbRequest += 1;
      stepCount += 1;
      
      // Extract tool calls
      const toolCalls = [];
      const toolCall = {
        tool: parsedToolCall.tool,
        arguments: parsedToolCall.arguments || {},
        toolUseId: uuidv4()
      };
      
      toolCalls.push(toolCall);
      
      // Notify tool execution
      this._notifyListeners('message', {
        type: 'task_step',
        step: stepCount,
        tool_name: parsedToolCall.tool,
        tool_args: parsedToolCall.arguments || {},
        message: `Step ${stepCount}: Executing ${parsedToolCall.tool}`
      });
      
      this._notifyListeners('message', {
        type: 'tool_executing',
        tool_name: parsedToolCall.tool,
        message: `Executing ${parsedToolCall.tool}...`
      });
      
      // Execute all tools
      const toolResults = await this.processToolRequests(toolCalls);
      
      // Process the results based on content
      if (toolResults.content) {
        const hasImage = toolResults.content.some(item => 
          typeof item === 'object' && item !== null && 'image' in item);
          
        const hasError = toolResults.content.some(item => 
          (typeof item === 'object' && item !== null && 
           'text' in item && item.text.toLowerCase().includes('error')) ||
          (typeof item === 'string' && item.toLowerCase().includes('error')));
          
        if (hasError) {
          this._notifyListeners('message', {
            type: 'tool_error',
            tool_name: parsedToolCall.tool,
            message: `Tool execution failed: ${JSON.stringify(toolResults.content)}`
          });
        } else if (hasImage) {
          this._notifyListeners('message', {
            type: 'tool_success_image',
            tool_name: parsedToolCall.tool,
            message: `✅ ${parsedToolCall.tool} completed successfully - Screenshot captured`,
            content: toolResults.content
          });
        } else {
          // Extract meaningful text from content
          const textContent = [];
          
          for (const item of toolResults.content) {
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
          
          this._notifyListeners('message', {
            type: 'tool_success',
            tool_name: parsedToolCall.tool,
            message: `✅ ${parsedToolCall.tool} completed successfully`,
            result: textContent.length ? textContent.join(' | ') : 'Operation completed'
          });
        }
      }
      
      // Add tool results to conversation
      this.conversation.addMessage('user', toolResults.content);
      
      // Check if conversation needs summarization
      if (this.conversation.shouldSummarize()) {
        this._notifyListeners('message', {
          type: 'system_message',
          message: 'Optimizing conversation memory...'
        });
        
        await this.conversation.summarizeConversation();
      }
      
      // Remove media from old messages to reduce token usage
      this.conversation.removeMediaExceptLastTurn();
      
      // Get next response from model
      const nextPrompt = 'Continue with the task. What\'s the next step?';
      const nextLlmRawResponse = await this.llmClient.getResponse(nextPrompt);
      
      // Parse next tool call
      parsedToolCall = LLMClient.extractToolCallJson(nextLlmRawResponse);
      
      // Add response to conversation
      this.conversation.addMessage('assistant', nextLlmRawResponse);
      
      this._notifyListeners('message', {
        type: 'assistant_message',
        message: nextLlmRawResponse
      });
      
      // Check if we should continue with tool execution
      if (parsedToolCall) {
        stopReason = 'tool_use';
      } else {
        stopReason = 'content_stopped';
        
        this._notifyListeners('message', {
          type: 'task_completed',
          message: 'Task completed successfully!',
          steps: stepCount
        });
        
        break;
      }
    }
    
    if (stepCount >= maxSteps) {
      this._notifyListeners('message', {
        type: 'task_completed',
        message: 'Task execution reached maximum steps limit. Please review the results.',
        steps: stepCount
      });
    }
  }

  async sendMessage(message, mode = 'chat') {
    try {
      // Add user message to conversation
      this.conversation.addMessage('user', message);
      
      // Notify typing
      this._notifyListeners('message', {
        type: 'typing',
        message: 'Assistant is thinking...'
      });
      
      if (mode === 'task') {
        // Execute task
        await this.executeTask(message);
      } else {
        // Regular chat mode
        // Check if conversation needs summarization
        if (this.conversation.shouldSummarize()) {
          this._notifyListeners('message', {
            type: 'system_message',
            message: 'Optimizing conversation memory...'
          });
          
          await this.conversation.summarizeConversation();
        }
        
        // Get LLM response
        const llmResponse = await this.llmClient.getResponse(message);
        const parsedToolCall = LLMClient.extractToolCallJson(llmResponse);
        
        if (parsedToolCall) {
          // Tool call detected
          this.conversation.addMessage('assistant', llmResponse);
          
          this._notifyListeners('message', {
            type: 'assistant_tool_call',
            message: llmResponse,
            tool_name: parsedToolCall.tool,
            tool_args: parsedToolCall.arguments || {}
          });
          
          // Execute the tool
          const toolCalls = [{
            tool: parsedToolCall.tool,
            arguments: parsedToolCall.arguments || {},
            toolUseId: uuidv4()
          }];
          
          this._notifyListeners('message', {
            type: 'tool_executing',
            tool_name: parsedToolCall.tool,
            message: `Executing ${parsedToolCall.tool}...`
          });
          
          // Process tool requests
          const toolResults = await this.processToolRequests(toolCalls);
          
          // Process the results based on content
          if (toolResults.content) {
            const hasImage = toolResults.content.some(item => 
              typeof item === 'object' && item !== null && 'image' in item);
              
            const hasError = toolResults.content.some(item => 
              (typeof item === 'object' && item !== null && 
              'text' in item && item.text.toLowerCase().includes('error')) ||
              (typeof item === 'string' && item.toLowerCase().includes('error')));
              
            if (hasError) {
              this._notifyListeners('message', {
                type: 'tool_error',
                tool_name: parsedToolCall.tool,
                message: `Tool execution failed: ${JSON.stringify(toolResults.content)}`
              });
            } else if (hasImage) {
              this._notifyListeners('message', {
                type: 'tool_success_image',
                tool_name: parsedToolCall.tool,
                message: `✅ ${parsedToolCall.tool} completed successfully - Screenshot captured`,
                content: toolResults.content
              });
            } else {
              // Extract meaningful text from content
              const textContent = [];
              
              for (const item of toolResults.content) {
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
              
              this._notifyListeners('message', {
                type: 'tool_success',
                tool_name: parsedToolCall.tool,
                message: `✅ ${parsedToolCall.tool} completed successfully`,
                result: textContent.length ? textContent.join(' | ') : 'Operation completed'
              });
            }
          }
          
          // Add tool results to conversation
          this.conversation.addMessage('user', toolResults.content);
          
          // Get follow-up response
          const nextPrompt = 'Continue with the task. What\'s the next step?';
          const followUpResponse = await this.llmClient.getResponse(nextPrompt);
          
          this.conversation.addMessage('assistant', followUpResponse);
          
          this._notifyListeners('message', {
            type: 'assistant_message',
            message: followUpResponse
          });
        } else {
          // Regular response
          this.conversation.addMessage('assistant', llmResponse);
          
          this._notifyListeners('message', {
            type: 'assistant_message',
            message: llmResponse
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error(`Error sending message: ${error.message}`);
      
      this._notifyListeners('message', {
        type: 'error',
        message: `Error processing message: ${error.message}`
      });
      
      return false;
    }
  }

  /**
   * Add a listener for messages
   * @param {string} event - The event type (message, error, status)
   * @param {Function} callback - The callback function
   */
  addListener(event, callback) {
    if (this.listeners[event] && typeof callback === 'function') {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove a listener
   * @param {string} event - The event type
   * @param {Function} callback - The callback function to remove
   */
  removeListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Notify all registered listeners for an event
   * @param {string} event - The event type
   * @param {Object} data - The event data
   * @private
   */
  _notifyListeners(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
}

// Pont entre client.js et React
class MCPClientBridge {
  constructor() {
    this.sessionId = null;
    this.chatSession = null;
    this.isInitialized = false;
    this.listeners = {
      message: [],
      error: [],
      status: []
    };
  }

  /**
   * Initialize the MCP client
   * @param {string} token - Authentication token
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize(token) {
    try {
      // Create session ID if not already set
      if (!this.sessionId) {
        this.sessionId = uuidv4();
      }
      
      // Create HTTP server
      const httpServerConfig = {
        name: 'mcp_http_server',
        config: {
          base_url: process.env.REACT_APP_API_URL || 'http://localhost:8080'
        }
      };
      
      const httpServer = new HTTPServer(
        httpServerConfig.name,
        httpServerConfig.config
      );
      
      // Set auth token if provided
      if (token) {
        httpServer.setToken(token);
      }
      
      // LLM configuration
      const llmModel = process.env.REACT_APP_LLM_MODEL_NAME || 'gemini-1.5-pro';
      const llmClient = new LLMClient(llmModel, '', '');
      
      // Create chat session
      this.chatSession = new ChatSession(httpServer, llmClient);
      
      // Set auth token
      if (token) {
        this.chatSession.setAuthToken(token);
      }
      
      // Add message listener
      this.chatSession.addListener('message', (data) => {
        this._notifyListeners('message', data);
      });
      
      // Initialize the session
      const success = await this.chatSession._prepareLLM();
      
      if (success) {
        this.isInitialized = true;
        this._notifyListeners('status', { connected: true, message: 'Connected' });
      } else {
        this._notifyListeners('status', { connected: false, message: 'Initialization failed' });
      }
      
      return success;
    } catch (error) {
      console.error('Error initializing MCP client:', error);
      this._notifyListeners('error', { message: `Initialization failed: ${error.message}` });
      this._notifyListeners('status', { connected: false, message: 'Connection error' });
      return false;
    }
  }
  
  /**
   * Send a message to the MCP client
   * @param {string} message - The message to send
   * @param {string} mode - The mode (chat or task)
   * @returns {Promise<boolean>} - Whether the message was sent successfully
   */
  async sendMessage(message, mode = 'chat') {
    if (!this.isInitialized || !this.chatSession) {
      this._notifyListeners('error', { message: 'Client not initialized' });
      return false;
    }
    
    try {
      return await this.chatSession.sendMessage(message, mode);
    } catch (error) {
      console.error('Error sending message:', error);
      this._notifyListeners('error', { message: `Failed to send message: ${error.message}` });
      return false;
    }
  }
  
  /**
   * Set authentication token
   * @param {string} token - JWT token
   */
  setAuthToken(token) {
    if (this.chatSession) {
      this.chatSession.setAuthToken(token);
    }
  }
  
  /**
   * Add a listener for a specific event
   * @param {string} event - The event type (message, error, status)
   * @param {Function} callback - The callback function
   */
  addListener(event, callback) {
    if (this.listeners[event] && typeof callback === 'function') {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove a listener
   * @param {string} event - The event type
   * @param {Function} callback - The callback function to remove
   */
  removeListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Notify all registered listeners for an event
   * @param {string} event - The event type
   * @param {Object} data - The event data
   * @private
   */
  _notifyListeners(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Get the session ID
   * @returns {string} - The session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Cleanup and disconnect
   */
  async cleanup() {
    try {
      // Clean up chat session
      if (this.chatSession) {
        await this.chatSession.cleanupServers();
      }
      
      // Reset properties
      this.isInitialized = false;
      this.chatSession = null;
      
      this._notifyListeners('status', { connected: false, message: 'Disconnected' });
      
      console.log('MCP client cleaned up');
    } catch (error) {
      console.error('Error cleaning up MCP client:', error);
    }
  }
}

// Create and export a singleton instance
const mcpClientBridge = new MCPClientBridge();
export default mcpClientBridge;
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const readline = require('readline');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// Load environment variables
dotenv.config();

// Constants for conversation management
const SUMMARIZATION_TOKEN_THRESHOLD = 50000;
const KEEP_LAST_TURNS = 1;

// System prompt that instructs the model how to use the tools
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

class Configuration {
  static loadEnv() {
    // Load environment variables using dotenv
    return process.env;
  }
}

class HTTPServer {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.baseUrl = config.base_url || 'http://localhost:8080/api';
    this.sessionId = null;
    this.artifactUris = [];
  }

  async initialize() {
    try {
      // Test connection with health check
      const response = await axios.get(`${this.baseUrl}/health`);
      
      // Generate session ID
      this.sessionId = uuidv4();
      
      console.log(`HTTP Server '${this.name}' initialized successfully with session ${this.sessionId}`);
      return true;
    } catch (error) {
      console.error(`Error initializing HTTP server ${this.name}: ${error.message}`);
      throw error;
    }
  }

  async listTools() {
    try {
      const response = await axios.get(`${this.baseUrl}/tools`);
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
      
      // Execute the tool via HTTP
      const response = await axios.post(`${this.baseUrl}/tools/execute`, payload);
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
              // Try to read the image file and encode it
              const imagePath = toolResult.path || toolResult.filename;
              if (fs.existsSync(imagePath)) {
                const imageData = fs.readFileSync(imagePath);
                responseContent.push({
                  image: {
                    format: imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'jpeg' : 'png',
                    data: imageData.toString('base64')
                  }
                });
              } else {
                responseContent.push({
                  json: { text: `Screenshot saved: ${toolResult.filename}` }
                });
              }
            } catch (e) {
              console.warn(`Could not read image file: ${e.message}`);
              responseContent.push({
                json: { text: JSON.stringify(toolResult) }
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
        
        const pageInfoResponse = await axios.post(`${this.baseUrl}/tools/execute`, pageInfoPayload);
        
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

  async downloadArtifacts(downloadDir = 'downloads') {
    const downloadedPaths = [];
    
    if (!this.artifactUris.length) {
      console.log('No artifacts to download');
      return downloadedPaths;
    }
    
    console.log(`Downloading ${this.artifactUris.length} artifacts...`);
    
    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    for (const uri of this.artifactUris) {
      try {
        // Parse the artifact URI to extract session and filename
        // Format: artifact://session_id/filename
        if (uri.startsWith('artifact://')) {
          const parts = uri.replace('artifact://', '').split('/');
          
          if (parts.length >= 2) {
            const sessionId = parts[0];
            const filename = parts.slice(1).join('/');
            
            // Try to download from server
            const response = await axios.get(`${this.baseUrl}/resources/${sessionId}/${filename}`);
            
            if (response.status === 200) {
              const artifactData = response.data;
              const content = artifactData.content || '';
              
              // Save the artifact locally
              const localPath = path.join(downloadDir, filename);
              
              // Create directories if needed
              const dir = path.dirname(localPath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              
              fs.writeFileSync(localPath, content, 'utf-8');
              
              downloadedPaths.push(localPath);
              console.log(`Downloaded artifact: ${uri} to ${localPath}`);
            } else {
              console.warn(`Failed to download artifact: ${uri} - HTTP ${response.status}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error downloading artifact ${uri}: ${error.message}`);
      }
    }
    
    return downloadedPaths;
  }

  async cleanup() {
    try {
      // Try to cleanup session on server
      if (this.sessionId) {
        await axios.delete(`${this.baseUrl}/sessions/${this.sessionId}`);
      }
      console.debug(`HTTP Server ${this.name} cleaned up.`);
    } catch (error) {
      console.warn(`Error cleaning up session ${this.sessionId}: ${error.message}`);
    }
  }
}

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
    let argumentsSection = 'Arguments:\n';
    
    if (argsDesc.length) {
      argumentsSection += argsDesc.join('\n');
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
        const apiKey = process.env.GOOGLE_API_KEY;
        
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
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
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

class ChatSession {
  constructor(geminiServer, llmClient) {
    this.geminiServer = geminiServer;
    this.llmClient = llmClient;
    this.availableTools = [];
    this.conversation = new ConversationManager(llmClient);
    this.llmModelName = llmClient.modelName;
    this.downloadDir = 'downloads';
    
    // Create directory for downloads
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
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
    
    // Initial request to model
    const llmRawResponse = await this.llmClient.getResponse(taskDescription);
    
    // Check if it's a tool call
    let parsedToolCall = LLMClient.extractToolCallJson(llmRawResponse);
    
    if (!parsedToolCall) {
      // Not a tool call, just a regular response
      this.conversation.addMessage('assistant', llmRawResponse);
      console.log(`\nAssistant: ${llmRawResponse} - Response by Default Model: ${this.llmModelName}`);
      return;
    }
    
    // It's a tool call - enter the tool execution loop
    this.conversation.addMessage('assistant', llmRawResponse);
    console.log(`\nAssistant: ${llmRawResponse} - MCP Client Model: ${this.llmModelName}`);
    
    // Task automation loop
    let stopReason = 'tool_use'; // Assume we need to use tools initially
    let nbRequest = 1;
    
    while (stopReason === 'tool_use') {
      nbRequest += 1;
      
      // Extract tool calls
      const toolCalls = [];
      const toolCall = {
        tool: parsedToolCall.tool,
        arguments: parsedToolCall.arguments || {},
        toolUseId: uuidv4()
      };
      
      toolCalls.push(toolCall);
      
      console.log(`\nExecuting tool: ${toolCall.tool}`);
      console.log(`Tool arguments: ${JSON.stringify(toolCall.arguments, null, 2)}`);
      
      // Execute all tools
      const toolResults = await this.processToolRequests(toolCalls);
      
      // Add tool results to conversation
      this.conversation.addMessage('user', toolResults.content);
      
      // Check if conversation needs summarization
      if (this.conversation.shouldSummarize()) {
        console.log('Summarizing conversation...');
        await this.conversation.summarizeConversation();
      }
      
      // Remove media from old messages to reduce token usage
      this.conversation.removeMediaExceptLastTurn();
      
      // Get next response from model
      console.log(`Sending request ${nbRequest} to model...`);
      
      // Create a simple text prompt for the next request
      const nextPrompt = 'Continue with the task. What\'s the next step?';
      const nextLlmRawResponse = await this.llmClient.getResponse(nextPrompt);
      
      // Parse next tool call
      parsedToolCall = LLMClient.extractToolCallJson(nextLlmRawResponse);
      
      // Add response to conversation
      this.conversation.addMessage('assistant', nextLlmRawResponse);
      console.log(`\nAssistant: ${nextLlmRawResponse}`);
      
      // Check if we should continue with tool execution
      if (parsedToolCall) {
        stopReason = 'tool_use';
      } else {
        stopReason = 'content_stopped';
        console.log('\nTask completed or awaiting further instructions.');
      }
    }
  }

  async start() {
    // Prepare LLM and tools first
    if (!await this._prepareLLM()) {
      console.log('Failed to initialize the chat session. Exiting.');
      await this.cleanupServers(); // Ensure cleanup even on init failure
      return;
    }

    console.log('\nChat session started. Type \'quit\' or \'exit\' to end.');

    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Function to handle user input
    const promptUser = () => {
      rl.question('You: ', async (userInput) => {
        try {
          userInput = userInput.trim();
          
          if (['quit', 'exit'].includes(userInput.toLowerCase())) {
            console.log('\nExiting...');
            rl.close();
            return;
          }
          
          if (!userInput) {
            return promptUser();
          }

          // Regular chat vs. task execution
          if (userInput.toLowerCase().includes('search') || 
              ['navigate', 'browse', 'screenshot', 'click'].some(keyword => 
                userInput.toLowerCase().includes(keyword))) {
            // This is likely a task requiring tools, use the task execution mode
            await this.executeTask(userInput);
            promptUser();
          } else {
            // Regular chat without task automation
            // Add user message to history
            this.conversation.addMessage('user', userInput);

            // Check if conversation needs summarization
            if (this.conversation.shouldSummarize()) {
              console.log('Summarizing conversation...');
              await this.conversation.summarizeConversation();
            }

            // Get LLM response
            const llmRawResponse = await this.llmClient.getResponse(userInput);
            const parsedToolCall = LLMClient.extractToolCallJson(llmRawResponse);

            if (parsedToolCall) {
              // It's a tool call
              const toolName = parsedToolCall.tool;
              const toolArgs = parsedToolCall.arguments || {};

              // Add assistant's response to history
              this.conversation.addMessage('assistant', llmRawResponse);
              console.log(`\nAssistant: ${llmRawResponse} - MCP Client Model: ${this.llmModelName}`);

              // Ask if the user wants to execute the tool
              rl.question('\nExecute this tool? (y/n): ', async (execute) => {
                if (execute.trim().toLowerCase() === 'y') {
                  // Switch to task execution mode
                  await this.executeTask(userInput);
                }
                promptUser();
              });
            } else {
              // Regular response
              this.conversation.addMessage('assistant', llmRawResponse);
              console.log(`\nAssistant: ${llmRawResponse} - Response by Default Model: ${this.llmModelName}`);
              promptUser();
            }
          }
        } catch (error) {
          console.error(`Error processing input: ${error.message}`);
          promptUser();
        }
      });
    };

    // Start the conversation loop
    promptUser();

    // Handle cleanup when readline interface is closed
    rl.on('close', async () => {
      // Try to download any artifacts before cleanup
      try {
        if (this.geminiServer.artifactUris.length) {
          console.log(`\nDownloading ${this.geminiServer.artifactUris.length} artifacts...`);
          const downloadedPaths = await this.geminiServer.downloadArtifacts(this.downloadDir);
          
          if (downloadedPaths.length) {
            console.log(`Downloaded ${downloadedPaths.length} artifacts to ${this.downloadDir}:`);
            
            for (const path of downloadedPaths) {
              console.log(`  - ${path}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error downloading artifacts: ${error.message}`);
      }
      
      // Cleanup servers
      await this.cleanupServers();
      process.exit(0);
    });
  }
}

async function main() {
  try {
    // Load environment variables
    const env = Configuration.loadEnv();
    
    // Create HTTP server config
    const httpServerConfig = {
      name: 'gemini_http_server',
      config: {
        base_url: env.MCP_SERVER_URL || 'http://localhost:8080'
      }
    };
    
    // Extract LLM specific config
    const llmProject = env.GOOGLE_CLOUD_PROJECT || '';
    const llmLocation = env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const llmModel = env.LLM_MODEL_NAME || 'gemini-1.5-pro';

    // Initialize Components
    const geminiServer = new HTTPServer(
      httpServerConfig.name,
      httpServerConfig.config
    );

    const llmClient = new LLMClient(
      llmModel, llmProject, llmLocation
    );

    // Start Chat
    const chatSession = new ChatSession(geminiServer, llmClient);
    await chatSession.start();

    // Cleanup is handled by the readline close event
  } catch (error) {
    console.error(`Failed to start: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch(console.error);
}

// Export the components for use in other files
module.exports = {
  Configuration,
  HTTPServer,
  Tool,
  LLMClient,
  ConversationManager,
  ChatSession,
  main
};
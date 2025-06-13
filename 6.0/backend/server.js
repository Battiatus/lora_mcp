const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const winston = require('winston');
const dotenv = require('dotenv');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

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
    new winston.transports.File({ filename: 'server.log' })
  ]
});

// Create directories for resources
['screenshots', 'artifacts', 'downloads'].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Global storage for browser contexts
const contexts = {};
// Store session metadata
const sessions = {};

// Express app setup
const app = express();
app.use(express.json());
app.use(cors());

// Set up Swagger documentation
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCP Server API',
      version: '1.0.0',
      description: 'API documentation for MCP Server',
      contact: {
        name: 'API Support',
        email: 'support@mcpserver.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8080}`,
        description: 'Development server'
      }
    ]
  },
  apis: ['./server.js'] // Path to the API docs
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /api/health:
 *   get: 
 *     tags:
 *       - Status
 *     summary: Check server health
 *     description: Returns the health status of the server
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                   example: mcp-server
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-server' });
});

/**
 * @swagger
 * /api/tools:
 *   get: 
 *     tags:
 *       - Tools
 *     summary: Get available tools
 *     description: Returns a list of tools available for browser automation
 *     responses:
 *       200:
 *         description: List of tools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tools:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: navigate
 *                       description:
 *                         type: string
 *                         example: Navigate to a specified URL
 *                       input_schema:
 *                         type: object
 */
app.get('/api/tools', (req, res) => {
  const tools = [
    {
      name: 'navigate',
      description: 'Navigate to a specified URL',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' }
        },
        required: ['url']
      }
    },
    {
      name: 'screenshot',
      description: 'Take a screenshot of the current page',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'click',
      description: 'Click at specific coordinates on the page',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'integer', description: 'X coordinate' },
          y: { type: 'integer', description: 'Y coordinate' }
        },
        required: ['x', 'y']
      }
    },
    {
      name: 'click_element',
      description: 'Click an element identified by a CSS selector',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to click' }
        },
        required: ['selector']
      }
    },
    {
      name: 'scroll',
      description: 'Scroll the page up or down',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down'] },
          amount: { type: 'integer', description: 'Amount to scroll in pixels' }
        },
        required: ['direction', 'amount']
      }
    },
    {
      name: 'type',
      description: 'Type text',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          submit: { type: 'boolean', description: 'Whether to press Enter', default: false }
        },
        required: ['text']
      }
    },
    {
      name: 'fill_form',
      description: 'Fill form fields with given values',
      input_schema: {
        type: 'object',
        properties: {
          fields: { 
            type: 'array', 
            description: 'Array of form fields to fill',
            items: {
              type: 'object',
              properties: {
                selector: { type: 'string', description: 'CSS selector of the form field' },
                value: { type: 'string', description: 'Value to fill in the field' }
              },
              required: ['selector', 'value']
            }
          },
          submit: { type: 'boolean', description: 'Whether to submit the form after filling', default: false }
        },
        required: ['fields']
      }
    },
    {
      name: 'get_page_info',
      description: 'Get information about the current page',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'get_page_content',
      description: 'Get the HTML content of the current page',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'evaluate_script',
      description: 'Evaluate JavaScript code on the page',
      input_schema: {
        type: 'object',
        properties: {
          script: { type: 'string', description: 'JavaScript code to evaluate' }
        },
        required: ['script']
      }
    },
    {
      name: 'get_elements',
      description: 'Get elements matching a CSS selector',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to match elements' },
          limit: { type: 'integer', description: 'Maximum number of elements to return', default: 10 }
        },
        required: ['selector']
      }
    },
    {
      name: 'wait_for_element',
      description: 'Wait for an element to appear on the page',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the element to wait for' },
          timeout: { type: 'integer', description: 'Maximum time to wait in milliseconds', default: 30000 }
        },
        required: ['selector']
      }
    },
    {
      name: 'manage_cookies',
      description: 'Get, set, or delete cookies',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'delete'], description: 'Action to perform' },
          cookies: { 
            type: 'array', 
            description: 'Cookies to set (only for set action)',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Cookie name' },
                value: { type: 'string', description: 'Cookie value' },
                domain: { type: 'string', description: 'Cookie domain' },
                path: { type: 'string', description: 'Cookie path', default: '/' }
              },
              required: ['name', 'value']
            }
          },
          names: { 
            type: 'array', 
            description: 'Cookie names to delete (only for delete action)',
            items: { type: 'string' }
          }
        },
        required: ['action']
      }
    },
    {
      name: 'download_file',
      description: 'Download a file from a URL',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL of the file to download' },
          filename: { type: 'string', description: 'Name to save the file as (optional)' }
        },
        required: ['url']
      }
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
      input_schema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Name of the file' },
          content: { type: 'string', description: 'Content to write' }
        },
        required: ['filename', 'content']
      }
    }
  ];

  res.json({ tools });
});
/**
 * @swagger
 * /api/sessions/{session_id}/chat:
 *   post:
 *  tags:
 *      - Sessions
 *     summary: Send a chat message
 *     description: Processes a chat message in the specified session
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: The message to process
 *     responses:
 *       200:
 *         description: Message processed successfully
 *       404:
 *         description: Session not found
 */
app.post('/api/sessions/:session_id/chat', (req, res) => {
  const { session_id } = req.params;
  const { message } = req.body;
  
  if (!sessions[session_id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Update last activity timestamp
  sessions[session_id].last_activity = new Date().toISOString();
  
  // For now, just acknowledge the message
  res.json({ success: true, message: 'Message received, processing started' });
  
  // In a real implementation, you would process the message with client.js
  // and store responses for retrieval via the /responses endpoint
});

/**
 * @swagger
 * /api/sessions/{session_id}/task:
 *   post:
 *    tags:
 *      - Sessions
 *     summary: Execute a task
 *     description: Executes a task in the specified session
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               task:
 *                 type: string
 *                 description: The task to execute
 *     responses:
 *       200:
 *         description: Task execution started
 *       404:
 *         description: Session not found
 */
app.post('/api/sessions/:session_id/task', (req, res) => {
  const { session_id } = req.params;
  const { task } = req.body;
  
  if (!sessions[session_id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Update last activity timestamp
  sessions[session_id].last_activity = new Date().toISOString();
  
  // For now, just acknowledge the task
  res.json({ success: true, message: 'Task received, execution started' });
  
  // In a real implementation, you would execute the task with client.js
  // and store responses for retrieval via the /responses endpoint
});

/**
 * @swagger
 * /api/sessions:
 *   post: 
 *     tags:
 *       - Sessions
 *     summary: Create a new session
 *     description: Creates a new browser session
 *     responses:
 *       200:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session_id:
 *                   type: string
 *                   example: 123e4567-e89b-12d3-a456-426614174000
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-01-01T00:00:00.000Z
 */
app.post('/api/sessions', async (req, res) => {
  try {
    const sessionId = uuidv4();
    sessions[sessionId] = {
      id: sessionId,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString()
    };
    
    // Initialize browser context
    await getOrCreateContext(sessionId);
    
    res.json({
      session_id: sessionId,
      created_at: sessions[sessionId].created_at
    });
  } catch (error) {
    logger.error(`Error creating session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{session_id}:
 *   get: 
 *     tags:
 *       - Sessions
 *     summary: Get session information
 *     description: Returns information about a specific session
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session to get
 *     responses:
 *       200:
 *         description: Session information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 123e4567-e89b-12d3-a456-426614174000
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-01-01T00:00:00.000Z
 *                 last_activity:
 *                   type: string
 *                   format: date-time
 *                   example: 2023-01-01T00:10:00.000Z
 *       404:
 *         description: Session not found
 */
app.get('/api/sessions/:session_id', (req, res) => {
  const { session_id } = req.params;
  
  if (!sessions[session_id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(sessions[session_id]);
});

/**
 * @swagger
 * /api/sessions/{session_id}:
 *   delete: 
 *     tags:
 *       - Sessions
 *     summary: Delete a session
 *     description: Closes a browser session and cleans up resources
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session to delete
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Session 123e4567-e89b-12d3-a456-426614174000 cleaned up successfully
 *       404:
 *         description: Session not found
 *       500:
 *         description: Error cleaning up session
 */
app.delete('/api/sessions/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    
    if (!sessions[session_id]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    await cleanupContext(session_id);
    delete sessions[session_id];
    
    res.json({ message: `Session ${session_id} cleaned up successfully` });
  } catch (error) {
    logger.error(`Error cleaning up session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/screenshots/{session_id}:
 *   get: 
 *     tags:
 *       - Resources
 *     summary: Get screenshots for a session
 *     description: Returns a list of screenshots for a specific session
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session
 *     responses:
 *       200:
 *         description: List of screenshots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 screenshots:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                         example: screenshot_123.png
 *                       path:
 *                         type: string
 *                         example: screenshots/123e4567-e89b-12d3-a456-426614174000/screenshot_123.png
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: 2023-01-01T00:00:00.000Z
 *       404:
 *         description: Session not found or no screenshots available
 */
app.get('/api/screenshots/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;
    
    if (!sessions[session_id]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const screenshotDir = path.join('screenshots', session_id);
    
    if (!fs.existsSync(screenshotDir)) {
      return res.json({ screenshots: [] });
    }
    
    const files = fs.readdirSync(screenshotDir);
    const screenshots = files.map(file => {
      const filePath = path.join(screenshotDir, file);
      const stats = fs.statSync(filePath);
      
      return {
        filename: file,
        path: filePath,
        created_at: stats.ctime.toISOString()
      };
    });
    
    res.json({ screenshots });
  } catch (error) {
    logger.error(`Error getting screenshots: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/downloads/{session_id}:
 *   get: 
 *     tags:
 *       - Resources
 *     summary: Get downloads for a session
 *     description: Returns a list of downloaded files for a specific session
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session
 *     responses:
 *       200:
 *         description: List of downloaded files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 downloads:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                         example: file.pdf
 *                       path:
 *                         type: string
 *                         example: downloads/123e4567-e89b-12d3-a456-426614174000/file.pdf
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: 2023-01-01T00:00:00.000Z
 *       404:
 *         description: Session not found or no downloads available
 */
app.get('/api/downloads/:session_id', (req, res) => {
  try {
    const { session_id } = req.params;
    
    if (!sessions[session_id]) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const downloadsDir = path.join('downloads', session_id);
    
    if (!fs.existsSync(downloadsDir)) {
      return res.json({ downloads: [] });
    }
    
    const files = fs.readdirSync(downloadsDir);
    const downloads = files.map(file => {
      const filePath = path.join(downloadsDir, file);
      const stats = fs.statSync(filePath);
      
      return {
        filename: file,
        path: filePath,
        created_at: stats.ctime.toISOString()
      };
    });
    
    res.json({ downloads });
  } catch (error) {
    logger.error(`Error getting downloads: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/tools/execute:
 *   post: 
 *     tags:
 *       - Tools
 *     summary: Execute a tool
 *     description: Executes a browser automation tool
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tool_name:
 *                 type: string
 *                 description: Name of the tool to execute
 *                 example: navigate
 *               arguments:
 *                 type: object
 *                 description: Arguments for the tool
 *                 example: {"url": "https://example.com"}
 *               session_id:
 *                 type: string
 *                 description: Session ID
 *                 example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: Tool executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 result:
 *                   type: object
 *       400:
 *         description: Unknown tool or invalid arguments
 *       500:
 *         description: Error executing tool
 */
app.post('/api/tools/execute', async (req, res) => {
  try {
    const { tool_name, arguments: args, session_id } = req.body;
    const sessionId = session_id || uuidv4();
    
    logger.info(`Executing tool '${tool_name}' for session ${sessionId}`);

    // Update last activity timestamp
    if (sessions[sessionId]) {
      sessions[sessionId].last_activity = new Date().toISOString();
    } else {
      // Create session if it doesn't exist
      sessions[sessionId] = {
        id: sessionId,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      };
    }

    // Get or create context
    const context = await getOrCreateContext(sessionId);

    // Route to appropriate tool function
    let result;
    switch (tool_name) {
      case 'navigate':
        result = await navigateTool(args.url, context);
        break;
      case 'screenshot':
        result = await screenshotTool(context);
        break;
      case 'click':
        result = await clickTool(args.x, args.y, context);
        break;
      case 'click_element':
        result = await clickElementTool(args.selector, context);
        break;
      case 'scroll':
        result = await scrollTool(args.direction, args.amount, context);
        break;
      case 'type':
        result = await typeTool(args.text, context, args.submit);
        break;
      case 'fill_form':
        result = await fillFormTool(args.fields, context, args.submit);
        break;
      case 'get_page_info':
        result = await getPageInfoTool(context);
        break;
      case 'get_page_content':
        result = await getPageContentTool(context);
        break;
      case 'evaluate_script':
        result = await evaluateScriptTool(args.script, context);
        break;
      case 'get_elements':
        result = await getElementsTool(args.selector, context, args.limit || 10);
        break;
      case 'wait_for_element':
        result = await waitForElementTool(args.selector, context, args.timeout || 30000);
        break;
      case 'manage_cookies':
        result = await manageCookiesTool(args.action, context, args.cookies, args.names);
        break;
      case 'download_file':
        result = await downloadFileTool(args.url, context, args.filename);
        break;
      case 'write_file':
        result = writeFileTool(args.filename, args.content, context);
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          error: `Unknown tool: ${tool_name}` 
        });
    }

    logger.info(`Tool '${tool_name}' executed successfully for session ${sessionId}`);
    return res.json({ success: true, result });
  } catch (error) {
    logger.error(`Error executing tool: ${error.message}`);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * @swagger
 * /api/resources/{session_id}/{filename}:
 *   get: 
 *     tags:
 *       - Resources
 *     summary: Get a resource
 *     description: Returns the content of a resource file
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the file to get
 *     responses:
 *       200:
 *         description: Resource content
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uri:
 *                   type: string
 *                   example: artifact://123e4567-e89b-12d3-a456-426614174000/file.txt
 *                 content:
 *                   type: string
 *                   example: File content here
 *       404:
 *         description: Resource not found
 */
app.get('/api/resources/:session_id/:filename', (req, res) => {
  try {
    const { session_id, filename } = req.params;
    const filePath = path.join('artifacts', session_id, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ 
      uri: `artifact://${session_id}/${filename}`, 
      content 
    });
  } catch (error) {
    logger.error(`Error getting resource: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/sessions/{session_id}/responses:
 *   get:
 *     tags:
 *       - Sessions
 *     summary: Get pending responses for a session
 *     description: Returns any pending responses for the specified session
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the session
 *     responses:
 *       200:
 *         description: List of pending responses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 responses:
 *                   type: array
 *                   items:
 *                     type: object
 *       404:
 *         description: Session not found
 */
app.get('/api/sessions/:session_id/responses', (req, res) => {
  const { session_id } = req.params;
  
  if (!sessions[session_id]) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Update last activity timestamp
  sessions[session_id].last_activity = new Date().toISOString();
  
  // Since we don't have a pending responses mechanism in server.js,
  // just return an empty array for now
  res.json({ responses: [] });
});

// Get or create browser context
async function getOrCreateContext(sessionId) {
  if (!contexts[sessionId]) {
    logger.info(`Creating new context for session: ${sessionId}`);

    // Initialize Playwright
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--window-size=1920,1080'
      ]
    });

    // Create browser context
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Create page
    const page = await context.newPage();

    // Setup download behavior
    const downloadsDir = path.join('downloads', sessionId);
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    await context.route('**/*.{png,jpg,jpeg,pdf,doc,docx,xls,xlsx,csv}', async (route) => {
      const url = route.request().url();
      const filename = url.split('/').pop().split('?')[0];
      const downloadPath = path.join(downloadsDir, filename);
      
      try {
        const response = await route.fetch();
        const buffer = await response.body();
        fs.writeFileSync(downloadPath, buffer);
        logger.info(`Downloaded file: ${filename} to ${downloadPath}`);
        await route.continue();
      } catch (error) {
        logger.error(`Error downloading file: ${error.message}`);
        await route.continue();
      }
    });

    // Store context
    contexts[sessionId] = {
      browser,
      context,
      page,
      sessionId
    };

    logger.info(`Context created successfully for session: ${sessionId}`);
  }

  return contexts[sessionId];
}

// Tool implementations
async function navigateTool(url, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Navigating to: ${url}`);

    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const title = await page.title();
    const currentUrl = page.url();

    return {
      title,
      url: currentUrl,
      status_code: response ? response.status() : null
    };
  } catch (error) {
    logger.error(`Error navigating to ${url}: ${error.message}`);
    return { error: `Failed to navigate to ${url}: ${error.message}` };
  }
}

async function screenshotTool(ctx) {
  try {
    const page = ctx.page;
    const sessionId = ctx.sessionId;

    // Create screenshot directory
    const screenshotDir = path.join('screenshots', sessionId);
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const filename = path.join(screenshotDir, `screenshot_${uuidv4()}.png`);
    await page.screenshot({ path: filename, fullPage: true });

    logger.info(`Screenshot saved: ${filename}`);
    return { filename, path: filename };
  } catch (error) {
    logger.error(`Error taking screenshot: ${error.message}`);
    return { error: `Failed to take screenshot: ${error.message}` };
  }
}

async function clickTool(x, y, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Clicking at coordinates: (${x}, ${y})`);

    await page.mouse.click(x, y);
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { clicked_at: { x, y } };
  } catch (error) {
    logger.error(`Error clicking at (${x}, ${y}): ${error.message}`);
    return { error: `Failed to click at (${x}, ${y}): ${error.message}` };
  }
}

async function clickElementTool(selector, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Clicking element with selector: ${selector}`);

    await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    await page.click(selector);
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { clicked_element: selector };
  } catch (error) {
    logger.error(`Error clicking element ${selector}: ${error.message}`);
    return { error: `Failed to click element ${selector}: ${error.message}` };
  }
}

async function scrollTool(direction, amount, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Scrolling ${direction} by ${amount} pixels`);

    if (direction.toLowerCase() === 'down') {
      await page.evaluate(`window.scrollBy(0, ${amount})`);
    } else if (direction.toLowerCase() === 'up') {
      await page.evaluate(`window.scrollBy(0, -${amount})`);
    } else {
      return { error: `Invalid direction: ${direction}` };
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    return { scrolled: true, direction, amount };
  } catch (error) {
    logger.error(`Error scrolling ${direction}: ${error.message}`);
    return { error: `Failed to scroll ${direction}: ${error.message}` };
  }
}

async function typeTool(text, ctx, submit = false) {
  try {
    const page = ctx.page;
    logger.info(`Typing text: '${text}'`);

    await page.keyboard.type(text);

    if (submit) {
      logger.info('Pressing Enter to submit');
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return { typed: true, text, submitted: submit };
  } catch (error) {
    logger.error(`Error typing text: ${error.message}`);
    return { error: `Failed to type text: ${error.message}` };
  }
}

async function fillFormTool(fields, ctx, submit = false) {
  try {
    const page = ctx.page;
    logger.info(`Filling form with ${fields.length} fields`);

    const results = [];

    for (const field of fields) {
      try {
        await page.waitForSelector(field.selector, { state: 'visible', timeout: 5000 });
        await page.fill(field.selector, field.value);
        results.push({ selector: field.selector, success: true });
      } catch (error) {
        logger.error(`Error filling field ${field.selector}: ${error.message}`);
        results.push({ selector: field.selector, success: false, error: error.message });
      }
    }

    if (submit) {
      logger.info('Submitting form');
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return { filled: results, submitted: submit };
  } catch (error) {
    logger.error(`Error filling form: ${error.message}`);
    return { error: `Failed to fill form: ${error.message}` };
  }
}

async function getPageInfoTool(ctx) {
  try {
    const page = ctx.page;
    const title = await page.title();
    return `Current page: Title='${title}', URL='${page.url()}'`;
  } catch (error) {
    logger.error(`Error getting page info: ${error.message}`);
    return `Error getting page info: ${error.message}`;
  }
}

async function getPageContentTool(ctx) {
  try {
    const page = ctx.page;
    const content = await page.content();
    return { content };
  } catch (error) {
    logger.error(`Error getting page content: ${error.message}`);
    return { error: `Failed to get page content: ${error.message}` };
  }
}

async function evaluateScriptTool(script, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Evaluating JavaScript code on page`);

    const result = await page.evaluate(script);
    return { result };
  } catch (error) {
    logger.error(`Error evaluating script: ${error.message}`);
    return { error: `Failed to evaluate script: ${error.message}` };
  }
}

async function getElementsTool(selector, ctx, limit) {
  try {
    const page = ctx.page;
    logger.info(`Getting elements matching selector: ${selector} (limit: ${limit})`);

    const elements = await page.$$eval(selector, (els, limit) => {
      return els.slice(0, limit).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          text: el.textContent,
          attributes: Object.fromEntries(
            Array.from(el.attributes).map(attr => [attr.name, attr.value])
          ),
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          isVisible: 
            rect.width > 0 && 
            rect.height > 0 && 
            window.getComputedStyle(el).display !== 'none' && 
            window.getComputedStyle(el).visibility !== 'hidden'
        };
      });
    }, limit);

    return { elements, count: elements.length };
  } catch (error) {
    logger.error(`Error getting elements with selector ${selector}: ${error.message}`);
    return { error: `Failed to get elements: ${error.message}` };
  }
}

async function waitForElementTool(selector, ctx, timeout) {
  try {
    const page = ctx.page;
    logger.info(`Waiting for element with selector: ${selector} (timeout: ${timeout}ms)`);

    const startTime = Date.now();
    await page.waitForSelector(selector, { state: 'visible', timeout });
    const elapsed = Date.now() - startTime;

    return { 
      found: true, 
      selector, 
      elapsed_ms: elapsed
    };
  } catch (error) {
    logger.error(`Error waiting for element ${selector}: ${error.message}`);
    return { 
      found: false, 
      selector, 
      error: `Failed to find element: ${error.message}` 
    };
  }
}

async function manageCookiesTool(action, ctx, cookies, names) {
  try {
    const context = ctx.context;
    logger.info(`Managing cookies with action: ${action}`);

    switch (action.toLowerCase()) {
      case 'get':
        const currentCookies = await context.cookies();
        return { cookies: currentCookies };
      
      case 'set':
        if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
          return { error: 'No cookies provided to set' };
        }
        await context.addCookies(cookies);
        return { set: true, count: cookies.length };
      
      case 'delete':
        if (names && Array.isArray(names) && names.length > 0) {
          const currentCookies = await context.cookies();
          const cookiesToKeep = currentCookies.filter(cookie => !names.includes(cookie.name));
          await context.clearCookies();
          if (cookiesToKeep.length > 0) {
            await context.addCookies(cookiesToKeep);
          }
          return { deleted: true, count: currentCookies.length - cookiesToKeep.length };
        } else {
          await context.clearCookies();
          return { deleted: true, all: true };
        }
      
      default:
        return { error: `Invalid action: ${action}` };
    }
  } catch (error) {
    logger.error(`Error managing cookies: ${error.message}`);
    return { error: `Failed to manage cookies: ${error.message}` };
  }
}

async function downloadFileTool(url, ctx, customFilename) {
  try {
    const page = ctx.page;
    const sessionId = ctx.sessionId;
    logger.info(`Downloading file from URL: ${url}`);

    const downloadsDir = path.join('downloads', sessionId);
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Get filename from URL if not provided
    const urlFilename = url.split('/').pop().split('?')[0];
    const filename = customFilename || urlFilename;
    const downloadPath = path.join(downloadsDir, filename);

    // Use fetch to download the file
    const response = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      const blob = await response.blob();
      return { 
        base64: await new Promise(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        }),
        contentType
      };
    }, url);

    // Write the file
    fs.writeFileSync(downloadPath, Buffer.from(response.base64, 'base64'));

    return { 
      downloaded: true, 
      filename, 
      path: downloadPath,
      content_type: response.contentType
    };
  } catch (error) {
    logger.error(`Error downloading file from ${url}: ${error.message}`);
    return { error: `Failed to download file: ${error.message}` };
  }
}

function writeFileTool(filename, content, ctx) {
  try {
    const sessionId = ctx.sessionId;
    const artifactsDir = path.join('artifacts', sessionId);
    
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const fullPath = path.join(artifactsDir, filename);
    logger.info(`Writing to file: ${fullPath}`);

    fs.writeFileSync(fullPath, content, 'utf-8');

    return { filename, path: fullPath, written: true };
  } catch (error) {
    logger.error(`Error writing file: ${error.message}`);
    return { error: `Failed to write file: ${error.message}` };
  }
}

// Cleanup context
async function cleanupContext(sessionId) {
  if (contexts[sessionId]) {
    try {
      const { page, context, browser } = contexts[sessionId];
      
      if (page) await page.close();
      if (context) await context.close();
      if (browser) await browser.close();
      
      delete contexts[sessionId];
      logger.info(`Context ${sessionId} cleaned up`);
    } catch (error) {
      logger.error(`Error cleaning up context ${sessionId}: ${error.message}`);
      throw error;
    }
  }
}

// Cleanup inactive sessions periodically
setInterval(async () => {
  const now = Date.now();
  const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
  
  for (const sessionId in sessions) {
    const session = sessions[sessionId];
    const lastActivity = new Date(session.last_activity).getTime();
    
    if (now - lastActivity > inactiveThreshold) {
      logger.info(`Cleaning up inactive session: ${sessionId}`);
      try {
        await cleanupContext(sessionId);
        delete sessions[sessionId];
      } catch (error) {
        logger.error(`Error cleaning up inactive session ${sessionId}: ${error.message}`);
      }
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes

// Handle process termination
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  
  // Clean up all browser contexts
  for (const sessionId in contexts) {
    await cleanupContext(sessionId);
  }
  
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`MCP Server HTTP API is running on port ${PORT}`);
  logger.info(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
});

module.exports = app;
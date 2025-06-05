const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const winston = require('winston');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const http = require('http');
const jwt = require('jsonwebtoken');

// Import authentication middleware
const { authenticateJWT } = require('./authMiddleware');

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
['screenshots', 'artifacts'].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Global storage for browser contexts
const contexts = {};

// Express app setup
const app = express();
app.use(express.json());

// Configure CORS
const corsOptions = {
  origin: process.env.FRONTEND_URL || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  credentials: true
};
app.use(cors(corsOptions));

// Security enhancements
app.use(helmet({
  contentSecurityPolicy: false  // Disable CSP for simplicity in development
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', limiter);

// Setup Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCP Server API',
      version: '1.0.0',
      description: 'API documentation for the MCP Server',
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:8080',
        description: 'MCP Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./server.js'], // Path to the API docs
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Apply authentication middleware to all routes except health check
app.use(authenticateJWT);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
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
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-server' });
});

/**
 * @swagger
 * /tools:
 *   get:
 *     summary: List available tools
 *     description: Returns a list of all available tools
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of tools
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
 *                       description:
 *                         type: string
 *                       input_schema:
 *                         type: object
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Invalid token
 */
app.get('/tools', (req, res) => {
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
      name: 'get_page_info',
      description: 'Get information about the current page',
      input_schema: { type: 'object', properties: {} }
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

// Get or create browser context
async function getOrCreateContext(sessionId) {
  if (!contexts[sessionId]) {
    logger.info(`Creating new context for session: ${sessionId}`);

    // Initialize Playwright
    const browser = await chromium.launch({
      headless: true,
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

/**
 * @swagger
 * /tools/execute:
 *   post:
 *     summary: Execute a tool
 *     description: Executes a specified tool with given arguments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tool_name
 *             properties:
 *               tool_name:
 *                 type: string
 *                 description: Name of the tool to execute
 *               arguments:
 *                 type: object
 *                 description: Arguments for the tool
 *               session_id:
 *                 type: string
 *                 description: Session ID
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
 *                 result:
 *                   type: object
 *       400:
 *         description: Bad request - Unknown tool
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Invalid token
 *       500:
 *         description: Server error
 */
app.post('/tools/execute', async (req, res) => {
  try {
    const { tool_name, arguments: args, session_id } = req.body;
    const sessionId = session_id || uuidv4();
    
    logger.info(`Executing tool '${tool_name}' for session ${sessionId}`);

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
      case 'scroll':
        result = await scrollTool(args.direction, args.amount, context);
        break;
      case 'type':
        result = await typeTool(args.text, context, args.submit);
        break;
      case 'get_page_info':
        result = await getPageInfoTool(context);
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
 * /resources/{session_id}/{filename}:
 *   get:
 *     summary: Get a resource
 *     description: Retrieves a specified resource
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Filename
 *     responses:
 *       200:
 *         description: Resource retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uri:
 *                   type: string
 *                 content:
 *                   type: string
 *       404:
 *         description: Resource not found
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Invalid token
 *       500:
 *         description: Server error
 */
app.get('/resources/:session_id/:filename', (req, res) => {
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
 * /screenshots/{session_id}/{filename}:
 *   get:
 *     summary: Get a screenshot
 *     description: Retrieves a screenshot image
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: Filename
 *     responses:
 *       200:
 *         description: Screenshot retrieved successfully
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Screenshot not found
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Invalid token
 *       500:
 *         description: Server error
 */
app.get('/screenshots/:session_id/:filename', (req, res) => {
  try {
    const { session_id, filename } = req.params;
    const filePath = path.join('screenshots', session_id, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Screenshot not found' });
    }

    res.sendFile(path.resolve(filePath));
  } catch (error) {
    logger.error(`Error getting screenshot: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /sessions/{session_id}:
 *   delete:
 *     summary: Delete a session
 *     description: Cleans up a specified session
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID
 *     responses:
 *       200:
 *         description: Session cleaned up successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Invalid token
 *       500:
 *         description: Server error
 */
app.delete('/sessions/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    await cleanupContext(session_id);
    res.json({ message: `Session ${session_id} cleaned up successfully` });
  } catch (error) {
    logger.error(`Error cleaning up session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

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

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error'
  });
});

// Create HTTP server - no WebSocket
const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// Start server
server.listen(PORT, () => {
  logger.info(`MCP Server HTTP API running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  
  // Clean up all browser contexts
  for (const sessionId in contexts) {
    await cleanupContext(sessionId);
  }
  
  process.exit(0);
});

module.exports = { app, server };
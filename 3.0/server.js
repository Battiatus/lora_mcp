const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const winston = require('winston');

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
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-server' });
});

// List available tools
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

// Execute tool endpoint
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

// Get resource
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

// Delete session
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
});

module.exports = app;
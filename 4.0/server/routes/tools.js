const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getContextManager } = require('../services/context-manager');
const { validateSchema } = require('../middleware/schema-validator');
const { checkRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { toolExecuteSchema, toolListSchema } = require('../schemas/tool-schemas');
const router = express.Router();

/**
 * @swagger
 * /api/tools:
 *   get:
 *     summary: List all available tools
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of available tools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 tools:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tool'
 */
router.get('/', checkRole(['user', 'admin']), async (req, res, next) => {
  try {
    const contextManager = getContextManager();
    const tools = await contextManager.listTools();
    
    res.json({
      success: true,
      tools
    });
  } catch (error) {
    logger.error(`Error listing tools: ${error.message}`, { 
      userId: req.user.uid,
      error: error.stack
    });
    next(error);
  }
});

/**
 * @swagger
 * /api/tools/execute:
 *   post:
 *     summary: Execute a tool
 *     tags: [Tools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ToolExecuteRequest'
 *     responses:
 *       200:
 *         description: Tool execution result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 result:
 *                   type: object
 */
router.post('/execute', checkRole(['user', 'admin']), validateSchema(toolExecuteSchema), async (req, res, next) => {
  try {
    const { tool_name, arguments: toolArgs, session_id } = req.body;
    const sessionId = session_id || uuidv4();
    
    logger.info(`Executing tool '${tool_name}' for session ${sessionId}`, {
      userId: req.user.uid,
      sessionId,
      tool: tool_name,
      arguments: toolArgs
    });
    
    const contextManager = getContextManager();
    const context = await contextManager.getOrCreateContext(sessionId);
    
    // Execute the tool
    const result = await contextManager.executeTool(tool_name, toolArgs, context);
    
    logger.info(`Tool '${tool_name}' executed successfully for session ${sessionId}`, {
      userId: req.user.uid,
      sessionId
    });
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error(`Error executing tool: ${error.message}`, {
      userId: req.user.uid,
      sessionId: req.body.session_id,
      tool: req.body.tool_name,
      error: error.stack
    });
    next(error);
  }
});

module.exports = {
  toolRouter: router
};
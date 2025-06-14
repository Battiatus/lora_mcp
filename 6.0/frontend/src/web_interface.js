const express = require('express');
const http = require('http');
const path = require('path');
const winston = require('winston');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');

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
    new winston.transports.File({ filename: 'web-interface.log' })
  ]
});

// Configuration de l'URL du client MCP
const CLIENT_SERVER_URL = process.env.CLIENT_SERVER_URL || 'http://localhost:8081';

// Express app
const app = express();
const server = http.createServer(app);

// Add middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'static')));

// Définition des routes API qui proxient vers le serveur client

// Session management
app.post('/api/sessions', async (req, res) => {
  try {
    logger.info('Creating new session via client server');
    const response = await axios.post(`${CLIENT_SERVER_URL}/api/sessions`);
    res.json(response.data);
  } catch (error) {
    logger.error(`Error creating session: ${error.message}`);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await axios.get(`${CLIENT_SERVER_URL}/api/sessions/${sessionId}`);
    res.json(response.data);
  } catch (error) {
    logger.error(`Error getting session info: ${error.message}`);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await axios.delete(`${CLIENT_SERVER_URL}/api/sessions/${sessionId}`);
    res.json(response.data);
  } catch (error) {
    logger.error(`Error deleting session: ${error.message}`);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

// Route de polling pour obtenir les réponses en attente
app.get('/api/sessions/:sessionId/responses', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await axios.get(`${CLIENT_SERVER_URL}/api/sessions/${sessionId}/responses`);
    res.json(response.data);
  } catch (error) {
    logger.error(`Error getting responses: ${error.message}`);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

// Chat endpoint
app.post('/api/sessions/:sessionId/chat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    logger.info(`Sending chat message to session ${sessionId}: ${message.substring(0, 50)}...`);
    const response = await axios.post(`${CLIENT_SERVER_URL}/api/sessions/${sessionId}/chat`, { message });
    res.json(response.data);
  } catch (error) {
    logger.error(`Error in chat endpoint: ${error.message}`);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

// Task execution endpoint
app.post('/api/sessions/:sessionId/task', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { task } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }
    
    logger.info(`Sending task to session ${sessionId}: ${task.substring(0, 50)}...`);
    const response = await axios.post(`${CLIENT_SERVER_URL}/api/sessions/${sessionId}/task`, { task });
    res.json(response.data);
  } catch (error) {
    logger.error(`Error in task endpoint: ${error.message}`);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.error || error.message 
    });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Vérifier aussi la santé du serveur client
    const clientHealth = await axios.get(`${CLIENT_SERVER_URL}/health`);
    res.json({ 
      status: 'healthy', 
      service: 'mcp-web-interface',
      client_server: clientHealth.data.status || 'unknown'
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    res.json({ 
      status: 'degraded', 
      service: 'mcp-web-interface',
      client_server: 'unavailable',
      error: error.message
    });
  }
});

// Serve React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Start server
const PORT = process.env.WEB_INTERFACE_PORT || 8082;
server.listen(PORT, () => {
  logger.info(`MCP Web Interface running on port ${PORT}`);
  logger.info(`Connected to client server at ${CLIENT_SERVER_URL}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down web interface...');
  process.exit(0);
});
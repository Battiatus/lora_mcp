const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./firebase-service-account.json');
const { toolRouter } = require('./routes/tools.js');
const { sessionsRouter } = require('./routes/sessions');
const { resourcesRouter } = require('./routes/resources');
const { setupLogging } = require('./middleware/logging');
const { authenticateJWT } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');
const { rateLimiter } = require('./middleware/rate-limiter');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Create Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcp-server' },
  transports: [
    new winston.transports.Console(),
    // Firebase Logging Transport will be added by setupLogging
  ]
});

// Create Express app
const app = express();

// Apply middleware
app.use(helmet()); // Security headers
app.use(cors({ 
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true 
}));
app.use(express.json());
app.use(rateLimiter); // Rate limiting
app.use(setupLogging(logger, admin)); // Logging

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-server' });
});

// API documentation (no auth required)
app.use('/api-docs', express.static('docs'));

// Protected routes
app.use('/api/tools', authenticateJWT, toolRouter);
app.use('/api/sessions', authenticateJWT, sessionsRouter);
app.use('/api/resources', authenticateJWT, resourcesRouter);

// Error handling
app.use(errorHandler);

// Export for testing and starting
module.exports = { app, logger };
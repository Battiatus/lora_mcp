// app.js - Configuration principale de l'application Express révisée
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { rateLimit } = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const dotenv = require('dotenv');

// Chargement des variables d'environnement
dotenv.config();

// Importation des utilitaires et middleware
const { logger } = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const specs = require('./config/swagger');

// Importation des routes
const authRoutes = require('./routes/authRoutes');
const toolRoutes = require('./routes/toolRoutes');

// Initialisation de l'application Express
const app = express();

// Configuration des middleware de base
app.use(helmet({
  // Désactiver certaines protections qui peuvent causer des problèmes
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
})); 
app.use(compression()); // Compression des réponses
app.use(express.json({ limit: '10mb' })); // Parsing JSON avec limite
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration du logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Permettre toutes les origines CORS (en désactivant totalement la sécurité CORS)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Répondre immédiatement aux requêtes OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Limiteur de débit global pour prévenir les attaques par force brute
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limite chaque IP à 100 requêtes par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Trop de requêtes, veuillez réessayer après un moment'
  }
});
app.use('/api', apiLimiter);

// Routes de santé et version (non protégées)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'mcp-server-api',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Documentation Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: "MCP Server API Documentation"
}));

// Ajout d'un ping endpoint pour vérifier si le serveur est actif
app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/tools', toolRoutes);

// Route 404 pour les endpoints non trouvés
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `La route ${req.originalUrl} n'existe pas`
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mcp-web-interface' });
});


// Middleware de gestion d'erreurs global amélioré
app.use(errorHandler);

module.exports = app;
const express = require('express');
const cors = require('cors');
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
app.use(helmet()); // Sécurité des en-têtes HTTP
app.use(compression()); // Compression des réponses
app.use(express.json({ limit: '10mb' })); // Parsing JSON avec limite
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration du logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Configuration CORS
// const corsOptions = {
//   origin: process.env.FRONTEND_URL || '*',
//   methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
//   preflightContinue: false,
//   optionsSuccessStatus: 204,
//   credentials: true,
//   allowedHeaders: ['Content-Type', 'Authorization']
// };

app.use(cors({
  origin: [process.env.FRONTEND_URL, 'http://127.0.0.1:3000'],  // Origines autorisées (frontend)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],        // Méthodes autorisées
  allowedHeaders: ['Content-Type', 'Authorization'],           // En-têtes autorisés
  credentials: true                                            // Autoriser les cookies (si nécessaire)
}));

// app.use(cors(corsOptions));

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

// Middleware de gestion d'erreurs global
app.use(errorHandler);

module.exports = app;
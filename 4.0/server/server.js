const app = require('./app');
const { logger } = require('./utils/logger');

// Configuration du port
const PORT = process.env.PORT || 8080;

// Démarrage du serveur
const server = app.listen(PORT, () => {
  logger.info(`🚀 MCP Server API is running on port ${PORT}`);
  logger.info(`📚 Documentation API disponible sur http://localhost:${PORT}/api-docs`);
});

// Gestion de l'arrêt gracieux
process.on('SIGINT', async () => {
  logger.info('🛑 Arrêt du serveur en cours...');
  
  // Fermeture du serveur HTTP
  server.close(() => {
    logger.info('✅ Serveur HTTP arrêté');
    process.exit(0);
  });
  
  // Si le serveur ne s'arrête pas dans les 5 secondes, on force la fermeture
  setTimeout(() => {
    logger.error('⚠️ Échec de l\'arrêt gracieux, arrêt forcé');
    process.exit(1);
  }, 5000);
});

module.exports = server;
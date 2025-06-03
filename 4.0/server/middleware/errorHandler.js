const { logger } = require('../utils/logger');

/**
 * Gestionnaire d'erreurs global pour l'application
 */
const errorHandler = (err, req, res, next) => {
  // Journalisation de l'erreur
  logger.error(`Erreur: ${err.message}`);
  logger.error(err.stack);

  // Déterminer le code d'état HTTP
  // Par défaut 500 sauf si spécifié dans l'erreur
  const statusCode = err.statusCode || 500;
  
  // En production, ne pas exposer les détails des erreurs de serveur
  const isProd = process.env.NODE_ENV === 'production';
  
  // Message d'erreur pour l'utilisateur
  const errorMessage = statusCode === 500 && isProd
    ? 'Erreur serveur interne'
    : err.message;

  // Construire la réponse d'erreur
  const errorResponse = {
    status: 'error',
    message: errorMessage
  };
  
  // En développement, inclure la pile d'erreurs pour le débogage
  if (!isProd && err.stack) {
    errorResponse.stack = err.stack;
  }
  
  // Ajouter des détails supplémentaires si disponibles
  if (err.errors) {
    errorResponse.errors = err.errors;
  }

  // Envoyer la réponse d'erreur
  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
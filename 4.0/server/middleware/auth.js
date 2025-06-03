const { auth } = require('../config/firebase');
const { logger } = require('../utils/logger');

/**
 * Middleware pour vérifier l'authentification et l'autorisation
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Accès non autorisé',
        error: 'Token d\'authentification manquant'
      });
    }

    // Extraire le token
    const idToken = authHeader.split('Bearer ')[1];

    try {
      // Vérifier le token avec Firebase
      const decodedToken = await auth.verifyIdToken(idToken);
      
      // Ajouter les informations utilisateur à la requête
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        role: decodedToken.role || 'user'
      };
      
      next();
    } catch (error) {
      logger.error(`Erreur d'authentification: ${error.message}`);
      
      return res.status(401).json({
        status: 'error',
        message: 'Accès non autorisé',
        error: 'Token invalide ou expiré'
      });
    }
  } catch (error) {
    logger.error(`Erreur middleware auth: ${error.message}`);
    next(error);
  }
};

/**
 * Middleware pour vérifier les rôles utilisateur
 * @param {Array} roles - Tableau des rôles autorisés
 */
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Utilisateur non authentifié'
      });
    }

    const userRole = req.user.role || 'user';
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: 'Accès interdit',
        error: 'Vous n\'avez pas les permissions nécessaires'
      });
    }
    
    next();
  };
};

module.exports = {
  authenticate,
  checkRole
};
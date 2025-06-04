const axios = require('axios');
const { logger } = require('../utils/logger');

/**
 * Middleware pour vérifier l'authentification et l'autorisation
 * Utilise l'API REST Firebase Auth au lieu d'un service account
 */
const authenticate = async (req, res, next) => {
  try {
    // Si aucune authentification n'est requise (pour le développement)
    if (process.env.SKIP_AUTH === 'true') {
      // Simuler un utilisateur connecté
      req.user = {
        uid: 'dev-user',
        email: 'dev@example.com',
        emailVerified: true,
        role: 'admin'
      };
      return next();
    }

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
      // Vérifier le token directement avec l'API REST Firebase
      // Au lieu d'utiliser firebase-admin qui nécessite un service account
      const firebaseApiKey = process.env.FIREBASE_API_KEY;
      if (!firebaseApiKey) {
        throw new Error('FIREBASE_API_KEY non définie dans les variables d\'environnement');
      }

      // Vérifier le token avec l'API REST Firebase
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
        { idToken }
      );

      // Extraire les données utilisateur
      const userData = response.data.users[0];
      if (!userData) {
        throw new Error('Utilisateur non trouvé');
      }

      // Ajouter les informations utilisateur à la requête
      req.user = {
        uid: userData.localId,
        email: userData.email,
        emailVerified: userData.emailVerified,
        // Note: Les custom claims ne sont pas accessibles par cette méthode
        // Utilisez une base de données (Firestore) pour stocker et récupérer les rôles
        role: 'user' // Valeur par défaut
      };
      
      // Ici, vous pourriez faire une requête à votre base de données pour obtenir le rôle
      // Par exemple, en utilisant axios pour appeler un endpoint Firebase Firestore REST API
      
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
 * Middleware simplifié pour vérifier les rôles utilisateur
 * @param {Array} roles - Tableau des rôles autorisés
 */
const checkRole = (roles) => {
  return (req, res, next) => {
    // Pour le développement, on peut désactiver la vérification des rôles
    if (process.env.SKIP_AUTH === 'true') {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Utilisateur non authentifié'
      });
    }

    const userRole = req.user.role || 'user';
    
    // Pour simplifier pendant le développement, nous pouvons accepter tous les rôles
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    
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
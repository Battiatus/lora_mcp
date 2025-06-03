const admin = require('firebase-admin');
const { logger } = require('../utils/logger');

/**
 * Initialise Firebase Admin SDK
 * En production, utilisez les variables d'environnement ou un fichier de service
 */
const initializeFirebase = () => {
  try {
    // Si une variable d'environnement existe avec la configuration JSON
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      
      logger.info('Firebase initialisé avec les variables d\'environnement');
      return;
    }
    
    // Si un fichier de service est spécifié
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      
      logger.info('Firebase initialisé avec le fichier de service');
      return;
    }
    
    // Utilisation des variables d'environnement par défaut (pour Cloud Run)
    admin.initializeApp();
    logger.info('Firebase initialisé avec la configuration par défaut');
    
  } catch (error) {
    logger.error(`Erreur d'initialisation Firebase: ${error.message}`);
    throw new Error(`Configuration Firebase invalide: ${error.message}`);
  }
};

// Initialiser Firebase au démarrage
initializeFirebase();

// Exporter les modules Firebase
module.exports = {
  admin,
  auth: admin.auth(),
  firestore: admin.firestore()
};
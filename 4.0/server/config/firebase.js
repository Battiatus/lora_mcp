const admin = require('firebase-admin');
const { logger } = require('../utils/logger');

/**
 * Initialise Firebase Admin SDK sans compte de service
 * Utilise Application Default Credentials (ADC) avec projet explicite
 */
const initializeFirebase = () => {
  try {
    // Obtenir le projet depuis les variables d'environnement
    const projectId = process.env.FIREBASE_PROJECT_ID;
    
    if (!projectId) {
      throw new Error('FIREBASE_PROJECT_ID est requis dans les variables d\'environnement');
    }

    // Utiliser l'initialisation par défaut sans compte de service
    // mais en spécifiant explicitement le projet pour éviter l'erreur de quota
    admin.initializeApp({
      projectId: projectId
    });
    
    logger.info(`Firebase initialisé avec le projet: ${projectId}`);
  } catch (error) {
    logger.error(`Erreur d'initialisation Firebase: ${error.message}`);
    
    // Initialisation de secours avec une configuration minimale
    // Cette approche est uniquement pour le développement
    if (!admin.apps.length) {
      admin.initializeApp({
        // Configuration minimale sans authentification complète
        // Cela permettra au serveur de démarrer, mais les fonctionnalités 
        // d'authentification Firebase ne fonctionneront pas correctement
        projectId: 'placeholder-project'
      });
      logger.warn('Firebase initialisé en mode de secours - fonctionnalités limitées');
    }
  }
};

// Initialiser Firebase au démarrage
initializeFirebase();

// Créer un faux middleware d'authentification si Firebase n'est pas correctement configuré
const verifyIdTokenFallback = async (idToken) => {
  // Simuler un utilisateur pour le développement
  return {
    uid: 'dev-user-123',
    email: 'dev@example.com',
    email_verified: true,
    role: 'admin'
  };
};

// Fonction pour vérifier un token d'authentification
const verifyIdToken = async (idToken) => {
  try {
    // Tenter de vérifier avec Firebase
    return await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    logger.error(`Erreur de vérification du token: ${error.message}`);
    
    // En développement, utiliser le fallback
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('Utilisation du mode de vérification de secours pour le développement');
      return verifyIdTokenFallback(idToken);
    }
    
    // En production, propager l'erreur
    throw error;
  }
};

// Exporter les modules Firebase avec une API simplifiée
module.exports = {
  admin,
  auth: {
    verifyIdToken,
    createUser: async (userData) => {
      try {
        return await admin.auth().createUser(userData);
      } catch (error) {
        logger.error(`Erreur de création d'utilisateur: ${error.message}`);
        if (process.env.NODE_ENV !== 'production') {
          // En dev, simuler un utilisateur créé
          return {
            uid: `dev-${Date.now()}`,
            email: userData.email,
            displayName: userData.displayName,
            emailVerified: false
          };
        }
        throw error;
      }
    },
    updateUser: async (uid, userData) => {
      try {
        return await admin.auth().updateUser(uid, userData);
      } catch (error) {
        logger.error(`Erreur de mise à jour d'utilisateur: ${error.message}`);
        if (process.env.NODE_ENV !== 'production') {
          return { uid, ...userData };
        }
        throw error;
      }
    },
    deleteUser: async (uid) => {
      try {
        return await admin.auth().deleteUser(uid);
      } catch (error) {
        logger.error(`Erreur de suppression d'utilisateur: ${error.message}`);
        if (process.env.NODE_ENV !== 'production') {
          return true;
        }
        throw error;
      }
    },
    getUser: async (uid) => {
      try {
        return await admin.auth().getUser(uid);
      } catch (error) {
        logger.error(`Erreur de récupération d'utilisateur: ${error.message}`);
        if (process.env.NODE_ENV !== 'production') {
          return {
            uid,
            email: 'dev@example.com',
            displayName: 'Dev User',
            emailVerified: true,
            metadata: {
              creationTime: new Date().toISOString(),
              lastSignInTime: new Date().toISOString()
            }
          };
        }
        throw error;
      }
    },
    setCustomUserClaims: async (uid, claims) => {
      try {
        return await admin.auth().setCustomUserClaims(uid, claims);
      } catch (error) {
        logger.error(`Erreur de définition des claims: ${error.message}`);
        if (process.env.NODE_ENV !== 'production') {
          return true;
        }
        throw error;
      }
    }
  },
  firestore: {
    collection: (name) => {
      try {
        return admin.firestore().collection(name);
      } catch (error) {
        logger.error(`Erreur d'accès à la collection Firestore: ${error.message}`);
        
        // En dev, retourner un objet simulé pour éviter les erreurs
        if (process.env.NODE_ENV !== 'production') {
          return {
            doc: (id) => ({
              get: async () => ({ 
                exists: true, 
                data: () => ({ id, createdAt: new Date() }) 
              }),
              set: async () => true,
              update: async () => true,
              delete: async () => true
            }),
            add: async () => ({ id: `dev-${Date.now()}` })
          };
        }
        throw error;
      }
    }
  }
};
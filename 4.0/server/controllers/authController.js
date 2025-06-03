const { admin, auth, firestore } = require('../config/firebase');
const { logger } = require('../utils/logger');

/**
 * Crée un nouvel utilisateur dans Firebase Auth
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const createUser = async (req, res) => {
  try {
    const { email, password, displayName, role = 'user' } = req.body;

    // Vérifier si l'utilisateur actuel a les droits d'administrateur
    if (role !== 'user' && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Non autorisé à créer des utilisateurs avec des rôles privilégiés'
      });
    }

    // Créer l'utilisateur dans Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
      disabled: false
    });

    // Ajouter les informations utilisateur dans Firestore
    await firestore.collection('users').doc(userRecord.uid).set({
      email,
      displayName,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Ajouter le rôle dans les claims utilisateur
    await auth.setCustomUserClaims(userRecord.uid, { role });

    logger.info(`Nouvel utilisateur créé: ${userRecord.uid}`);

    res.status(201).json({
      status: 'success',
      message: 'Utilisateur créé avec succès',
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        role
      }
    });
  } catch (error) {
    logger.error(`Erreur lors de la création de l'utilisateur: ${error.message}`);
    
    // Gérer les erreurs spécifiques à Firebase Auth
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({
        status: 'error',
        message: 'L\'adresse email est déjà utilisée'
      });
    }
    
    if (error.code === 'auth/invalid-email') {
      return res.status(400).json({
        status: 'error',
        message: 'Adresse email invalide'
      });
    }
    
    if (error.code === 'auth/weak-password') {
      return res.status(400).json({
        status: 'error',
        message: 'Le mot de passe est trop faible'
      });
    }

    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la création de l\'utilisateur',
      error: error.message
    });
  }
};

/**
 * Obtient le profil de l'utilisateur actuel
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const getCurrentUser = async (req, res) => {
  try {
    const uid = req.user.uid;
    
    // Récupérer l'utilisateur depuis Firebase Auth
    const userRecord = await auth.getUser(uid);
    
    // Récupérer les données supplémentaires depuis Firestore
    const userDoc = await firestore.collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    res.json({
      status: 'success',
      data: {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        role: userData.role || req.user.role || 'user',
        lastLogin: userRecord.metadata.lastSignInTime
      }
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération du profil utilisateur: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération du profil utilisateur',
      error: error.message
    });
  }
};

/**
 * Mettre à jour un utilisateur
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const updateUser = async (req, res) => {
  try {
    const { uid } = req.params;
    const { displayName, role } = req.body;
    
    // Vérifier les permissions - seul un admin peut changer les rôles
    if (role && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Non autorisé à modifier les rôles utilisateur'
      });
    }
    
    // Un utilisateur ne peut modifier que son propre profil, sauf s'il est admin
    if (uid !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Non autorisé à modifier d\'autres utilisateurs'
      });
    }
    
    // Préparer les données à mettre à jour dans Firebase Auth
    const authUpdateData = {};
    if (displayName) authUpdateData.displayName = displayName;
    
    // Mettre à jour Firebase Auth
    await auth.updateUser(uid, authUpdateData);
    
    // Préparer les données à mettre à jour dans Firestore
    const firestoreUpdateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (displayName) firestoreUpdateData.displayName = displayName;
    if (role) firestoreUpdateData.role = role;
    
    // Mettre à jour Firestore
    await firestore.collection('users').doc(uid).update(firestoreUpdateData);
    
    // Si le rôle est modifié, mettre à jour les claims
    if (role) {
      await auth.setCustomUserClaims(uid, { role });
    }
    
    logger.info(`Utilisateur mis à jour: ${uid}`);
    
    res.json({
      status: 'success',
      message: 'Utilisateur mis à jour avec succès',
      data: {
        uid,
        ...authUpdateData,
        ...firestoreUpdateData
      }
    });
  } catch (error) {
    logger.error(`Erreur lors de la mise à jour de l'utilisateur: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la mise à jour de l\'utilisateur',
      error: error.message
    });
  }
};

/**
 * Supprime un utilisateur
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const deleteUser = async (req, res) => {
  try {
    const { uid } = req.params;
    
    // Seul un admin peut supprimer des utilisateurs ou un utilisateur peut se supprimer lui-même
    if (uid !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Non autorisé à supprimer d\'autres utilisateurs'
      });
    }
    
    // Supprimer de Firebase Auth
    await auth.deleteUser(uid);
    
    // Supprimer de Firestore
    await firestore.collection('users').doc(uid).delete();
    
    logger.info(`Utilisateur supprimé: ${uid}`);
    
    res.json({
      status: 'success',
      message: 'Utilisateur supprimé avec succès'
    });
  } catch (error) {
    logger.error(`Erreur lors de la suppression de l'utilisateur: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la suppression de l\'utilisateur',
      error: error.message
    });
  }
};

module.exports = {
  createUser,
  getCurrentUser,
  updateUser,
  deleteUser
};
import api from './axios';

/**
 * Récupère le profil de l'utilisateur actuel
 * @returns {Promise<Object>} Données du profil
 */
export const getCurrentUser = async () => {
  try {
    const response = await api.get('/auth/me');
    return response.data.data;
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    throw error;
  }
};

/**
 * Crée un nouvel utilisateur
 * @param {Object} userData - Données de l'utilisateur
 * @returns {Promise<Object>} Réponse de l'API
 */
export const createUser = async (userData) => {
  try {
    const response = await api.post('/auth/users', userData);
    return response.data;
  } catch (error) {
    console.error("Erreur lors de la création de l'utilisateur:", error);
    throw error;
  }
};

/**
 * Met à jour un utilisateur
 * @param {string} uid - ID de l'utilisateur à mettre à jour
 * @param {Object} userData - Données de l'utilisateur à mettre à jour
 * @returns {Promise<Object>} Réponse de l'API
 */
export const updateUser = async (uid, userData) => {
  try {
    const response = await api.put(`/auth/users/${uid}`, userData);
    return response.data;
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'utilisateur:", error);
    throw error;
  }
};

/**
 * Supprime un utilisateur
 * @param {string} uid - ID de l'utilisateur à supprimer
 * @returns {Promise<Object>} Réponse de l'API
 */
export const deleteUser = async (uid) => {
  try {
    const response = await api.delete(`/auth/users/${uid}`);
    return response.data;
  } catch (error) {
    console.error("Erreur lors de la suppression de l'utilisateur:", error);
    throw error;
  }
};
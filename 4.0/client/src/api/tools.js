import api from './axios';

/**
 * Récupère la liste des outils disponibles
 * @returns {Promise<Object>} Réponse de l'API
 */
export const getTools = async () => {
  try {
    const response = await api.get('/tools');
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération des outils:', error);
    throw error;
  }
};

/**
 * Exécute un outil spécifique
 * @param {string} toolName - Nom de l'outil à exécuter
 * @param {Object} args - Arguments pour l'outil
 * @param {string} sessionId - ID de session (optionnel)
 * @returns {Promise<Object>} Réponse de l'API
 */
export const executeTool = async (toolName, args = {}, sessionId = null) => {
  try {
    const payload = {
      tool_name: toolName,
      arguments: args
    };

    // Ajouter l'ID de session s'il est fourni
    if (sessionId) {
      payload.session_id = sessionId;
    }

    const response = await api.post('/tools/execute', payload);
    return response.data;
  } catch (error) {
    console.error(`Erreur lors de l'exécution de l'outil ${toolName}:`, error);
    throw error;
  }
};

/**
 * Nettoie une session spécifique
 * @param {string} sessionId - ID de session à nettoyer
 * @returns {Promise<Object>} Réponse de l'API
 */
export const cleanupSession = async (sessionId) => {
  try {
    const response = await api.delete(`/tools/sessions/${sessionId}`);
    return response.data;
  } catch (error) {
    console.error(`Erreur lors du nettoyage de la session ${sessionId}:`, error);
    throw error;
  }
};
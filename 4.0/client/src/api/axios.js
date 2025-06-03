import axios from 'axios';
import { getAuthToken } from '../utils/firebase';

// URL de base de l'API - Assurez-vous que cela correspond à votre backend
// Remarque : Enlevez le '/api' de l'URL de base car il sera ajouté dans le baseURL
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// Créer une instance axios avec configuration par défaut
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000, // 30 secondes de timeout
  withCredentials: false // Définir sur true si vous utilisez des cookies d'authentification
});

// Intercepteur pour ajouter le token d'authentification à chaque requête
api.interceptors.request.use(
  async (config) => {
    try {
      console.log(`Requête API: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
      
      // Essayer d'obtenir le token
      const token = await getAuthToken().catch(err => {
        console.log('Pas de token disponible:', err.message);
        return null;
      });
      
      // Ajouter le token à l'en-tête Authorization si disponible
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      
      return config;
    } catch (error) {
      console.error("Erreur dans l'intercepteur de requête:", error);
      return config;
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur pour gérer les réponses et les erreurs
api.interceptors.response.use(
  (response) => {
    // Traiter les réponses réussies
    console.log(`Réponse API réussie: ${response.status}`);
    return response;
  },
  (error) => {
    // Gérer les erreurs de réponse
    if (error.response) {
      // La requête a été faite et le serveur a répondu avec un code d'état différent de 2xx
      console.error('Erreur API:', error.response.status, error.response.data);
      
      // Si le token est expiré ou invalide (401)
      if (error.response.status === 401) {
        console.error('Session expirée ou non autorisée');
      }
      
    } else if (error.request) {
      // La requête a été faite mais aucune réponse n'a été reçue
      console.error('Aucune réponse reçue du serveur:', error.request);
    } else {
      // Une erreur s'est produite lors de la configuration de la requête
      console.error('Erreur lors de la configuration de la requête:', error.message);
    }
    
    // Retourner l'erreur pour être traitée par le code appelant
    return Promise.reject(error);
  }
);

export default api;
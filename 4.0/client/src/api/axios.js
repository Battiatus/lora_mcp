import axios from 'axios';
import { getAuthToken } from '../utils/firebase';

// URL de base de l'API
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// Créer une instance axios avec configuration par défaut
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000 // 30 secondes de timeout
});

// Intercepteur pour ajouter le token d'authentification à chaque requête
api.interceptors.request.use(
  async (config) => {
    try {
      // Essayer d'obtenir le token
      const token = await getAuthToken();
      
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
    return response;
  },
  (error) => {
    // Gérer les erreurs de réponse
    if (error.response) {
      // La requête a été faite et le serveur a répondu avec un code d'état différent de 2xx
      
      // Si le token est expiré ou invalide (401)
      if (error.response.status === 401) {
        // Rediriger vers la page de connexion si nécessaire
        // window.location.href = '/login';
        console.error('Session expirée ou non autorisée');
      }
      
      // Si l'accès est interdit (403)
      if (error.response.status === 403) {
        console.error('Accès interdit - Permissions insuffisantes');
      }
      
      // Si le serveur renvoie une erreur
      console.error('Erreur API:', error.response.data);
    } else if (error.request) {
      // La requête a été faite mais aucune réponse n'a été reçue
      console.error('Aucune réponse reçue du serveur');
    } else {
      // Une erreur s'est produite lors de la configuration de la requête
      console.error('Erreur lors de la configuration de la requête:', error.message);
    }
    
    // Retourner l'erreur pour être traitée par le code appelant
    return Promise.reject(error);
  }
);

export default api;
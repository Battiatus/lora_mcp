import axios from 'axios';
import { getAuth } from 'firebase/auth';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Ajoutez des logs pour déboguer
api.interceptors.request.use(async (config) => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    
    console.log("Requête API:", config.url);
    console.log("Utilisateur Firebase connecté:", !!user);
    
    if (user) {
      const token = await user.getIdToken(true); // Force le rafraîchissement
      config.headers.Authorization = `Bearer ${token}`;
      console.log("Token ajouté à la requête");
    } else {
      console.log("Aucun utilisateur connecté, requête sans token");
    }
    
    return config;
  } catch (error) {
    console.error("Erreur d'authentification:", error);
    return config; // Continuer sans token
  }
});

// Ajouter un intercepteur de réponse pour déboguer
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      console.error("Erreur 401:", error.response.data);
      console.error("En-têtes envoyés:", error.config.headers);
    }
    return Promise.reject(error);
  }
);

export default api;
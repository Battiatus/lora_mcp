import React, { createContext, useState, useEffect } from 'react';
import { 
  onAuthStateChange, 
  loginWithEmailAndPassword, 
  registerWithEmailAndPassword, 
  logout,
  resetPassword
} from '../utils/firebase';
import api from '../api/axios';

// Créer le contexte d'authentification
export const AuthContext = createContext();

// Fournisseur du contexte d'authentification
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Traduire les codes d'erreur Firebase en messages d'erreur lisibles
  const getAuthErrorMessage = (errorCode) => {
    switch(errorCode) {
      case 'auth/invalid-email':
        return "L&apos;adresse email est invalide.";
      case 'auth/user-disabled':
        return "Ce compte utilisateur a été désactivé.";
      case 'auth/user-not-found':
        return "Aucun utilisateur trouvé avec cette adresse email.";
      case 'auth/wrong-password':
        return "Mot de passe incorrect.";
      case 'auth/email-already-in-use':
        return "Cette adresse email est déjà utilisée.";
      case 'auth/weak-password':
        return "Le mot de passe est trop faible.";
      case 'auth/operation-not-allowed':
        return "Cette opération n&apos;est pas autorisée.";
      case 'auth/too-many-requests':
        return "Trop de tentatives de connexion. Veuillez réessayer plus tard.";
      case 'auth/network-request-failed':
        return "Problème de connexion réseau. Vérifiez votre connexion internet.";
      default:
        return "Une erreur s&apos;est produite. Veuillez réessayer.";
    }
  };

  // Écouter les changements d'état d'authentification
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          // Récupérer le profil utilisateur depuis l'API
          const response = await api.get('/auth/me');
          setUserProfile(response.data.data);
        } catch (err) {
          console.error('Erreur lors de la récupération du profil:', err);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    // Nettoyer l'écouteur lorsque le composant est démonté
    return unsubscribe;
  }, []);

  // Fonction de connexion
  const login = async (email, password) => {
    setError(null);
    try {
      await loginWithEmailAndPassword(email, password);
    } catch (err) {
      setError(getAuthErrorMessage(err.code));
      throw err;
    }
  };

  // Fonction d'inscription
  const register = async (email, password, displayName) => {
    setError(null);
    try {
      return await registerWithEmailAndPassword(email, password, displayName);
    } catch (err) {
      setError(getAuthErrorMessage(err.code));
      throw err;
    }
  };

  // Fonction de déconnexion
  const signOut = async () => {
    setError(null);
    try {
      await logout();
    } catch (err) {
      setError(getAuthErrorMessage(err.code));
      throw err;
    }
  };

  // Fonction de réinitialisation du mot de passe
  const forgotPassword = async (email) => {
    setError(null);
    try {
      await resetPassword(email);
    } catch (err) {
      setError(getAuthErrorMessage(err.code));
      throw err;
    }
  };

  // Déterminer si l'utilisateur a un rôle spécifique
  const hasRole = (role) => {
    return userProfile && userProfile.role === role;
  };

  // Valeur du contexte à fournir
  const value = {
    currentUser,
    userProfile,
    loading,
    error,
    login,
    register,
    signOut,
    forgotPassword,
    hasRole,
    isAdmin: userProfile?.role === 'admin',
    isAuthenticated: !!currentUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
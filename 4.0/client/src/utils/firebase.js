import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';

// Configuration Firebase
// Remplacez ces valeurs par votre propre configuration Firebase
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * S'inscrire avec email et mot de passe
 * @param {string} email - Email de l'utilisateur
 * @param {string} password - Mot de passe
 * @param {string} displayName - Nom d'affichage
 */
const registerWithEmailAndPassword = async (email, password, displayName) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Mettre à jour le profil avec le nom d'affichage
    await updateProfile(user, { displayName });
    
    return user;
  } catch (error) {
    console.error("Erreur lors de l'inscription :", error.message);
    throw error;
  }
};

/**
 * Se connecter avec email et mot de passe
 * @param {string} email - Email de l'utilisateur
 * @param {string} password - Mot de passe
 */
const loginWithEmailAndPassword = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Erreur lors de la connexion :", error.message);
    throw error;
  }
};

/**
 * Se déconnecter
 */
const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Erreur lors de la déconnexion :", error.message);
    throw error;
  }
};

/**
 * Réinitialiser le mot de passe
 * @param {string} email - Email de l'utilisateur
 */
const resetPassword = async (email) => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error("Erreur lors de la réinitialisation du mot de passe :", error.message);
    throw error;
  }
};

/**
 * Écouter les changements d'état d'authentification
 * @param {Function} callback - Fonction à appeler lorsque l'état change
 * @returns {Function} Fonction pour arrêter l'écoute
 */
const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Obtenir le jeton d'authentification actuel
 * @returns {Promise<string>} Jeton d'authentification
 */
const getAuthToken = async () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Utilisateur non connecté");
  }
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error("Erreur lors de la récupération du jeton :", error.message);
    throw error;
  }
};

/**
 * Vérifier si un utilisateur est actuellement connecté
 * @returns {boolean} true si un utilisateur est connecté
 */
const isAuthenticated = () => {
  return !!auth.currentUser;
};

/**
 * Obtenir l'utilisateur actuellement connecté
 * @returns {Object|null} Utilisateur connecté ou null
 */
const getCurrentUser = () => {
  return auth.currentUser;
};

export {
  auth,
  registerWithEmailAndPassword,
  loginWithEmailAndPassword,
  logout,
  resetPassword,
  onAuthStateChange,
  getAuthToken,
  isAuthenticated,
  getCurrentUser
};
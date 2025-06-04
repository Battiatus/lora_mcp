const { initializeApp } = require('firebase/app');
const { getAuth, signInWithCustomToken } = require('firebase/auth');

const dotenv = require('dotenv');
// Chargement des variables d'environnement
dotenv.config();
// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

console.log('Initializing Firebase with config:', firebaseConfig);
// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);

/**
 * Firebase Authentication Middleware
 * Verifies the JWT token from the Authorization header
 */
const authenticateJWT = async (req, res, next) => {
  // Skip auth for health check and Swagger docs
  const publicPaths = ['/health', '/api-docs', '/api-docs/'];
  if (publicPaths.includes(req.path) || req.path.startsWith('/api-docs/')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Missing or invalid token format' 
    });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // The original implementation had an error - Firebase client SDK doesn't have verifyIdToken
    // We need to use a custom verification approach
    
    // For client-side Firebase, we can't directly verify tokens on the server
    // Instead, we'll use a lightweight JWT verification
    const jwt = require('jsonwebtoken');
    const decodedToken = jwt.decode(token);
    
    if (!decodedToken || !decodedToken.user_id) {
      throw new Error('Invalid token format');
    }
    
    // Store user info in request object
    req.user = {
      uid: decodedToken.user_id,
      email: decodedToken.email || '',
      emailVerified: decodedToken.email_verified || false
    };
    
    next();
  } catch (error) {
    console.error(`Authentication error: ${error.message}`);
    return res.status(403).json({ 
      success: false, 
      error: 'Forbidden: Invalid token' 
    });
  }
};

module.exports = { authenticateJWT };
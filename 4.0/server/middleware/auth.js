const admin = require('firebase-admin');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens from Firebase
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized - No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: decodedToken.role || 'user',
    };
    
    // Add user info to the log context
    logger.child({ 
      userId: req.user.uid, 
      userEmail: req.user.email 
    });
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`, { error });
    return res.status(403).json({ success: false, error: 'Forbidden - Invalid token' });
  }
};

/**
 * Middleware to check if user has required role
 * @param {String|Array} roles - Required roles
 * @returns {Function} Middleware function
 */
const checkRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized - Authentication required' });
    }

    const userRole = req.user.role || 'user';
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    if (requiredRoles.includes(userRole) || userRole === 'admin') {
      next();
    } else {
      logger.warn(`Insufficient permissions: User ${req.user.uid} with role ${userRole} tried to access a resource requiring ${requiredRoles.join(' or ')}`);
      return res.status(403).json({ success: false, error: 'Forbidden - Insufficient permissions' });
    }
  };
};

module.exports = {
  authenticateJWT,
  checkRole
};
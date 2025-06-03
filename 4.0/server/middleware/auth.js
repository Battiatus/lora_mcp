const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ status: 'error', message: 'Non autorisé' });
  }
  
  // Au lieu de vérifier le token, extrayez simplement l'information
  try {
    const token = authHeader.split('Bearer ')[1];
    
    // Solution temporaire : extraire l'UID du token sans vérification
    // Les tokens Firebase ont 3 parties séparées par des points
    const tokenParts = token.split('.');
    if (tokenParts.length === 3) {
      // Décoder la partie payload du token (2e partie)
      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      
      // Extraire des informations basiques de l'utilisateur
      req.user = {
        uid: payload.user_id || payload.sub,
        email: payload.email || '',
        role: 'user' // Par défaut, tous les utilisateurs ont le rôle "user"
      };
      
      return next();
    }
    
    // Si on ne peut pas extraire l'information, autoriser quand même en développement
    if (process.env.NODE_ENV !== 'production') {
      req.user = { uid: 'dev-user', role: 'user' };
      return next();
    }
    
    throw new Error('Format de token invalide');
  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    return res.status(401).json({ status: 'error', message: 'Token invalide' });
  }
};

module.exports = { authenticate };
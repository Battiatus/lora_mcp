import React, { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import './Auth.css';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  
  const auth = getAuth();
  const googleProvider = new GoogleAuthProvider();

  // Animation d'entrée
  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelector('.auth-card')?.classList.add('loaded');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Reset form when switching modes
  useEffect(() => {
    setError('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [isLogin]);

  // Vérification de la force du mot de passe
  useEffect(() => {
    if (!isLogin) {
      const calculateStrength = (pwd) => {
        let strength = 0;
        if (pwd.length >= 6) strength += 1;
        if (pwd.length >= 8) strength += 1;
        if (/[A-Z]/.test(pwd)) strength += 1;
        if (/[0-9]/.test(pwd)) strength += 1;
        if (/[^A-Za-z0-9]/.test(pwd)) strength += 1;
        return strength;
      };
      setPasswordStrength(calculateStrength(password));
    }
  }, [password, isLogin]);

  const getStrengthColor = () => {
    switch (passwordStrength) {
      case 0:
      case 1: return '#f56565';
      case 2: return '#ed8936';
      case 3: return '#ecc94b';
      case 4:
      case 5: return '#48bb78';
      default: return '#e0e0e0';
    }
  };

  const getStrengthText = () => {
    switch (passwordStrength) {
      case 0:
      case 1: return 'Faible';
      case 2: return 'Moyen';
      case 3: return 'Bon';
      case 4:
      case 5: return 'Excellent';
      default: return '';
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Aucun compte trouvé avec cet email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Mot de passe incorrect';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Adresse email invalide';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim()) {
      return setError('Le nom est requis');
    }
    
    if (password !== confirmPassword) {
      return setError('Les mots de passe ne correspondent pas');
    }
    
    if (password.length < 6) {
      return setError('Le mot de passe doit contenir au moins 6 caractères');
    }
    
    setLoading(true);
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, {
        displayName: name.trim()
      });
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Cette adresse email est déjà utilisée';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Adresse email invalide';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Le mot de passe est trop faible';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      let errorMessage = error.message;
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Connexion annulée';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Toggle Switch */}
        <div className="auth-toggle">
          <div className="toggle-container">
            <button 
              className={`toggle-btn ${isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(true)}
              disabled={loading}
            >
              Connexion
            </button>
            <button 
              className={`toggle-btn ${!isLogin ? 'active' : ''}`}
              onClick={() => setIsLogin(false)}
              disabled={loading}
            >
              Inscription
            </button>
            <div className={`toggle-slider ${isLogin ? 'left' : 'right'}`}></div>
          </div>
        </div>

        <div className="auth-header">
          <div className="logo">
            <i className="fas fa-robot"></i>
            <span>MCP Assistant</span>
          </div>
          <div className="auth-title-container">
            <h2 className={`auth-title ${isLogin ? 'show' : 'hide'}`}>
              Bon retour !
            </h2>
            <h2 className={`auth-title ${!isLogin ? 'show' : 'hide'}`}>
              Créer un compte
            </h2>
          </div>
          <div className="auth-subtitle-container">
            <p className={`auth-subtitle ${isLogin ? 'show' : 'hide'}`}>
              Connectez-vous à MCP Advanced Assistant
            </p>
            <p className={`auth-subtitle ${!isLogin ? 'show' : 'hide'}`}>
              Rejoignez MCP Advanced Assistant
            </p>
          </div>
        </div>
        
        {error && (
          <div className="auth-error">
            <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
            {error}
          </div>
        )}
        
        <div className="auth-form-container">
          <form onSubmit={isLogin ? handleLogin : handleRegister} className="auth-form">
            {/* Name field - only for registration */}
            <div className={`form-group ${!isLogin ? 'show' : 'hide'}`}>
              <label htmlFor="name">Nom complet</label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                disabled={loading}
                placeholder="Jean Dupont"
                autoComplete="name"
              />
            </div>
            
            {/* Email field */}
            <div className="form-group">
              <label htmlFor="email">Adresse email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="votre@email.com"
                autoComplete="email"
              />
            </div>
            
            {/* Password field */}
            <div className="form-group">
              <label htmlFor="password">Mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  style={{ paddingRight: '50px' }}
                  minLength={isLogin ? undefined : 6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                  disabled={loading}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              
              {/* Password strength indicator - only for registration */}
              {!isLogin && password && (
                <div className="password-strength">
                  <div className="strength-bar">
                    <div 
                      className="strength-fill"
                      style={{
                        width: `${(passwordStrength / 5) * 100}%`,
                        backgroundColor: getStrengthColor()
                      }}
                    ></div>
                  </div>
                  <small className="strength-text" style={{ color: getStrengthColor() }}>
                    Force : {getStrengthText()}
                  </small>
                </div>
              )}
            </div>
            
            {/* Confirm Password field - only for registration */}
            <div className={`form-group ${!isLogin ? 'show' : 'hide'}`}>
              <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required={!isLogin}
                  disabled={loading}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  style={{ 
                    paddingRight: '50px',
                    borderColor: confirmPassword && password !== confirmPassword ? '#f56565' : undefined
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="password-toggle"
                  disabled={loading}
                >
                  <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              
              {/* Password match indicator */}
              {confirmPassword && password !== confirmPassword && (
                <small className="password-match error">
                  <i className="fas fa-times-circle" style={{ marginRight: '4px' }}></i>
                  Les mots de passe ne correspondent pas
                </small>
              )}
              {confirmPassword && password === confirmPassword && confirmPassword.length > 0 && (
                <small className="password-match success">
                  <i className="fas fa-check-circle" style={{ marginRight: '4px' }}></i>
                  Les mots de passe correspondent
                </small>
              )}
            </div>
            
            <button 
              type="submit" 
              className="auth-button"
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  {isLogin ? 'Connexion...' : 'Création du compte...'}
                </>
              ) : (
                <>
                  <i className={`fas ${isLogin ? 'fa-sign-in-alt' : 'fa-user-plus'}`}></i>
                  {isLogin ? 'Se connecter' : 'Créer mon compte'}
                </>
              )}
            </button>
          </form>
        </div>
        
        <div className="auth-divider">
          <span>OU</span>
        </div>
        
        <button 
          onClick={handleGoogleLogin}
          className="google-button"
          disabled={loading}
        >
          <i className="fab fa-google"></i>
          Continuer avec Google
        </button>
      </div>
    </div>
  );
}

export default Auth;
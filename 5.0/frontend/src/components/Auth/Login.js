import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Login({ isOpen, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, register } = useAuth();

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    
    // Password validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    // Clear previous errors
    setError('');
    setLoading(true);
    
    try {
      if (isRegistering) {
        // Register new user
        await register(email, password);
      } else {
        // Login existing user
        await login(email, password);
      }
      
      // Call onLogin callback
      onLogin();
    } catch (err) {
      console.error('Authentication error:', err);
      
      // Format error message
      let errorMessage = 'Authentication failed';
      
      if (err.message) {
        if (err.message.includes('auth/user-not-found')) {
          errorMessage = 'No account found with this email';
        } else if (err.message.includes('auth/wrong-password')) {
          errorMessage = 'Incorrect password';
        } else if (err.message.includes('auth/email-already-in-use')) {
          errorMessage = 'Email already in use';
        } else if (err.message.includes('auth/weak-password')) {
          errorMessage = 'Password is too weak';
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <i className="fas fa-robot"></i>
            <h1>MCP Assistant</h1>
          </div>
          <p>Your intelligent web automation and research companion</p>
        </div>
        
        <div className="auth-form">
          <h2>{isRegistering ? 'Create Account' : 'Sign In'}</h2>
          
          {error && (
            <div className="auth-error">
              <i className="fas fa-exclamation-circle"></i>
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-with-icon">
              <i className="fas fa-envelope"></i>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                disabled={loading}
                required
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <i className="fas fa-lock"></i>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                required
              />
            </div>
          </div>
          
          <button
            className="auth-button"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                {isRegistering ? 'Creating Account...' : 'Signing In...'}
              </>
            ) : (
              <>
                {isRegistering ? 'Create Account' : 'Sign In'}
              </>
            )}
          </button>
          
          <div className="auth-toggle">
            {isRegistering ? (
              <>
                Already have an account?{' '}
                <button
                  className="toggle-link"
                  onClick={toggleMode}
                  disabled={loading}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <button
                  className="toggle-link"
                  onClick={toggleMode}
                  disabled={loading}
                >
                  Create Account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
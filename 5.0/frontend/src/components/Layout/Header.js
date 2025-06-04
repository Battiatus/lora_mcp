import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Header({ title, onLogout }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const { currentUser } = useAuth();
  
  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  const handleLogout = () => {
    setShowDropdown(false);
    onLogout();
  };

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!currentUser || !currentUser.email) return '?';
    
    const email = currentUser.email;
    const parts = email.split('@')[0].split(/[._-]/);
    
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  };

  return (
    <div className="chat-header">
      <h1>{title}</h1>
      
      <div className="header-controls">
        <div className="user-menu">
          <button 
            className="user-avatar"
            onClick={toggleDropdown}
            aria-label="User menu"
          >
            {getUserInitials()}
          </button>
          
          {showDropdown && (
            <div className="user-dropdown">
              <div className="user-info">
                <div className="user-avatar">{getUserInitials()}</div>
                <div className="user-email">{currentUser?.email}</div>
              </div>
              
              <div className="dropdown-divider"></div>
              
              <button 
                className="dropdown-item"
                onClick={handleLogout}
              >
                <i className="fas fa-sign-out-alt"></i>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
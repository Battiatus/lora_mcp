import React from 'react';

/**
 * Composant d'indicateur de chargement
 */
const Loader = ({ size = 'md', className = '', fullScreen = false }) => {
  // Classes selon la taille
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };
  
  // Styles pour le loader plein écran
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
        <div className={`${sizeClasses[size]} rounded-full border-t-blue-600 border-blue-200 animate-spin ${className}`}></div>
      </div>
    );
  }
  
  return (
    <div className={`${sizeClasses[size]} rounded-full border-t-blue-600 border-blue-200 animate-spin ${className}`}></div>
  );
};

export default Loader;
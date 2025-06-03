import React, { useEffect } from 'react';

/**
 * Composant modal réutilisable
 */
const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer = null,
  size = 'md'
}) => {
  // Empêcher le défilement du corps lorsque le modal est ouvert
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);
  
  // Ne rien rendre si le modal n'est pas ouvert
  if (!isOpen) {
    return null;
  }
  
  // Classes selon la taille
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4'
  };

  // Gestionnaire pour empêcher la propagation des clics
  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50 p-4"
      onClick={onClose}
    >
      <div 
        className={`${sizeClasses[size]} w-full bg-white rounded-lg shadow-xl overflow-hidden transform transition-all`}
        onClick={handleContentClick}
      >
        {/* Entête du modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        {/* Corps du modal */}
        <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {children}
        </div>
        
        {/* Pied du modal (optionnel) */}
        {footer && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
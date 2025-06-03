import React from 'react';

/**
 * Composant de carte réutilisable
 */
const Card = ({ 
  children, 
  title = null, 
  footer = null, 
  className = '', 
  hover = false 
}) => {
  const hoverClasses = hover ? 'transition-transform hover:shadow-lg hover:-translate-y-1' : '';
  
  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden ${hoverClasses} ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        </div>
      )}
      
      <div className="p-6">
        {children}
      </div>
      
      {footer && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          {footer}
        </div>
      )}
    </div>
  );
};

export default Card;
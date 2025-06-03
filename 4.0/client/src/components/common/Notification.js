import React, { useEffect } from 'react';
import { NOTIFICATION_TYPES } from '../../contexts/NotificationContext';

/**
 * Composant pour afficher une notification
 */
const Notification = ({ 
  notification, 
  onClose
}) => {
  const { id, message, type } = notification;
  
  // Fermer automatiquement la notification après un délai
  useEffect(() => {
    if (notification.timeout !== 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, notification.timeout);
      
      return () => clearTimeout(timer);
    }
  }, [id, notification.timeout, onClose]);
  
  // Icône selon le type de notification
  const getIcon = () => {
    switch (type) {
      case NOTIFICATION_TYPES.SUCCESS:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        );
      case NOTIFICATION_TYPES.ERROR:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        );
      case NOTIFICATION_TYPES.WARNING:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        );
      case NOTIFICATION_TYPES.INFO:
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
    }
  };
  
  // Couleurs selon le type de notification
  const getTypeClasses = () => {
    switch (type) {
      case NOTIFICATION_TYPES.SUCCESS:
        return 'bg-green-50 text-green-800 border-green-200';
      case NOTIFICATION_TYPES.ERROR:
        return 'bg-red-50 text-red-800 border-red-200';
      case NOTIFICATION_TYPES.WARNING:
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case NOTIFICATION_TYPES.INFO:
      default:
        return 'bg-blue-50 text-blue-800 border-blue-200';
    }
  };

  return (
    <div 
      className={`flex items-center p-4 mb-3 rounded-md shadow-md border ${getTypeClasses()} animate-slideIn`}
      role="alert"
    >
      <div className="flex-shrink-0 mr-3">
        {getIcon()}
      </div>
      <div className="flex-1 mr-2">
        {message}
      </div>
      <button 
        onClick={() => onClose(id)}
        className="flex-shrink-0 ml-auto text-gray-500 hover:text-gray-700 focus:outline-none"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
  );
};

/**
 * Conteneur pour toutes les notifications
 */
const NotificationsContainer = ({ notifications, onClose }) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 w-80 max-w-full">
      {notifications.map((notification) => (
        <Notification 
          key={notification.id} 
          notification={notification} 
          onClose={onClose} 
        />
      ))}
    </div>
  );
};

export default NotificationsContainer;
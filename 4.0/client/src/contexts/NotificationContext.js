import React, { createContext, useState, useContext, useCallback } from 'react';

// Créer le contexte de notification
export const NotificationContext = createContext();

// Types de notifications
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Fournisseur du contexte de notification
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  // Supprimer une notification par ID
  const removeNotification = useCallback((id) => {
    setNotifications(prevNotifications => 
      prevNotifications.filter(notification => notification.id !== id)
    );
  }, []);

  // Ajouter une notification
  const addNotification = useCallback((message, type = NOTIFICATION_TYPES.INFO, timeout = 5000) => {
    const id = Date.now();
    
    // Ajouter la notification
    setNotifications(prevNotifications => [
      ...prevNotifications,
      { id, message, type, timeout }
    ]);
    
    // Supprimer automatiquement la notification après un délai
    if (timeout !== 0) {
      setTimeout(() => {
        removeNotification(id);
      }, timeout);
    }
    
    return id;
  }, [removeNotification]);

  // Fonctions de raccourci pour différents types de notifications
  const success = useCallback((message, timeout) => 
    addNotification(message, NOTIFICATION_TYPES.SUCCESS, timeout), 
    [addNotification]
  );
  
  const error = useCallback((message, timeout) => 
    addNotification(message, NOTIFICATION_TYPES.ERROR, timeout), 
    [addNotification]
  );
  
  const warning = useCallback((message, timeout) => 
    addNotification(message, NOTIFICATION_TYPES.WARNING, timeout), 
    [addNotification]
  );
  
  const info = useCallback((message, timeout) => 
    addNotification(message, NOTIFICATION_TYPES.INFO, timeout), 
    [addNotification]
  );

  // Supprimer toutes les notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    success,
    error,
    warning,
    info,
    clearAll
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Hook personnalisé pour utiliser le contexte de notification
export const useNotification = () => {
  const context = useContext(NotificationContext);
  
  if (!context) {
    throw new Error('useNotification doit être utilisé à l&apos;intérieur d&apos;un NotificationProvider');
  }
  
  return context;
};


import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { useNotification } from '../../contexts/NotificationContext';
import NotificationsContainer from '../common/Notification';

/**
 * Layout principal de l'application
 */
const AppLayout = ({ children }) => {
  const { notifications, removeNotification } = useNotification();
  const location = useLocation();
  
  // Vérifier si nous sommes sur une page d'authentification
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Notifications */}
      <NotificationsContainer 
        notifications={notifications} 
        onClose={removeNotification} 
      />
      
      {/* Header */}
      <Header />
      
      {/* Contenu principal */}
      <main className="flex-grow">
        {isAuthPage ? (
          // Mise en page pour les pages d'authentification
          <div className="max-w-md mx-auto px-4 py-12 sm:px-6 lg:px-8">
            {children}
          </div>
        ) : (
          // Mise en page pour les autres pages
          <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </div>
        )}
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
};

export default AppLayout;
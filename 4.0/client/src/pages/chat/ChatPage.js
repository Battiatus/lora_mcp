import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from '../../components/chat/ChatInterface';
import Sidebar from '../../components/layout/Sidebar';
import Loader from '../../components/common/Loader';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../contexts/NotificationContext';
import mcpClient from '../../services/client-wrapper';

/**
 * Page principale de chat qui intègre l'interface de chat et la barre latérale
 */
const ChatPage = () => {
  const { currentUser, isAuthenticated } = useAuth();
  const { error: showError } = useNotification();
  const navigate = useNavigate();
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Rediriger si non authentifié
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Initialiser le client MCP
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      setIsInitializing(true);
      
      mcpClient.initialize()
        .then(success => {
          if (!success) {
            showError('Échec de l\'initialisation du client MCP. Veuillez réessayer.');
          }
        })
        .catch(err => {
          console.error('Error initializing MCP client:', err);
          showError('Erreur lors de l\'initialisation: ' + err.message);
        })
        .finally(() => {
          setIsInitializing(false);
        });
      
      // Nettoyer le client à la désinscription
      return () => {
        mcpClient.cleanup().catch(err => {
          console.error('Error cleaning up MCP client:', err);
        });
      };
    }
  }, [isAuthenticated, currentUser, showError]);

  // Basculer la visibilité de la barre latérale
  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  if (!isAuthenticated) {
    return null; // La redirection sera gérée par le useEffect
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Bouton de bascule de la barre latérale (visible uniquement sur mobile) */}
      <button
        className="fixed z-20 p-2 m-4 bg-white rounded-full shadow-md md:hidden"
        onClick={toggleSidebar}
      >
        <i className={`fas ${isSidebarOpen ? 'fa-times' : 'fa-bars'} text-gray-700`}></i>
      </button>
      
      {/* Barre latérale */}
      <div 
        className={`fixed inset-0 z-10 transition-transform transform duration-300 md:relative md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:w-64 md:flex-shrink-0 bg-white shadow-md md:shadow-none`}
      >
        <div className="flex h-full">
          <Sidebar 
            isMobile={true} 
            onClose={() => setIsSidebarOpen(false)}
          />
          
          {/* Overlay de fermeture pour mobile */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
        </div>
      </div>
      
      {/* Contenu principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {isInitializing ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader size="lg" />
              <p className="mt-4 text-gray-600">Initialisation de l'assistant...</p>
            </div>
          </div>
        ) : (
          <ChatInterface />
        )}
      </div>
    </div>
  );
};

export default ChatPage;
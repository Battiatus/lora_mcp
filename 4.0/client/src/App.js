import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
// Correction : importer AuthProvider et useAuth depuis leurs sources respectives
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { NotificationProvider } from './contexts/NotificationContext';
import AppLayout from './components/layout/AppLayout';
import getRoutes from './routes';
import Loader from './components/common/Loader';

// Composant enveloppant pour les routes protégées
const AppRoutes = () => {
  const { isAuthenticated, isAdmin, loading } = useAuth();
  
  // Afficher un chargement pendant l'initialisation de l'authentification
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader size="lg" />
      </div>
    );
  }
  
  // Générer les routes en fonction de l'état d'authentification
  const routes = getRoutes(isAuthenticated, isAdmin);
  
  return (
    <Routes>
      {routes.map((route, index) => (
        <Route 
          key={index} 
          path={route.path} 
          element={route.element} 
        />
      ))}
    </Routes>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppLayout>
            <AppRoutes />
          </AppLayout>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
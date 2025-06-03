import React from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useTools } from '../../hooks/useTools';
import Loader from '../../components/common/Loader';

const Dashboard = () => {
  const { userProfile } = useAuth();
  const { tools, loading } = useTools();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Bienvenue, {userProfile?.displayName || 'Utilisateur'}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Card
          title="Outils Disponibles"
          hover
          footer={
            <Link to="/tools">
              <Button variant="ghost" size="sm">
                Voir tous les outils
              </Button>
            </Link>
          }
        >
          <div className="h-40 flex flex-col justify-center">
            {loading ? (
              <div className="flex justify-center">
                <Loader />
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-blue-600 text-center">
                  {tools.length}
                </p>
                <p className="text-gray-600 text-center">
                  Outils disponibles pour automatiser vos tâches
                </p>
              </>
            )}
          </div>
        </Card>
        
        <Card
          title="Commencer une Tâche"
          hover
          footer={
            <Link to="/tools">
              <Button variant="ghost" size="sm">
                Nouvelle tâche
              </Button>
            </Link>
          }
        >
          <div className="h-40 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-gray-600 text-center">
              Créez une nouvelle tâche d'automatisation
            </p>
          </div>
        </Card>
        
        <Card
          title="Documentation"
          hover
          footer={
            <Link to="/documentation">
              <Button variant="ghost" size="sm">
                Consulter la documentation
              </Button>
            </Link>
          }
        >
          <div className="h-40 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-gray-600 text-center">
              Consultez nos guides et tutoriels
            </p>
          </div>
        </Card>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Démarrage Rapide</h2>
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 bg-blue-100 rounded-full p-2 text-blue-600 mr-3">
                  <span className="flex items-center justify-center w-6 h-6 font-semibold">1</span>
                </div>
                <div>
                  <h3 className="text-base font-medium text-gray-900">Choisir un outil</h3>
                  <p className="text-gray-600">Sélectionnez l'outil adapté à votre tâche dans la liste des outils disponibles.</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="flex-shrink-0 bg-blue-100 rounded-full p-2 text-blue-600 mr-3">
                  <span className="flex items-center justify-center w-6 h-6 font-semibold">2</span>
                </div>
                <div>
                  <h3 className="text-base font-medium text-gray-900">Configurer les paramètres</h3>
                  <p className="text-gray-600">Entrez les paramètres nécessaires pour l'exécution de l'outil.</p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="flex-shrink-0 bg-blue-100 rounded-full p-2 text-blue-600 mr-3">
                  <span className="flex items-center justify-center w-6 h-6 font-semibold">3</span>
                </div>
                <div>
                  <h3 className="text-base font-medium text-gray-900">Exécuter et visualiser les résultats</h3>
                  <p className="text-gray-600">Lancez l'outil et consultez les résultats de l'exécution en temps réel.</p>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <Link to="/tools">
                <Button variant="primary">
                  Commencer maintenant
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

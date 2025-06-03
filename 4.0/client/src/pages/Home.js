import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';

const Home = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="py-12 md:py-20">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block">MCP Assistant</span>
            <span className="block text-blue-600">Automatisation Web Intelligente</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            La solution moderne et sécurisée pour automatiser vos tâches de navigation web, recherche et analyse.
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            {isAuthenticated ? (
              <div className="rounded-md shadow">
                <Link to="/dashboard">
                  <Button size="lg">
                    Accéder au Dashboard
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-md shadow">
                  <Link to="/register">
                    <Button size="lg">
                      S'inscrire gratuitement
                    </Button>
                  </Link>
                </div>
                <div className="mt-3 sm:mt-0 sm:ml-3">
                  <Link to="/login">
                    <Button variant="outline" size="lg">
                      Se connecter
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12 bg-white">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:max-w-7xl lg:px-8">
          <h2 className="sr-only">Fonctionnalités</h2>
          <dl className="space-y-10 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-8">
            <div>
              <dt>
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
                <p className="mt-5 text-lg leading-6 font-medium text-gray-900">Navigation Automatisée</p>
              </dt>
              <dd className="mt-2 text-base text-gray-500">
                Automatisez la navigation sur le web avec des capacités de clic, défilement et saisie, tout en capturant des captures d'écran pour documenter chaque étape.
              </dd>
            </div>

            <div>
              <dt>
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="mt-5 text-lg leading-6 font-medium text-gray-900">Sécurité Avancée</p>
              </dt>
              <dd className="mt-2 text-base text-gray-500">
                Architecture sécurisée avec authentification Firebase, API RESTful protégée et isolation complète entre frontend et backend sur Cloud Run.
              </dd>
            </div>

            <div>
              <dt>
                <div className="flex items-center justify-center h-12 w-12 rounded-md bg-blue-500 text-white">
                  <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="mt-5 text-lg leading-6 font-medium text-gray-900">Interface Moderne</p>
              </dt>
              <dd className="mt-2 text-base text-gray-500">
                UI/UX intuitive et responsive avec un design contemporain qui s'adapte à tous les appareils pour une expérience utilisateur optimale.
              </dd>
            </div>
          </dl>
        </div>
      </div>
      
      {/* CTA Section */}
      <div className="bg-blue-700 rounded-lg shadow-xl mt-10 mb-20">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">Prêt à automatiser vos tâches web?</span>
            <span className="block">Commencez dès aujourd'hui.</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-blue-100">
            Essayez MCP Assistant gratuitement et découvrez comment l'automatisation web peut transformer votre productivité.
          </p>
          <div className="mt-8 flex justify-center">
            {isAuthenticated ? (
              <div className="inline-flex rounded-md shadow">
                <Link to="/tools">
                  <Button size="lg" variant="success">
                    Explorer les outils
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="inline-flex rounded-md shadow">
                <Link to="/register">
                  <Button size="lg" variant="outline" className="bg-white text-blue-700 hover:bg-blue-50">
                    Commencer gratuitement
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
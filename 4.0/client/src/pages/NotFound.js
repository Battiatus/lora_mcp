import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="text-center">
        <div className="flex justify-center">
          <svg className="h-24 w-24 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mt-4 text-4xl font-bold text-gray-900">404</h1>
        <h2 className="mt-2 text-2xl font-semibold text-gray-700">Page non trouvée</h2>
        <p className="mt-4 text-gray-600 max-w-md mx-auto">
          Désolé, la page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <div className="mt-8">
          <Link to="/">
            <Button>
              Retour à l'accueil
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
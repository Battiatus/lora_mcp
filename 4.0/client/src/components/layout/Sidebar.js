import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Composant de barre latérale pour la navigation principale
 */
const Sidebar = ({ isMobile = false, onClose = null }) => {
  const { userProfile } = useAuth();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('dashboard');

  // Déterminer si un lien est actif
  const isActive = (path) => {
    return location.pathname === path;
  };

  // Classes pour les liens actifs et inactifs
  const linkBaseClasses = "flex items-center py-2 px-4 rounded-lg transition-colors";
  const activeLinkClasses = `${linkBaseClasses} bg-blue-100 text-blue-700 font-medium`;
  const inactiveLinkClasses = `${linkBaseClasses} hover:bg-gray-100 text-gray-700`;

  // Gérer la section active pour les menus déroulants
  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? null : section);
  };

  // Définir les éléments de navigation
  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      name: 'Outils',
      path: '/tools',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      submenu: [
        { name: 'Liste des outils', path: '/tools' },
        { name: 'Exécution d\'outil', path: '/tools/execute' }
      ]
    },
    {
      name: 'Sessions',
      path: '/sessions',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      )
    },
    {
      name: 'Profil',
      path: '/profile',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    }
  ];

  // Ajouter l'élément d'administration si l'utilisateur est admin
  if (userProfile?.role === 'admin') {
    navItems.push({
      name: 'Administration',
      path: '/admin',
      icon: (
        <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      )
    });
  }

  return (
    <div className={`h-full overflow-y-auto bg-white py-4 ${isMobile ? 'w-full' : 'w-64'}`}>
      {/* Logo et en-tête */}
      <div className="px-6 mb-6">
        <Link to="/" className="flex items-center">
          <svg className="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="ml-2 text-xl font-bold text-gray-900">MCP Assistant</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-1">
        {navItems.map((item, index) => (
          <div key={index} className="mb-2">
            {item.submenu ? (
              <>
                <button
                  onClick={() => toggleSection(item.name)}
                  className={`w-full text-left ${activeSection === item.name ? activeLinkClasses : inactiveLinkClasses}`}
                >
                  {item.icon}
                  <span>{item.name}</span>
                  <svg 
                    className={`ml-auto w-5 h-5 transition-transform ${activeSection === item.name ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Sous-menu */}
                {activeSection === item.name && (
                  <div className="mt-1 ml-6 space-y-1">
                    {item.submenu.map((subItem, subIndex) => (
                      <Link
                        key={subIndex}
                        to={subItem.path}
                        className={isActive(subItem.path) ? activeLinkClasses : inactiveLinkClasses}
                        onClick={isMobile && onClose ? onClose : undefined}
                      >
                        <span className="w-2 h-2 mr-3 bg-gray-400 rounded-full"></span>
                        {subItem.name}
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Link
                to={item.path}
                className={isActive(item.path) ? activeLinkClasses : inactiveLinkClasses}
                onClick={isMobile && onClose ? onClose : undefined}
              >
                {item.icon}
                {item.name}
              </Link>
            )}
          </div>
        ))}
      </nav>

      {/* Section inférieure */}
      <div className="px-3 mt-8">
        <div className="pt-4 border-t border-gray-200">
          <div className="px-3 py-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Informations
            </h3>
            <div className="mt-3 text-sm text-gray-600">
              <p className="mb-1">Version: 1.0.0</p>
              <a 
                href="/documentation" 
                className="text-blue-600 hover:underline flex items-center mt-2"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Documentation
              </a>
              <a 
                href="/support" 
                className="text-blue-600 hover:underline flex items-center mt-2"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
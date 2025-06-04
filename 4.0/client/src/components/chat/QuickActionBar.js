import React from 'react';

const QuickActionBar = ({ onAction }) => {
  const quickActions = [
    {
      label: 'Capture d\'écran',
      icon: 'fa-camera',
      value: 'Prendre une capture d\'écran de la page actuelle'
    },
    {
      label: 'Naviguer',
      icon: 'fa-globe',
      value: 'Naviguer vers https://'
    },
    {
      label: 'Rechercher',
      icon: 'fa-search',
      value: 'Rechercher des informations sur '
    },
    {
      label: 'Analyser',
      icon: 'fa-chart-line',
      value: 'Analyser le contenu de la page actuelle et fournir un résumé'
    }
  ];
  
  return (
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex justify-start overflow-x-auto space-x-2 pb-1">
        {quickActions.map((action, index) => (
          <button
            key={index}
            onClick={() => onAction(action.value)}
            className="flex items-center px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors whitespace-nowrap"
          >
            <i className={`fas ${action.icon} mr-1.5 text-blue-600`}></i>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActionBar;
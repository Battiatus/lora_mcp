import React, { useState } from 'react';
import { formatDate } from '../../../utils/helpers';

const ToolMessage = ({ message }) => {
  const { toolName, status, content, result, timestamp, args } = message;
  const [expanded, setExpanded] = useState(false);
  
  // Déterminer les couleurs en fonction du statut
  const getStatusColors = () => {
    switch (status) {
      case 'executing':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          text: 'text-yellow-700',
          icon: 'fas fa-spinner fa-spin'
        };
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-700',
          icon: 'fas fa-check-circle'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-700',
          icon: 'fas fa-times-circle'
        };
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-700',
          icon: 'fas fa-cog'
        };
    }
  };
  
  const colors = getStatusColors();
  
  return (
    <div className="flex justify-center my-4">
      <div className={`w-full max-w-2xl ${colors.bg} ${colors.text} border ${colors.border} rounded-lg overflow-hidden shadow-sm`}>
        <div className="flex items-center px-4 py-3 border-b border-opacity-50">
          <i className={`${colors.icon} mr-2`}></i>
          <div className="font-medium">{toolName}</div>
          <div className="ml-auto text-xs opacity-70">
            {formatDate(timestamp, { timeStyle: 'short' })}
          </div>
        </div>
        
        <div className="p-4">
          <div className="mb-2">{content}</div>
          
          {/* Arguments de l'outil */}
          {Object.keys(args || {}).length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-medium uppercase tracking-wide mb-1">Arguments</div>
              <div className="bg-white bg-opacity-50 p-2 rounded text-sm">
                {Object.entries(args).map(([key, value]) => (
                  <div key={key} className="mb-1">
                    <span className="font-mono">{key}:</span> {JSON.stringify(value)}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Résultat de l'outil */}
          {result && (
            <div className="mt-3">
              <div className="text-xs font-medium uppercase tracking-wide mb-1">Résultat</div>
              
              {typeof result === 'object' ? (
                <>
                  <div className="bg-white bg-opacity-50 p-2 rounded text-sm relative overflow-hidden">
                    <pre className={`whitespace-pre-wrap ${!expanded && 'max-h-32 overflow-hidden'}`}>
                      {JSON.stringify(result, null, 2)}
                    </pre>
                    
                    {!expanded && Object.keys(result).length > 5 && (
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent"></div>
                    )}
                  </div>
                  
                  {Object.keys(result).length > 5 && (
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="mt-1 text-xs hover:underline focus:outline-none"
                    >
                      {expanded ? 'Voir moins' : 'Voir plus'}
                    </button>
                  )}
                </>
              ) : (
                <div className="bg-white bg-opacity-50 p-2 rounded text-sm">
                  {String(result)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolMessage;
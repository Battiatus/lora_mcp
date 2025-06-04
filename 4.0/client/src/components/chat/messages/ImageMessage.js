import React from 'react';
import { formatDate } from '../../../utils/helpers';

const ImageMessage = ({ message, onClick }) => {
  const { content, timestamp } = message;
  
  return (
    <div className="flex justify-center my-4">
      <div className="max-w-lg border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
          <div className="text-sm font-medium text-gray-700">
            <i className="fas fa-camera mr-2"></i>
            Capture d'écran
          </div>
          <div className="text-xs text-gray-500">
            {formatDate(timestamp, { timeStyle: 'short' })}
          </div>
        </div>
        
        <div className="p-2 bg-white">
          <img
            src={content}
            alt="Capture d'écran"
            className="max-w-full h-auto rounded cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => onClick && onClick(content)}
          />
        </div>
        
        <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 text-right">
          <button
            onClick={() => onClick && onClick(content)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            <i className="fas fa-search-plus mr-1"></i>
            Agrandir
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageMessage;

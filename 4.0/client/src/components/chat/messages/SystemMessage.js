import React from 'react';
import { formatDate } from '../../../utils/helpers';

const SystemMessage = ({ message }) => {
  const { content, timestamp, type } = message;
  
  const isError = type === 'error';
  
  return (
    <div className="flex justify-center">
      <div className={`text-sm max-w-[90%] px-4 py-2 rounded-lg ${
        isError 
          ? 'bg-red-50 text-red-700 border border-red-200' 
          : 'bg-gray-100 text-gray-700'
      }`}>
        <div className="flex items-center">
          <i className={`mr-2 ${isError ? 'fas fa-exclamation-circle' : 'fas fa-info-circle'}`}></i>
          <span>{content}</span>
        </div>
        <div className="text-xs text-right mt-1 opacity-70">
          {formatDate(timestamp, { timeStyle: 'short' })}
        </div>
      </div>
    </div>
  );
};

export default SystemMessage;
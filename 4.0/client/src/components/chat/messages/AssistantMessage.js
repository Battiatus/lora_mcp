import React, { useState } from 'react';
import { formatDate } from '../../../utils/helpers';
import { formatMarkdown } from '../../../utils/formatters';

const AssistantMessage = ({ message }) => {
  const { content, timestamp } = message;
  const [expanded, setExpanded] = useState(false);
  
  // Vérifier si le message est long et devrait être tronqué
  const isLong = content.length > 500;
  const displayContent = isLong && !expanded ? `${content.substring(0, 500)}...` : content;
  
  // Formater le contenu (markdown, liens, etc.)
  const formattedContent = formatMarkdown(displayContent);
  
  return (
    <div className="flex flex-col">
      <div className="max-w-[80%] md:max-w-[70%]">
        <div className="flex items-center mb-1">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mr-2">
            <i className="fas fa-robot text-blue-600"></i>
          </div>
          <span className="text-xs text-gray-500">
            {formatDate(timestamp, { timeStyle: 'short' })}
          </span>
        </div>
        <div className="bg-white border border-gray-200 rounded-tr-lg rounded-br-lg rounded-bl-lg px-4 py-2 shadow-sm">
          <div 
            className="whitespace-pre-wrap prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: formattedContent }}
          />
          
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-blue-600 text-sm hover:text-blue-800 focus:outline-none"
            >
              {expanded ? 'Voir moins' : 'Voir plus'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssistantMessage;
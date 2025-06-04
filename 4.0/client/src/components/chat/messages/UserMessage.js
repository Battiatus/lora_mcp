import React from 'react';
import { formatDate } from '../../../utils/helpers';

const UserMessage = ({ message }) => {
  const { content, timestamp } = message;
  
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[80%] md:max-w-[70%]">
        <div className="flex justify-end mb-1">
          <span className="text-xs text-gray-500">
            {formatDate(timestamp, { timeStyle: 'short' })}
          </span>
        </div>
        <div className="bg-blue-600 text-white rounded-tl-lg rounded-tr-lg rounded-bl-lg px-4 py-2 shadow-sm">
          <div className="whitespace-pre-wrap">{content}</div>
        </div>
      </div>
    </div>
  );
};

export default UserMessage;
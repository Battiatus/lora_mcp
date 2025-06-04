import React, { useState } from 'react';
import UserMessage from './messages/UserMessage';
import AssistantMessage from './messages/AssistantMessage';
import SystemMessage from './messages/SystemMessage';
import ToolMessage from './messages/ToolMessage';
import ImageMessage from './messages/ImageMessage';

/**
 * Composant qui affiche la liste des messages de la conversation
 */
const MessagesList = ({ messages, onImageClick }) => {
  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const { id, sender, type, content } = message;
        
        switch (sender) {
          case 'user':
            return <UserMessage key={id} message={message} />;
            
          case 'assistant':
            return <AssistantMessage key={id} message={message} />;
            
          case 'system':
            return <SystemMessage key={id} message={message} />;
            
          case 'tool':
            return <ToolMessage key={id} message={message} />;
            
          case 'image':
            return <ImageMessage key={id} message={message} onClick={onImageClick} />;
            
          default:
            return null;
        }
      })}
    </div>
  );
};

export default MessagesList;
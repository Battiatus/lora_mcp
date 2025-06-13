import React, { useState, useRef, useEffect } from 'react';
import './Input.css';

function InputContainer({ onSendMessage, mode, typing, disabled }) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef(null);
  
  // Debug output pour comprendre les valeurs des props
  useEffect(() => {
    console.log("InputContainer props:", { mode, typing, disabled, hasMessage: Boolean(message.trim()) });
  }, [mode, typing, disabled, message]);
  
  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }, [message]);
  
  const handleChange = (e) => {
    setMessage(e.target.value);
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleSend = () => {
    // Vérifier si le message n'est pas vide et que l'interface n'est pas désactivée
    if (!message.trim() || disabled) {
      console.log("Impossible d'envoyer le message:", 
        !message.trim() ? "Message vide" : "Interface désactivée");
      return;
    }
    
    console.log("Envoi du message:", message);
    
    // Envoyer le message
    onSendMessage(message);
    
    // Effacer le message après l'envoi
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };
  
  // Déterminer si le bouton devrait être désactivé
  const isButtonDisabled = !message.trim() || disabled;
  
  return (
    <div className="input-container">
      <div className={`input-wrapper ${disabled ? 'disabled' : ''}`}>
        <textarea 
          id="messageInput"
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'task'
              ? 'Décrivez une tâche complexe à automatiser...'
              : 'Tapez votre message ou posez une question...'
          }
          rows="1"
          disabled={disabled} // Il est important de désactiver la zone de texte si disabled est true
          className={disabled ? 'disabled' : ''}
        />
        <div className="input-actions">
          <button 
            className={`send-btn ${isButtonDisabled ? 'disabled' : ''}`}
            onClick={handleSend}
            disabled={isButtonDisabled}
            title={
              disabled 
                ? "La session n'est pas active. Créez une nouvelle session."
                : !message.trim() 
                  ? "Veuillez entrer un message" 
                  : "Envoyer"
            }
          >
            <i className="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
      <div className="input-footer">
        <span className="input-hint">Appuyez sur Entrée pour envoyer, Maj+Entrée pour une nouvelle ligne</span>
        <div className={`typing-indicator ${typing ? 'show' : ''}`}>
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>L'assistant réfléchit...</span>
        </div>
      </div>
      
      {/* Message d'état pour indiquer pourquoi l'entrée est désactivée */}
      {disabled && (
        <div className="input-status-message">
          <i className="fas fa-info-circle"></i>
          Créez une nouvelle session pour commencer à discuter
        </div>
      )}
    </div>
  );
}

export default InputContainer;
import React from 'react';
import './SessionControls.css';

/**
 * Composant de contrôle des sessions
 * 
 * @param {Object} props
 * @param {boolean} props.connected - Indique si une session est connectée
 * @param {boolean} props.initializing - Indique si une session est en cours d'initialisation
 * @param {Function} props.onNewSession - Fonction à appeler pour créer une nouvelle session
 * @param {string} props.sessionId - ID de la session actuelle
 */
function SessionControls({ connected, initializing, onNewSession, sessionId }) {
  return (
    <div className="session-controls">
      {connected ? (
        <div className="session-status connected">
          <i className="fas fa-link"></i>
          <span>Session active: {sessionId ? sessionId.substring(0, 8) + '...' : 'Inconnue'}</span>
        </div>
      ) : (
        <div className="session-status disconnected">
          <i className="fas fa-unlink"></i>
          <span>Pas de session active</span>
        </div>
      )}
      
      <button 
        className="session-btn"
        onClick={onNewSession}
        disabled={initializing}
      >
        {initializing ? (
          <>
            <i className="fas fa-spinner fa-spin"></i>
            Initialisation...
          </>
        ) : (
          <>
            <i className="fas fa-plus-circle"></i>
            Nouvelle session
          </>
        )}
      </button>
    </div>
  );
}

export default SessionControls;
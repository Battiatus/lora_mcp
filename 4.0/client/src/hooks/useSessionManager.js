import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { executeTool, cleanupSession } from '../api/tools';

/**
 * Hook pour gérer les sessions d'outils MCP
 * @returns {Object} Méthodes et état de gestion de session
 */
export const useSessionManager = () => {
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]);

  // Créer une nouvelle session
  const createSession = useCallback(() => {
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    setResults([]);
    return newSessionId;
  }, []);

  // Exécuter un outil dans la session actuelle
  const executeToolInSession = useCallback(async (toolName, args) => {
    setLoading(true);
    setError(null);
    
    try {
      // Utiliser la session existante ou en créer une nouvelle
      const activeSessionId = sessionId || createSession();
      
      // Exécuter l'outil
      const response = await executeTool(toolName, args, activeSessionId);
      
      // Ajouter le résultat à l'historique
      const newResult = {
        id: Date.now(),
        toolName,
        args,
        result: response.data.result,
        timestamp: new Date().toISOString()
      };
      
      setResults(prev => [...prev, newResult]);
      return newResult;
    } catch (err) {
      setError(err.message || 'Erreur lors de l\'exécution de l\'outil');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [sessionId, createSession]);

  // Nettoyer la session
  const endSession = useCallback(async () => {
    if (sessionId) {
      setLoading(true);
      try {
        await cleanupSession(sessionId);
        setSessionId(null);
        setResults([]);
      } catch (err) {
        setError(err.message || 'Erreur lors du nettoyage de la session');
      } finally {
        setLoading(false);
      }
    }
  }, [sessionId]);

  // Nettoyer la session lors du démontage du composant
  useEffect(() => {
    return () => {
      if (sessionId) {
        cleanupSession(sessionId).catch(err => 
          console.error('Erreur lors du nettoyage de la session:', err)
        );
      }
    };
  }, [sessionId]);

  return {
    sessionId,
    results,
    loading,
    error,
    createSession,
    executeToolInSession,
    endSession
  };
};